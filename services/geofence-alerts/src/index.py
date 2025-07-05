import json
import boto3
import os
import logging
import base64
import math
from datetime import datetime
from typing import Dict, Any, List, Tuple
from dataclasses import dataclass
from decimal import Decimal

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')

# WebSocket management API; endpoint URL must be set in env
ws_client = boto3.client(
    'apigatewaymanagementapi',
    endpoint_url=os.environ['WEBSOCKET_ENDPOINT']
)

eventbridge = boto3.client('events')

# Tables from environment
device_table      = dynamodb.Table(os.environ['DEVICE_TABLE_NAME'])
stations_table    = dynamodb.Table(os.environ['STATIONS_TABLE_NAME'])
connections_table = dynamodb.Table(os.environ['CONNECTIONS_TABLE_NAME'])
event_bus         = os.environ.get('EVENT_BUS_NAME', 'default')

# Constants
AVERAGE_BUS_SPEED_KMH = 30  # fallback speed
TWO_MINUTES_METERS    = (AVERAGE_BUS_SPEED_KMH * 1000 / 60) * 2

@dataclass
class Station:
    station_id: str
    name: str
    lat: float
    lon: float
    radius_meters: float

@dataclass
class BusLocation:
    bus_id: str
    lat: float
    lon: float
    speed: float
    heading: int
    timestamp: int


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in meters between two lat/lon points."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def calculate_eta_seconds(distance: float, speed: float) -> int:
    """Convert distance (m) and speed (km/h) into seconds ETA."""
    if speed <= 0:
        speed = AVERAGE_BUS_SPEED_KMH
    speed_ms = speed / 3.6
    return int(distance / speed_ms)


def get_nearby_stations(lat: float, lon: float) -> List[Tuple[Station, float]]:
    """Scan stations_table and return those within TWO_MINUTES_METERS."""
    out: List[Tuple[Station, float]] = []
    for item in stations_table.scan().get('Items', []):
        station = Station(
            station_id=item['stationId'],
            name=item['name'],
            lat=float(item['latitude']),
            lon=float(item['longitude']),
            radius_meters=float(item.get('radiusMeters', TWO_MINUTES_METERS))
        )
        dist = haversine_distance(lat, lon, station.lat, station.lon)
        if dist <= TWO_MINUTES_METERS:
            out.append((station, dist))
    return sorted(out, key=lambda x: x[1])


def send_eventbridge_alert(detail: Dict[str, Any]):
    """Publish one alert event to EventBridge."""
    entry = {
        'Source': 'transport.geo',
        'DetailType': detail.get('alertType', 'StationAlert'),
        'Detail': json.dumps(detail),
        'EventBusName': event_bus
    }
    res = eventbridge.put_events(Entries=[entry])
    if res.get('FailedEntryCount', 0):
        logger.error('EventBridge failed: %s', res['Entries'])


def send_ws_alert(detail: Dict[str, Any]):
    """Push alert to all connected WebSocket clients."""
    for conn in connections_table.scan(ProjectionExpression='connectionId').get('Items', []):
        cid = conn['connectionId']
        try:
            ws_client.post_to_connection(
                Data=json.dumps(detail).encode(),
                ConnectionId=cid
            )
        except ws_client.exceptions.GoneException:
            # stale => remove
            connections_table.delete_item(Key={'connectionId': cid})
        except Exception as e:
            logger.error('WS send error %s: %s', cid, e)


def handler(event: Any, context: Any) -> Dict[str, Any]:
    """Lambda entry point: process Kinesis records and send alerts."""
    records = event.get('Records', [])
    alerts_sent = 0

    for rec in records:
        try:
            raw = base64.b64decode(rec['kinesis']['data'])
            payload = json.loads(raw)
            bus = BusLocation(
                bus_id=payload['busId'],
                lat=payload['lat'],
                lon=payload['lon'],
                speed=payload.get('speed', AVERAGE_BUS_SPEED_KMH),
                heading=payload.get('heading', 0),
                timestamp=payload['ts']
            )
            stations = get_nearby_stations(bus.lat, bus.lon)

            for station, dist in stations:
                eta = calculate_eta_seconds(dist, bus.speed)
                # threshold: 90-150s
                if 90 <= eta <= 150:
                    alert = {
                        'alertType': 'STATION_APPROACH',
                        'busId': bus.bus_id,
                        'stationId': station.station_id,
                        'stationName': station.name,
                        'distanceMeters': round(dist, 1),
                        'etaSeconds': eta,
                        'busLocation': {'lat': bus.lat, 'lon': bus.lon},
                        'timestamp': bus.timestamp
                    }
                    key = f'approach_{station.station_id}'
                    item = device_table.get_item(Key={'deviceId': bus.bus_id}).get('Item', {})
                    last = item.get('recentAlerts', {}).get(key, 0)
                    now = int(datetime.utcnow().timestamp() * 1000)

                    if now - last > 300000:
                        send_eventbridge_alert(alert)
                        send_ws_alert(alert)
                        device_table.update_item(
                            Key={'deviceId': bus.bus_id},
                            UpdateExpression='SET recentAlerts.#k = :t',
                            ExpressionAttributeNames={'#k': key},
                            ExpressionAttributeValues={':t': now}
                        )
                        alerts_sent += 1
        except Exception as e:
            logger.error('Record processing error: %s', e)

    return {'recordsProcessed': len(records), 'alertsSent': alerts_sent}