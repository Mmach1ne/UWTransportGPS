# GPS Device Simulator

This module simulates GPS-enabled IoT devices (buses) that publish location data to AWS IoT Core via MQTT.

## Features

- Simulates realistic bus movement along a predefined route
- Publishes GPS coordinates with timestamps
- Adds realistic noise to GPS readings
- Configurable speed and update intervals
- Automatic route looping

## Setup

### 1. Install Dependencies

```bash
cd device-sim
pip install -r requirements.txt
```

### 2. Create and Register IoT Device

Run the setup script to create an IoT Thing and download certificates:

```bash
python setup_device.py --device-id bus-001
```

This will:
- Create an IoT Thing in AWS IoT Core
- Generate device certificates
- Download AWS Root CA
- Create a `.env` file with your IoT endpoint

### 3. Run the Simulator

```bash
python simulator.py
```

Or with custom parameters:

```bash
python simulator.py --device-id bus-002 --speed 40 --interval 3
```

## Command Line Options

- `--device-id`: Unique identifier for the bus (default: auto-generated)
- `--endpoint`: AWS IoT endpoint (uses .env by default)
- `--interval`: How often to publish updates in seconds (default: 5)
- `--speed`: Simulated bus speed in km/h (default: 30)

## Published Message Format

The simulator publishes to topic: `transport/dev/{device-id}/location`

```json
{
  "busId": "bus-001",
  "lat": 37.7749,
  "lon": -122.4194,
  "ts": 1703123456789,
  "speed": 28.5,
  "heading": 142,
  "accuracy": 8.2
}
```

## Customizing Routes

Edit the `create_sample_route()` function in `simulator.py` to define custom routes. Each route is a list of (latitude, longitude) tuples.

## Testing

To test without AWS IoT connection:

```bash
python simulator.py --endpoint test --cert test --key test --ca test
```

## Troubleshooting

1. **Connection refused**: Check your IoT endpoint is correct
2. **Certificate errors**: Ensure certificates are in the `certs/` directory
3. **Policy errors**: Verify the IoT policy allows publish to the topic