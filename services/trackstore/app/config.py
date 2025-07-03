"""
Configuration for TrackStore service
"""

from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    """Application settings"""
    
    # AWS Configuration
    AWS_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    
    # Kinesis Configuration
    KINESIS_STREAM_NAME: str = "transport-gps-stream-dev"
    KINESIS_SHARD_ITERATOR_TYPE: str = "LASTEST"
    KINESIS_BATCH_SIZE: int = 100
    KINESIS_POLL_INTERVAL: float = 1.0
    
    # DynamoDB Configuration
    DEVICE_TABLE_NAME: str = "transport-devices-dev"
    LOCATION_TABLE_NAME: str = "transport-locations-dev"
    
    # Service Configuration
    SERVICE_NAME: str = "trackstore"
    LOG_LEVEL: str = "INFO"
    
    # Performance
    BATCH_WRITE_SIZE: int = 25  # DynamoDB batch write limit
    LOCATION_TTL_DAYS: int = 30  # How long to keep location data
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()