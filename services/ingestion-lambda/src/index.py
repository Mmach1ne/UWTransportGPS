"""
GPS Data Ingestion Lambda
Validates and forwards IoT GPS data to Kinesis Data Streams
"""

import json
import boto3
import os
from datetime import datetime
from typing import Dict, Any, List, Optional
import logging

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS X-Ray tracing
try:
    from aws_xray_sdk.core import xray_recorder
    from aws_xray_sdk.core import patch_all
    # Patch boto3 to enable X-Ray tracing
    patch_all()
    XRAY_AVAILABLE = True
except ImportError:
    # X-Ray SDK not available - Lambda will still trace basic calls
    XRAY_AVAILABLE = False
    logger.info("X-Ray SDK not available, using basic tracing")

# Initialize Kinesis client
kinesis = boto3.client('kinesis')

# Environment variables
STREAM_NAME = os.environ.get('KINESIS_STREAM_NAME', 'transport-gps-stream-dev')
MAX_LAT = 90.0
MIN_LAT = -90.0
MAX_LON = 180.0
MIN_LON = -180.0

class ValidationError(Exception):
    """Custom exception for validation errors"""
    pass

def validate_gps_coordinates(lat: float, lon: float) -> bool:
    """Validate GPS coordinates are within valid ranges"""
    if not isinstance(lat, (int, float)) or not MIN_LAT <= lat <= MAX_LAT:
        raise ValidationError(f"Invalid latitude: {lat}. Must be between {MIN_LAT} and {MAX_LAT}")
    
    if not isinstance(lon, (int, float)) or not MIN_LON <= lon <= MAX_LON:
        raise ValidationError(f"Invalid longitude: {lon}. Must be between {MIN_LON} and {MAX_LON}")
    
    return True

def validate_timestamp(ts: int) -> bool:
    """Validate timestamp is reasonable (not in future, not too old)"""
    if not isinstance(ts, int) or ts < 0:
        raise ValidationError(f"Invalid timestamp: {ts}. Must be a positive integer")
    
    current_time = int(datetime.utcnow().timestamp() * 1000)
    
    # Check if timestamp is not more than 1 hour in the future
    if ts > current_time + 3600000:
        raise ValidationError(f"Timestamp {ts} is too far in the future")
    
    # Check if timestamp is not older than 24 hours
    if ts < current_time - 86400000:
        raise ValidationError(f"Timestamp {ts} is too old (>24 hours)")
    
    return True

def validate_bus_id(bus_id: str) -> bool:
    """Validate bus ID format"""
    if not isinstance(bus_id, str) or len(bus_id) == 0:
        raise ValidationError("Bus ID must be a non-empty string")
    
    if len(bus_id) > 50:
        raise ValidationError("Bus ID must be less than 50 characters")
    
    # Only allow alphanumeric, dash, and underscore
    if not all(c.isalnum() or c in ['-', '_'] for c in bus_id):
        raise ValidationError("Bus ID can only contain letters, numbers, dash, and underscore")
    
    return True

def validate_message(message: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate incoming GPS message
    
    Required fields:
    - busId: string identifier for the bus
    - lat: latitude (-90 to 90)
    - lon: longitude (-180 to 180)
    - ts: timestamp in milliseconds
    
    Optional fields:
    - speed: speed in km/h
    - heading: direction in degrees (0-359)
    - accuracy: GPS accuracy in meters
    """
    # Check required fields
    required_fields = ['busId', 'lat', 'lon', 'ts']
    for field in required_fields:
        if field not in message:
            raise ValidationError(f"Missing required field: {field}")
    
    # Validate each field
    validate_bus_id(message['busId'])
    validate_gps_coordinates(message['lat'], message['lon'])
    validate_timestamp(message['ts'])
    
    # Validate optional fields if present
    if 'speed' in message:
        speed = message['speed']
        if not isinstance(speed, (int, float)) or speed < 0 or speed > 200:
            raise ValidationError(f"Invalid speed: {speed}. Must be between 0 and 200 km/h")
    
    if 'heading' in message:
        heading = message['heading']
        if not isinstance(heading, (int, float)) or heading < 0 or heading >= 360:
            raise ValidationError(f"Invalid heading: {heading}. Must be between 0 and 359 degrees")
    
    if 'accuracy' in message:
        accuracy = message['accuracy']
        if not isinstance(accuracy, (int, float)) or accuracy < 0 or accuracy > 1000:
            raise ValidationError(f"Invalid accuracy: {accuracy}. Must be between 0 and 1000 meters")
    
    return message

def enrich_message(message: Dict[str, Any]) -> Dict[str, Any]:
    """Add metadata to the message"""
    enriched = {
        **message,
        'processed_at': int(datetime.utcnow().timestamp() * 1000),
        'processor_version': '1.0.0',
        'valid': True
    }
    
    # Add computed fields
    # Determine rough region based on coordinates (example)
    lat, lon = message['lat'], message['lon']
    if 37.7 <= lat <= 37.8 and -122.5 <= lon <= -122.4:
        enriched['region'] = 'san_francisco'
    else:
        enriched['region'] = 'other'
    
    # Add data quality score based on accuracy
    if 'accuracy' in message:
        if message['accuracy'] <= 10:
            enriched['quality_score'] = 'high'
        elif message['accuracy'] <= 50:
            enriched['quality_score'] = 'medium'
        else:
            enriched['quality_score'] = 'low'
    
    return enriched

def send_to_kinesis(message: Dict[str, Any], bus_id: str) -> Dict[str, Any]:
    """Send validated message to Kinesis stream"""
    try:
        # Add X-Ray annotation if available
        if XRAY_AVAILABLE:
            xray_recorder.begin_subsegment('kinesis_put_record')
            xray_recorder.current_subsegment().put_annotation('bus_id', bus_id)
            xray_recorder.current_subsegment().put_annotation('stream_name', STREAM_NAME)
        
        response = kinesis.put_record(
            StreamName=STREAM_NAME,
            Data=json.dumps(message),
            PartitionKey=bus_id  # Use busId to ensure all data from same bus goes to same shard
        )
        
        logger.info(f"Successfully sent to Kinesis: {response['SequenceNumber']} for bus {bus_id}")
        
        # Add response metadata to X-Ray
        if XRAY_AVAILABLE:
            xray_recorder.current_subsegment().put_metadata('kinesis_response', {
                'sequence_number': response['SequenceNumber'],
                'shard_id': response['ShardId']
            })
            xray_recorder.end_subsegment()
        
        return response
        
    except Exception as e:
        logger.error(f"Failed to send to Kinesis: {str(e)}")
        if XRAY_AVAILABLE and xray_recorder.current_subsegment():
            xray_recorder.current_subsegment().add_exception(e)
            xray_recorder.end_subsegment()
        raise

def handler(event: Any, context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler
    
    Args:
        event: IoT message or test event
        context: Lambda context
    
    Returns:
        Response with status code and body
    """
    logger.info(f"Received event: {json.dumps(event)}")
    
    # Add X-Ray annotations for the main handler
    if XRAY_AVAILABLE and context:
        xray_recorder.put_annotation('function_name', context.function_name)
        xray_recorder.put_annotation('request_id', context.aws_request_id)
    
    try:
        # Parse the incoming message
        # IoT Core sends the message directly, not wrapped
        if isinstance(event, str):
            message = json.loads(event)
        elif isinstance(event, dict):
            # For testing, support wrapped format
            if 'body' in event and isinstance(event['body'], str):
                message = json.loads(event['body'])
            else:
                message = event
        else:
            raise ValidationError("Invalid event format")
        
        # Validate the message
        validated_message = validate_message(message)
        
        # Enrich the message
        enriched_message = enrich_message(validated_message)
        
        # Send to Kinesis
        kinesis_response = send_to_kinesis(enriched_message, message['busId'])
        
        # Log successful processing
        logger.info(f"Successfully processed message from bus {message['busId']}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Successfully processed',
                'busId': message['busId'],
                'sequenceNumber': kinesis_response['SequenceNumber'],
                'shardId': kinesis_response['ShardId']
            })
        }
        
    except ValidationError as e:
        logger.warning(f"Validation error: {str(e)}")
        return {
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Validation Error',
                'message': str(e)
            })
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing error: {str(e)}")
        return {
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Invalid JSON',
                'message': str(e)
            })
        }
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': str(e)
            })
        }

# For local testing
if __name__ == "__main__":
    # Test event
    test_event = {
        "busId": "bus-001",
        "lat": 37.7749,
        "lon": -122.4194,
        "ts": int(datetime.utcnow().timestamp() * 1000),
        "speed": 30.5,
        "heading": 45,
        "accuracy": 5.2
    }
    
    # Test the handler
    result = handler(test_event, None)
    print(json.dumps(result, indent=2))