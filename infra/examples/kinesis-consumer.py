#!/usr/bin/env python3
"""
Example Kinesis consumer to read GPS data from the stream
"""

import boto3
import json
import time
from datetime import datetime

def consume_kinesis_stream(stream_name, region='us-east-1'):
    """
    Simple consumer that reads from Kinesis stream
    """
    kinesis = boto3.client('kinesis', region_name=region)
    
    # Get stream description
    response = kinesis.describe_stream(StreamName=stream_name)
    shards = response['StreamDescription']['Shards']
    
    print(f"Stream: {stream_name}")
    print(f"Number of shards: {len(shards)}")
    print(f"Status: {response['StreamDescription']['StreamStatus']}")
    print("\nStarting to consume messages...\n")
    
    # For simplicity, just read from the first shard
    if shards:
        shard_id = shards[0]['ShardId']
        
        # Get shard iterator (start from latest)
        response = kinesis.get_shard_iterator(
            StreamName=stream_name,
            ShardId=shard_id,
            ShardIteratorType='LATEST'  # or 'TRIM_HORIZON' to read from beginning
        )
        
        shard_iterator = response['ShardIterator']
        
        # Continuously read from the stream
        while True:
            try:
                response = kinesis.get_records(
                    ShardIterator=shard_iterator,
                    Limit=10
                )
                
                records = response['Records']
                
                for record in records:
                    # Decode the data
                    data = json.loads(record['Data'])
                    
                    # Convert timestamps to readable format
                    device_time = datetime.fromtimestamp(data['ts'] / 1000)
                    processed_time = datetime.fromtimestamp(data.get('processed_at', 0) / 1000)
                    
                    print(f"=== GPS Update ===")
                    print(f"Bus ID: {data['busId']}")
                    print(f"Location: ({data['lat']}, {data['lon']})")
                    print(f"Speed: {data.get('speed', 'N/A')} km/h")
                    print(f"Device Time: {device_time}")
                    print(f"Processed At: {processed_time}")
                    print(f"Sequence: {record['SequenceNumber']}")
                    print("-" * 40)
                
                # Update iterator for next batch
                shard_iterator = response['NextShardIterator']
                
                # If no records, wait a bit
                if not records:
                    time.sleep(1)
                    
            except Exception as e:
                print(f"Error reading from stream: {e}")
                break

if __name__ == "__main__":
    # Replace with your actual stream name
    stream_name = "transport-gps-stream-dev"
    consume_kinesis_stream(stream_name)