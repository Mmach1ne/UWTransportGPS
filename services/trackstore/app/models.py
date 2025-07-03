"""
Data models for TrackStore service
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime

class LocationRecord(BaseModel):
    """GPS location record"""
    device_id: str = Field(..., alias="busId")
    latitude: float = Field(..., alias="lat")
    longitude: float = Field(..., alias="lon")
    timestamp: int = Field(..., alias="ts")
    speed: Optional[float] = None
    heading: Optional[int] = None
    accuracy: Optional[float] = None
    processed_at: Optional[int] = None
    region: Optional[str] = None
    quality_score: Optional[str] = None
    
    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: int(v.timestamp() * 1000)
        }

class DeviceStatus(BaseModel):
    """Device status information"""
    device_id: str
    last_seen: Optional[int] = None
    last_location: Optional[Dict[str, float]] = None
    status: str = "unknown"  # active, inactive, unknown
    registered_at: int
    attributes: Optional[Dict[str, Any]] = None
    total_updates: int = 0

class HealthStatus(BaseModel):
    """Service health status"""
    status: str  # healthy, unhealthy
    timestamp: str
    components: Dict[str, str]

class KinesisRecord(BaseModel):
    """Kinesis stream record"""
    data: Dict[str, Any]
    sequence_number: str
    partition_key: str
    approximate_arrival_timestamp: float