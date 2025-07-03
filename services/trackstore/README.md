# TrackStore Service

A FastAPI-based microservice that consumes GPS tracking data from Kinesis and stores it in DynamoDB. This service is designed to run on AWS Fargate and provides REST APIs for querying location history and device status.

## Features

- **Real-time Processing**: Consumes GPS data from Kinesis Data Streams
- **Batch Storage**: Efficiently stores location data in DynamoDB
- **RESTful API**: Query endpoints for location history and device status
- **Auto-scaling**: Scales based on CPU utilization
- **Health Monitoring**: Health check endpoints and metrics
- **X-Ray Tracing**: Distributed tracing support

## API Endpoints

### Core Endpoints

- `GET /` - Service info
- `GET /health` - Health check
- `GET /metrics` - Prometheus-style metrics

### Location Endpoints

- `GET /locations/{device_id}` - Get location history
  - Query params: `start_time`, `end_time`, `limit`
- `GET /locations/{device_id}/latest` - Get latest location

### Device Endpoints

- `GET /devices` - List all devices
- `GET /devices/{device_id}` - Get device status
- `POST /devices/{device_id}/register` - Register new device

## Local Development

### Prerequisites

- Python 3.11+
- Docker (for containerized testing)
- AWS credentials configured

### Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create `.env` file:
```bash
cp .env.template .env
# Edit .env with your AWS resources
```

4. Run locally:
```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Docker Testing

1. Build image:
```bash
docker build -t trackstore .
```

2. Run container:
```bash
docker run -p 8000:8000 --env-file .env trackstore
```

## Deployment

The service is deployed using AWS CDK as part of the infrastructure stack:

```bash
cd ../../infra
yarn cdk deploy TrackStore-dev --context env=dev
```

This creates:
- Fargate service with auto-scaling
- Application Load Balancer
- CloudWatch logs
- IAM roles with appropriate permissions

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_REGION` | AWS region | us-east-1 |
| `KINESIS_STREAM_NAME` | Kinesis stream to consume | transport-gps-stream-dev |
| `DEVICE_TABLE_NAME` | DynamoDB table for devices | transport-devices-dev |
| `LOCATION_TABLE_NAME` | DynamoDB table for locations | transport-locations-dev |
| `KINESIS_BATCH_SIZE` | Records per Kinesis read | 100 |
| `LOCATION_TTL_DAYS` | Days to retain location data | 30 |

## Architecture

```
Kinesis Stream → TrackStore Service → DynamoDB Tables
                       ↓
                  REST API → Clients
```

### Data Flow

1. Kinesis consumer reads GPS records
2. Validates and enriches data
3. Batch writes to DynamoDB
4. Updates device status
5. Provides query API for clients

### DynamoDB Schema

**Devices Table**:
- Partition Key: `deviceId` (String)
- Attributes: `lastSeen`, `lastLocation`, `status`, `totalUpdates`

**Locations Table**:
- Partition Key: `deviceId` (String)
- Sort Key: `timestamp` (Number)
- GSI: `date` (partition) + `timestamp` (sort)
- TTL: Automatic cleanup after 30 days

## Monitoring

### CloudWatch Metrics

- Records processed per minute
- Error rate
- Consumer lag
- API response times

### Health Checks

- `/health` - Overall service health
- ALB health checks on Fargate tasks
- Kinesis consumer health monitoring

## Testing

Run unit tests:
```bash
python -m pytest tests/ -v
```

## Performance

- Processes up to 1000 records/second per shard
- Batch writes to DynamoDB (25 items per batch)
- Auto-scales 1-3 tasks (dev) or 2-10 tasks (prod)
- Sub-100ms API response times for queries

## Troubleshooting

1. **No data flowing**: Check Kinesis stream has data
2. **High lag**: Scale up Fargate tasks
3. **DynamoDB throttling**: Increase table capacity
4. **Memory issues**: Increase task memory allocation