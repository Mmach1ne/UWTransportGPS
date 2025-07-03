"""
TrackStore Service - Main Application
Consumes GPS data from Kinesis and stores in DynamoDB
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncio
import logging
from datetime import datetime
import os

from .config import settings
from .kinesis_consumer import KinesisConsumer
from .models import LocationRecord, DeviceStatus, HealthStatus
from .dynamo_store import DynamoStore

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
kinesis_consumer = None
dynamo_store = None
consumer_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    global kinesis_consumer, dynamo_store, consumer_task
    
    # Startup
    logger.info("Starting TrackStore service...")
    
    # Initialize DynamoDB store
    dynamo_store = DynamoStore(
        device_table=settings.DEVICE_TABLE_NAME,
        location_table=settings.LOCATION_TABLE_NAME,
        region=settings.AWS_REGION
    )
    
    # Initialize Kinesis consumer
    kinesis_consumer = KinesisConsumer(
        stream_name=settings.KINESIS_STREAM_NAME,
        region=settings.AWS_REGION,
        dynamo_store=dynamo_store
    )
    
    # Start consuming in background
    consumer_task = asyncio.create_task(kinesis_consumer.start_consuming())
    logger.info("Started Kinesis consumer")
    
    yield
    
    # Shutdown
    logger.info("Shutting down TrackStore service...")
    if kinesis_consumer:
        await kinesis_consumer.stop_consuming()
    if consumer_task:
        consumer_task.cancel()
        try:
            await consumer_task
        except asyncio.CancelledError:
            pass

# Create FastAPI app
app = FastAPI(
    title="TrackStore Service",
    description="GPS tracking data storage service",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", response_model=dict)
async def root():
    """Root endpoint"""
    return {
        "service": "TrackStore",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health", response_model=HealthStatus)
async def health_check():
    """Health check endpoint"""
    try:
        # Basic health check - service is running
        health = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "components": {}
        }
        
        # Check Kinesis consumer if initialized
        if kinesis_consumer:
            health["components"]["kinesis_consumer"] = "healthy" if kinesis_consumer.is_healthy() else "degraded"
        else:
            health["components"]["kinesis_consumer"] = "initializing"
        
        # Check DynamoDB if initialized
        if dynamo_store:
            try:
                dynamo_healthy = await dynamo_store.health_check()
                health["components"]["dynamo_store"] = "healthy" if dynamo_healthy else "unhealthy"
            except:
                health["components"]["dynamo_store"] = "unhealthy"
        else:
            health["components"]["dynamo_store"] = "initializing"
        
        # Overall status
        if "unhealthy" in health["components"].values():
            health["status"] = "unhealthy"
            return JSONResponse(content=health, status_code=503)
        elif "initializing" in health["components"].values():
            health["status"] = "starting"
            # Return 200 during startup to pass ALB health checks
            return JSONResponse(content=health, status_code=200)
        
        return HealthStatus(**health)
        
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return JSONResponse(
            content={
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            },
            status_code=503
        )

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    if not kinesis_consumer:
        return JSONResponse(content={"error": "Service not initialized"}, status_code=503)
    
    return JSONResponse(content={
        "records_processed": kinesis_consumer.records_processed,
        "errors": kinesis_consumer.error_count,
        "last_sequence_number": kinesis_consumer.last_sequence_number,
        "consumer_lag_ms": kinesis_consumer.get_lag_ms()
    })

@app.get("/locations/{device_id}", response_model=list[LocationRecord])
async def get_device_locations(
    device_id: str,
    start_time: int = None,
    end_time: int = None,
    limit: int = 100
):
    """Get location history for a device"""
    if not dynamo_store:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        locations = await dynamo_store.get_device_locations(
            device_id=device_id,
            start_time=start_time,
            end_time=end_time,
            limit=limit
        )
        return locations
    except Exception as e:
        logger.error(f"Error fetching locations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/locations/{device_id}/latest", response_model=LocationRecord)
async def get_latest_location(device_id: str):
    """Get latest location for a device"""
    if not dynamo_store:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        location = await dynamo_store.get_latest_location(device_id)
        if not location:
            raise HTTPException(status_code=404, detail="No location found for device")
        return location
    except Exception as e:
        logger.error(f"Error fetching latest location: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/devices", response_model=list[DeviceStatus])
async def get_all_devices():
    """Get all registered devices with their status"""
    if not dynamo_store:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        devices = await dynamo_store.get_all_devices()
        return devices
    except Exception as e:
        logger.error(f"Error fetching devices: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/devices/{device_id}", response_model=DeviceStatus)
async def get_device_status(device_id: str):
    """Get status for a specific device"""
    if not dynamo_store:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        device = await dynamo_store.get_device_status(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        return device
    except Exception as e:
        logger.error(f"Error fetching device: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/devices/{device_id}/register")
async def register_device(device_id: str, device_info: dict = None):
    """Register a new device"""
    if not dynamo_store:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        await dynamo_store.register_device(device_id, device_info or {})
        return {"message": f"Device {device_id} registered successfully"}
    except Exception as e:
        logger.error(f"Error registering device: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Error handlers
@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )