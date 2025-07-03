"""
Kinesis consumer for TrackStore service
"""

import boto3
import json
import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import time

from .models import LocationRecord, KinesisRecord
from .dynamo_store import DynamoStore

logger = logging.getLogger(__name__)

class KinesisConsumer:
    """Consumes GPS data from Kinesis stream"""
    
    def __init__(
        self,
        stream_name: str,
        region: str,
        dynamo_store: DynamoStore,
        shard_iterator_type: str = "LATEST",
        batch_size: int = 100,
        poll_interval: float = 1.0
    ):
        self.stream_name = stream_name
        self.kinesis_client = boto3.client('kinesis', region_name=region)
        self.dynamo_store = dynamo_store
        self.shard_iterator_type = shard_iterator_type
        self.batch_size = batch_size
        self.poll_interval = poll_interval
        
        self.is_running = False
        self.records_processed = 0
        self.error_count = 0
        self.last_sequence_number = None
        self.last_record_time = None
        
    async def start_consuming(self):
        """Start consuming from Kinesis stream"""
        self.is_running = True
        self._start_time = time.time()
        logger.info(f"Starting Kinesis consumer for stream: {self.stream_name}")
        
        try:
            # Get stream description
            stream_desc = await self._describe_stream()
            shards = stream_desc['StreamDescription']['Shards']
            
            if not shards:
                logger.warning(f"No shards found in stream {self.stream_name}")
                # Keep running but no shards to consume
                while self.is_running:
                    await asyncio.sleep(30)
                return
            
            # Create tasks for each shard
            tasks = []
            for shard in shards:
                task = asyncio.create_task(self._consume_shard(shard['ShardId']))
                tasks.append(task)
            
            # Run all shard consumers
            await asyncio.gather(*tasks)
            
        except Exception as e:
            logger.error(f"Error in Kinesis consumer: {str(e)}")
            self.error_count += 1
            # Don't crash the service, just log the error
            if "AccessDeniedException" in str(e):
                logger.error("Permission denied accessing Kinesis. Check IAM roles.")
            elif "ResourceNotFoundException" in str(e):
                logger.error(f"Kinesis stream {self.stream_name} not found.")
            
    async def stop_consuming(self):
        """Stop consuming from Kinesis"""
        logger.info("Stopping Kinesis consumer...")
        self.is_running = False
        
    def is_healthy(self) -> bool:
        """Check if consumer is healthy"""
        # During startup, consider healthy if running
        if not self.is_running:
            return False
            
        # If we haven't processed any records yet, still consider healthy for first 5 minutes
        if self.records_processed == 0 and hasattr(self, '_start_time'):
            startup_grace_period = 300  # 5 minutes
            if time.time() - self._start_time < startup_grace_period:
                return True
        
        # Check if we've received data recently (within 5 minutes)
        if self.last_record_time:
            time_since_last = time.time() - self.last_record_time
            if time_since_last > 300:  # 5 minutes
                return False
                
        return True
    
    def get_lag_ms(self) -> Optional[int]:
        """Get consumer lag in milliseconds"""
        if not self.last_record_time:
            return None
        return int((time.time() - self.last_record_time) * 1000)
    
    async def _describe_stream(self) -> Dict[str, Any]:
        """Get stream description"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.kinesis_client.describe_stream(StreamName=self.stream_name)
        )
    
    async def _get_shard_iterator(self, shard_id: str) -> str:
        """Get shard iterator"""
        loop = asyncio.get_event_loop()
        
        params = {
            'StreamName': self.stream_name,
            'ShardId': shard_id,
            'ShardIteratorType': self.shard_iterator_type
        }
        
        # If we have a sequence number, start after it
        if self.last_sequence_number and self.shard_iterator_type == "AFTER_SEQUENCE_NUMBER":
            params['StartingSequenceNumber'] = self.last_sequence_number
        
        response = await loop.run_in_executor(
            None,
            lambda: self.kinesis_client.get_shard_iterator(**params)
        )
        
        return response['ShardIterator']
    
    async def _consume_shard(self, shard_id: str):
        """Consume records from a single shard"""
        logger.info(f"Starting consumer for shard: {shard_id}")
        
        # Get initial iterator
        shard_iterator = await self._get_shard_iterator(shard_id)
        
        while self.is_running and shard_iterator:
            try:
                # Get records
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None,
                    lambda: self.kinesis_client.get_records(
                        ShardIterator=shard_iterator,
                        Limit=self.batch_size
                    )
                )
                
                records = response.get('Records', [])
                
                if records:
                    # Process records
                    await self._process_records(records)
                    
                    # Update last sequence number
                    self.last_sequence_number = records[-1]['SequenceNumber']
                    self.last_record_time = time.time()
                
                # Get next iterator
                shard_iterator = response.get('NextShardIterator')
                
                # If no records, wait before polling again
                if not records:
                    await asyncio.sleep(self.poll_interval)
                    
            except Exception as e:
                logger.error(f"Error consuming from shard {shard_id}: {str(e)}")
                self.error_count += 1
                
                # Wait before retrying
                await asyncio.sleep(5)
                
                # Try to get a new iterator
                try:
                    shard_iterator = await self._get_shard_iterator(shard_id)
                except Exception as e:
                    logger.error(f"Failed to get new iterator: {str(e)}")
                    break
    
    async def _process_records(self, records: List[Dict[str, Any]]):
        """Process a batch of Kinesis records"""
        locations = []
        
        for record in records:
            try:
                # Decode the data
                data = json.loads(record['Data'])
                
                # Create LocationRecord
                location = LocationRecord(
                    busId=data.get('busId'),
                    lat=data.get('lat'),
                    lon=data.get('lon'),
                    ts=data.get('ts'),
                    speed=data.get('speed'),
                    heading=data.get('heading'),
                    accuracy=data.get('accuracy'),
                    processed_at=data.get('processed_at'),
                    region=data.get('region'),
                    quality_score=data.get('quality_score')
                )
                
                locations.append(location)
                
            except Exception as e:
                logger.error(f"Error processing record: {str(e)}")
                self.error_count += 1
        
        # Store locations in batch
        if locations:
            stored_count = await self.dynamo_store.store_locations_batch(locations)
            self.records_processed += stored_count
            logger.info(f"Processed {stored_count} locations from Kinesis")