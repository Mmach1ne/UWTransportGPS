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

load_dotenv()

class GPSDeviceSim:
    def __init__(self, device_id: str, route_points: List[Tuple[float,float]],speed_kmh: float = 60.0):
        self.device_id = device_id
        self.route_points = route_points
        self.speed_kmh = speed_kmh
        self.current_position_index = 0
        self.current_position = route_points[0]
    def calculate_next_position(self, time_delta_seconds: float) -> Tuple[float, float]:
        """Calculate next position based on speed and time"""
        if self.current_position_index >= len(self.route_points) - 1:
            self.current_position_index = 0  # Loop back to start
            
        start = self.route_points[self.current_position_index]
        end = self.route_points[self.current_position_index + 1]
        
        # Calculate distance that can be traveled
        speed_ms = (self.speed_kmh * 1000) / 3600  # Convert km/h to m/s
        distance_m = speed_ms * time_delta_seconds
        
        # Calculate distance between points (simplified, assumes flat earth)
        lat_diff = end[0] - start[0]
        lon_diff = end[1] - start[1]
        total_distance = math.sqrt(lat_diff**2 + lon_diff**2) * 111000  # Rough conversion to meters
        
        if distance_m >= total_distance:
            # Reached the next point
            self.current_position_index += 1
            return self.calculate_next_position(time_delta_seconds - total_distance / speed_ms)
        else:
            # Interpolate position
            progress = distance_m / total_distance
            new_lat = start[0] + (lat_diff * progress)
            new_lon = start[1] + (lon_diff * progress)
            return (new_lat, new_lon)
    
    def get_telemetry(self) -> Dict:
        """Generate telemetry data"""
        # Add some randomness to simulate real GPS
        lat_noise = random.uniform(-0.00001, 0.00001)
        lon_noise = random.uniform(-0.00001, 0.00001)
        
        return {
            "busId": self.device_id,
            "lat": round(self.current_position[0] + lat_noise, 6),
            "lon": round(self.current_position[1] + lon_noise, 6),
            "ts": int(datetime.utcnow().timestamp() * 1000),  # Milliseconds
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


