#!/usr/bin/env python3
"""
Test script for TrackStore API
"""

import requests
import json
from datetime import datetime, timedelta

# Base URL - update after deployment
BASE_URL = "http://localhost:8000"  # Local testing
# BASE_URL = "http://trackstore-alb-dev-xxxxx.us-east-1.elb.amazonaws.com"  # After deployment

def test_health():
    """Test health endpoint"""
    print("Testing health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}\n")

def test_metrics():
    """Test metrics endpoint"""
    print("Testing metrics endpoint...")
    response = requests.get(f"{BASE_URL}/metrics")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}\n")

def test_get_devices():
    """Test get all devices"""
    print("Testing get all devices...")
    response = requests.get(f"{BASE_URL}/devices")
    print(f"Status: {response.status_code}")
    devices = response.json()
    print(f"Found {len(devices)} devices")
    if devices:
        print(f"First device: {json.dumps(devices[0], indent=2)}\n")

def test_get_device_status(device_id="bus-001"):
    """Test get specific device"""
    print(f"Testing get device {device_id}...")
    response = requests.get(f"{BASE_URL}/devices/{device_id}")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        print(f"Response: {json.dumps(response.json(), indent=2)}\n")
    else:
        print(f"Error: {response.text}\n")

def test_get_latest_location(device_id="bus-001"):
    """Test get latest location"""
    print(f"Testing get latest location for {device_id}...")
    response = requests.get(f"{BASE_URL}/locations/{device_id}/latest")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        location = response.json()
        print(f"Latest location: ({location['latitude']}, {location['longitude']})")
        print(f"Timestamp: {datetime.fromtimestamp(location['timestamp']/1000)}\n")
    else:
        print(f"Error: {response.text}\n")

def test_get_location_history(device_id="bus-001", hours=1):
    """Test get location history"""
    print(f"Testing location history for {device_id} (last {hours} hours)...")
    
    end_time = int(datetime.utcnow().timestamp() * 1000)
    start_time = int((datetime.utcnow() - timedelta(hours=hours)).timestamp() * 1000)
    
    response = requests.get(
        f"{BASE_URL}/locations/{device_id}",
        params={
            "start_time": start_time,
            "end_time": end_time,
            "limit": 10
        }
    )
    
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        locations = response.json()
        print(f"Found {len(locations)} locations")
        if locations:
            print(f"First location: {json.dumps(locations[0], indent=2)}\n")
    else:
        print(f"Error: {response.text}\n")

def test_register_device(device_id="test-device-001"):
    """Test device registration"""
    print(f"Testing device registration for {device_id}...")
    
    device_info = {
        "type": "gps-tracker",
        "model": "GT-100",
        "firmware": "1.0.0"
    }
    
    response = requests.post(
        f"{BASE_URL}/devices/{device_id}/register",
        json=device_info
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}\n")

if __name__ == "__main__":
    print("=== TrackStore API Test ===\n")
    
    # Run tests
    test_health()
    test_metrics()
    test_get_devices()
    test_get_device_status()
    test_get_latest_location()
    test_get_location_history()
    # test_register_device()  # Uncomment to test registration
    
    print("=== Test Complete ===")