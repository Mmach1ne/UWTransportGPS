#!/usr/bin/env python3
"""
GPS Device Simulator for Transport Tracking System
Publishes GPS coordinates via MQTT to AWS IoT Core
"""

import json
import time
import uuid
import random
import math
from datetime import datetime
from typing import Dict, Tuple, List
import click
import boto3
from awscrt import io, mqtt
from awsiot import mqtt_connection_builder
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

def haversine(start, end):
    """Calculate distance between two lat/lon points using Haversine formula"""
    R = 6371000  # Earth radius in meters
    φ1, λ1 = map(math.radians, start)
    φ2, λ2 = map(math.radians, end)
    dφ = φ2 - φ1
    dλ = λ2 - λ1
    a = math.sin(dφ/2)**2 + math.cos(φ1)*math.cos(φ2)*math.sin(dλ/2)**2
    return 2*R*math.atan2(math.sqrt(a), math.sqrt(1-a))

class GPSDeviceSimulator:
    """Simulates a GPS device on a bus route"""
    
    def __init__(self, device_id: str, route_points: List[Tuple[float, float]], 
                 speed_kmh: float = 30.0):
        self.device_id = device_id
        self.route_points = route_points
        self.speed_kmh = speed_kmh
        self.current_position_index = 0
        self.current_position = route_points[0]
        
    def calculate_next_position(self, time_delta_seconds: float) -> Tuple[float, float]:
        """Calculate next position based on speed and time, updating self.current_position."""
        speed_ms = (self.speed_kmh * 1000) / 3600  # km/h → m/s
        remaining_time = time_delta_seconds

        # Keep moving until we've used up the time slice
        while remaining_time > 0:
            # Next waypoint index (wrap around)
            next_idx = (self.current_position_index + 1) % len(self.route_points)
            start = self.current_position
            end = self.route_points[next_idx]

            # Distance for this segment using haversine
            segment_dist = haversine(start, end)  # in meters

            # How far we *could* go in the remaining time
            travel_dist = speed_ms * remaining_time

            if travel_dist >= segment_dist:
                # We can reach (or pass) the next waypoint
                self.current_position = end
                self.current_position_index = next_idx
                # Subtract the time spent getting to that waypoint
                remaining_time -= segment_dist / speed_ms
                # loop again in case we have leftover time to continue onward
            else:
                # We stop somewhere *between* start and end
                lat_diff = end[0] - start[0]
                lon_diff = end[1] - start[1]
                frac = travel_dist / segment_dist
                new_lat = start[0] + lat_diff * frac
                new_lon = start[1] + lon_diff * frac
                self.current_position = (new_lat, new_lon)
                # All time used up
                remaining_time = 0

        return self.current_position
    
    def get_telemetry(self) -> Dict:
        """Generate telemetry data"""
        # Add some randomness to simulate real GPS
        lat_noise = random.uniform(-0.00001, 0.00001)
        lon_noise = random.uniform(-0.00001, 0.00001)
        
        return {
            "busId": self.device_id,
            "lat": round(self.current_position[0] + lat_noise, 6),
            "lon": round(self.current_position[1] + lon_noise, 6),
            "ts": int(time.time() * 1000),  # Current time in milliseconds
            "speed": round(self.speed_kmh + random.uniform(-2, 2), 1),
            "heading": random.randint(0, 359),
            "accuracy": round(random.uniform(5, 15), 1)
        }

class AWSIoTClient:
    """Handles AWS IoT Core MQTT connection"""
    
    def __init__(self, endpoint: str, cert_path: str, key_path: str, 
                 ca_path: str, client_id: str):
        self.endpoint = endpoint
        self.cert_path = cert_path
        self.key_path = key_path
        self.ca_path = ca_path
        self.client_id = client_id
        self.mqtt_connection = None
        
    def connect(self):
        """Establish MQTT connection to AWS IoT Core"""
        event_loop_group = io.EventLoopGroup(1)
        host_resolver = io.DefaultHostResolver(event_loop_group)
        client_bootstrap = io.ClientBootstrap(event_loop_group, host_resolver)
        
        self.mqtt_connection = mqtt_connection_builder.mtls_from_path(
            endpoint=self.endpoint,
            cert_filepath=self.cert_path,
            pri_key_filepath=self.key_path,
            client_bootstrap=client_bootstrap,
            ca_filepath=self.ca_path,
            client_id=self.client_id,
            clean_session=False,
            keep_alive_secs=6
        )
        
        print(f"Connecting to {self.endpoint} with client ID '{self.client_id}'...")
        connect_future = self.mqtt_connection.connect()
        connect_future.result()
        print("Connected!")
        
    def publish(self, topic: str, payload: Dict):
        """Publish message to MQTT topic"""
        message_json = json.dumps(payload)
        self.mqtt_connection.publish(
            topic=topic,
            payload=message_json,
            qos=mqtt.QoS.AT_LEAST_ONCE
        )
        
    def disconnect(self):
        """Disconnect from AWS IoT Core"""
        if self.mqtt_connection:
            disconnect_future = self.mqtt_connection.disconnect()
            disconnect_future.result()
            print("Disconnected!")

def create_sample_route() -> List[Tuple[float, float]]:
    """Create a sample bus route around University of Waterloo campus"""
    return [
        # University Station (Ring Road East, by Columbia Street)
        (43.472215, -80.544134),
        # South along Ring Road toward Environment 3
        (43.470803, -80.544892),
        # Curve around Earth Sciences & Engineering buildings
        (43.469955, -80.543523),
        # Down past Dana Porter Library (southwest corner)
        (43.468640, -80.542987),
        # Turn north between SLC and Hagey Hall
        (43.468870, -80.540970),
        # Past DC Lot and Health Sciences to University Avenue
        (43.469952, -80.539623),
        # Up past Tatham Centre toward Waterloo Stadium
        (43.471008, -80.539823),
        # Curve east by Architecture and the Davis Centre
        (43.472198, -80.540678),
        # Back up to Physics & Astronomy and University Station
        (43.472430, -80.542765),
        # Close the loop
        (43.472215, -80.544134),
    ]

@click.command()
@click.option('--device-id', default=None, help='Device ID (default: auto-generated)')
@click.option('--endpoint', envvar='IOT_ENDPOINT', required=True, help='AWS IoT endpoint')
@click.option('--cert', envvar='IOT_CERT_PATH', default='certs/device.pem.crt', help='Device certificate path')
@click.option('--key', envvar='IOT_KEY_PATH', default='certs/private.pem.key', help='Private key path')
@click.option('--ca', envvar='IOT_CA_PATH', default='certs/Amazon-root-CA-1.pem', help='Root CA path')
@click.option('--interval', envvar='PUBLISH_INTERVAL', default=5, help='Publish interval in seconds')
@click.option('--speed', envvar='BUS_SPEED_KMH', default=30.0, help='Bus speed in km/h')
def main(device_id, endpoint, cert, key, ca, interval, speed):
    """Run GPS device simulator"""
    
    # Generate device ID if not provided
    if not device_id:
        device_id = f"bus-{str(uuid.uuid4())[:8]}"
    
    click.echo(f"Starting GPS simulator for device: {device_id}")
    click.echo(f"Publishing to endpoint: {endpoint}")
    click.echo(f"Update interval: {interval} seconds")
    click.echo(f"Simulated speed: {speed} km/h")
    
    # Create simulator
    route = create_sample_route()
    simulator = GPSDeviceSimulator(device_id, route, speed)
    
    # Create IoT client
    topic = f"transport/dev/{device_id}/location"
    iot_client = AWSIoTClient(endpoint, cert, key, ca, device_id)
    
    try:
        # Connect to AWS IoT
        iot_client.connect()
        
        click.echo(f"\nPublishing to topic: {topic}")
        click.echo("Press Ctrl+C to stop...\n")
        
        # Main simulation loop
        while True:
            # Update position
            simulator.current_position = simulator.calculate_next_position(interval)
            
            # Get telemetry data
            telemetry = simulator.get_telemetry()
            
            # Publish to AWS IoT
            iot_client.publish(topic, telemetry)
            
            # Display what was sent
            click.echo(f"Published: {json.dumps(telemetry, indent=2)}")
            
            # Wait for next interval
            time.sleep(interval)
            
    except KeyboardInterrupt:
        click.echo("\nStopping simulator...")
    finally:
        iot_client.disconnect()

if __name__ == "__main__":
    main()