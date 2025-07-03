"""
DynamoDB storage operations for TrackStore
"""

import boto3
from boto3.dynamodb.conditions import Key, Attr
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime, timedelta
import asyncio
from decimal import Decimal

from .models import LocationRecord, DeviceStatus

logger = logging.getLogger(__name__)

class DynamoStore:
    """Handles all DynamoDB operations"""
    
    def __init__(self, device_table: str, location_table: str, region: str = "us-east-1"):
        self.dynamodb = boto3.resource('dynamodb', region_name=region)
        self.device_table = self.dynamodb.Table(device_table)
        self.location_table = self.dynamodb.Table(location_table)
        self.device_table_name = device_table
        self.location_table_name = location_table
        
    async def health_check(self) -> bool:
        """Check if DynamoDB tables are accessible"""
        try:
            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            
            # Get table descriptions
            device_status = await loop.run_in_executor(
                None, 
                lambda: self.device_table.table_status
            )
            location_status = await loop.run_in_executor(
                None, 
                lambda: self.location_table.table_status
            )
            
            return device_status == 'ACTIVE' and location_status == 'ACTIVE'
        except Exception as e:
            logger.error(f"DynamoDB health check failed: {str(e)}")
            return False
    
    async def store_location(self, location: LocationRecord) -> bool:
        """Store a single location record"""
        try:
            # Convert to DynamoDB item
            item = {
                'deviceId': location.device_id,
                'timestamp': location.timestamp,
                'latitude': Decimal(str(location.latitude)),
                'longitude': Decimal(str(location.longitude)),
                'date': datetime.fromtimestamp(location.timestamp / 1000).strftime('%Y-%m-%d'),
                'ttl': int((datetime.utcnow() + timedelta(days=30)).timestamp())
            }
            
            # Add optional fields
            if location.speed is not None:
                item['speed'] = Decimal(str(location.speed))
            if location.heading is not None:
                item['heading'] = location.heading
            if location.accuracy is not None:
                item['accuracy'] = Decimal(str(location.accuracy))
            if location.processed_at:
                item['processedAt'] = location.processed_at
            if location.region:
                item['region'] = location.region
            if location.quality_score:
                item['qualityScore'] = location.quality_score
            
            # Store in DynamoDB
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self.location_table.put_item, {'Item': item})
            
            # Update device status
            await self.update_device_status(location)
            
            return True
            
        except Exception as e:
            logger.error(f"Error storing location: {str(e)}")
            return False
    
    async def store_locations_batch(self, locations: List[LocationRecord]) -> int:
        """Store multiple locations in batch"""
        if not locations:
            return 0
            
        success_count = 0
        
        try:
            # Process in batches of 25 (DynamoDB limit)
            for i in range(0, len(locations), 25):
                batch = locations[i:i+25]
                
                with self.location_table.batch_writer() as batch_writer:
                    for location in batch:
                        item = {
                            'deviceId': location.device_id,
                            'timestamp': location.timestamp,
                            'latitude': Decimal(str(location.latitude)),
                            'longitude': Decimal(str(location.longitude)),
                            'date': datetime.fromtimestamp(location.timestamp / 1000).strftime('%Y-%m-%d'),
                            'ttl': int((datetime.utcnow() + timedelta(days=30)).timestamp())
                        }
                        
                        if location.speed is not None:
                            item['speed'] = Decimal(str(location.speed))
                        if location.heading is not None:
                            item['heading'] = location.heading
                        if location.accuracy is not None:
                            item['accuracy'] = Decimal(str(location.accuracy))
                        
                        batch_writer.put_item(Item=item)
                        success_count += 1
                
                # Update device statuses
                for location in batch:
                    await self.update_device_status(location)
                    
        except Exception as e:
            logger.error(f"Error in batch write: {str(e)}")
            
        return success_count
    
    async def update_device_status(self, location: LocationRecord):
        """Update device status with latest location"""
        try:
            loop = asyncio.get_event_loop()
            
            # Update device table
            update_expr = """
                SET lastSeen = :ts,
                    lastLocation = :loc,
                    #status = :status,
                    totalUpdates = if_not_exists(totalUpdates, :zero) + :one
            """
            
            await loop.run_in_executor(
                None,
                lambda: self.device_table.update_item(
                    Key={'deviceId': location.device_id},
                    UpdateExpression=update_expr,
                    ExpressionAttributeNames={'#status': 'status'},
                    ExpressionAttributeValues={
                        ':ts': location.timestamp,
                        ':loc': {
                            'lat': Decimal(str(location.latitude)),
                            'lon': Decimal(str(location.longitude))
                        },
                        ':status': 'active',
                        ':zero': 0,
                        ':one': 1
                    }
                )
            )
            
        except Exception as e:
            logger.error(f"Error updating device status: {str(e)}")
    
    async def get_device_locations(
        self,
        device_id: str,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        limit: int = 100
    ) -> List[LocationRecord]:
        """Get location history for a device"""
        try:
            loop = asyncio.get_event_loop()
            
            # Build query parameters
            key_condition = Key('deviceId').eq(device_id)
            
            if start_time and end_time:
                key_condition = key_condition & Key('timestamp').between(start_time, end_time)
            elif start_time:
                key_condition = key_condition & Key('timestamp').gte(start_time)
            elif end_time:
                key_condition = key_condition & Key('timestamp').lte(end_time)
            
            # Query DynamoDB
            response = await loop.run_in_executor(
                None,
                lambda: self.location_table.query(
                    KeyConditionExpression=key_condition,
                    ScanIndexForward=False,  # Most recent first
                    Limit=limit
                )
            )
            
            # Convert to LocationRecord objects
            locations = []
            for item in response.get('Items', []):
                locations.append(LocationRecord(
                    busId=item['deviceId'],
                    lat=float(item['latitude']),
                    lon=float(item['longitude']),
                    ts=item['timestamp'],
                    speed=float(item.get('speed', 0)) if 'speed' in item else None,
                    heading=item.get('heading'),
                    accuracy=float(item.get('accuracy', 0)) if 'accuracy' in item else None,
                    processed_at=item.get('processedAt'),
                    region=item.get('region'),
                    quality_score=item.get('qualityScore')
                ))
            
            return locations
            
        except Exception as e:
            logger.error(f"Error fetching locations: {str(e)}")
            return []
    
    async def get_latest_location(self, device_id: str) -> Optional[LocationRecord]:
        """Get the most recent location for a device"""
        locations = await self.get_device_locations(device_id, limit=1)
        return locations[0] if locations else None
    
    async def get_all_devices(self) -> List[DeviceStatus]:
        """Get all registered devices"""
        try:
            loop = asyncio.get_event_loop()
            
            # Scan device table
            response = await loop.run_in_executor(
                None,
                self.device_table.scan
            )
            
            devices = []
            for item in response.get('Items', []):
                last_loc = item.get('lastLocation', {})
                devices.append(DeviceStatus(
                    device_id=item['deviceId'],
                    last_seen=item.get('lastSeen'),
                    last_location={
                        'lat': float(last_loc.get('lat', 0)),
                        'lon': float(last_loc.get('lon', 0))
                    } if last_loc else None,
                    status=item.get('status', 'unknown'),
                    registered_at=item.get('registeredAt', 0),
                    attributes=item.get('attributes', {}),
                    total_updates=item.get('totalUpdates', 0)
                ))
            
            return devices
            
        except Exception as e:
            logger.error(f"Error fetching devices: {str(e)}")
            return []
    
    async def get_device_status(self, device_id: str) -> Optional[DeviceStatus]:
        """Get status for a specific device"""
        try:
            loop = asyncio.get_event_loop()
            
            response = await loop.run_in_executor(
                None,
                lambda: self.device_table.get_item(Key={'deviceId': device_id})
            )
            
            item = response.get('Item')
            if not item:
                return None
            
            last_loc = item.get('lastLocation', {})
            return DeviceStatus(
                device_id=item['deviceId'],
                last_seen=item.get('lastSeen'),
                last_location={
                    'lat': float(last_loc.get('lat', 0)),
                    'lon': float(last_loc.get('lon', 0))
                } if last_loc else None,
                status=item.get('status', 'unknown'),
                registered_at=item.get('registeredAt', 0),
                attributes=item.get('attributes', {}),
                total_updates=item.get('totalUpdates', 0)
            )
            
        except Exception as e:
            logger.error(f"Error fetching device: {str(e)}")
            return None
    
    async def register_device(self, device_id: str, device_info: Dict[str, Any]):
        """Register a new device"""
        try:
            loop = asyncio.get_event_loop()
            
            item = {
                'deviceId': device_id,
                'registeredAt': int(datetime.utcnow().timestamp() * 1000),
                'status': 'inactive',
                'attributes': device_info
            }
            
            await loop.run_in_executor(
                None,
                lambda: self.device_table.put_item(Item=item)
            )
            
        except Exception as e:
            logger.error(f"Error registering device: {str(e)}")
            raise