import json
import time
from simulator import GPSDeviceSimulator, create_sample_route

def main():
    print("Testing GPS Device Simulator locally...\n")
    
    # Create simulator
    device_id = "bus-test-001"
    route = create_sample_route()
    simulator = GPSDeviceSimulator(device_id, route, speed_kmh=40.0)
    
    print(f"Device ID: {device_id}")
    print(f"Route points: {len(route)}")
    print(f"Speed: 40 km/h")
    print("\nSimulating 10 position updates...\n")
    
    for i in range(10):
        # Update position
        simulator.current_position = simulator.calculate_next_position(5)
        
        # Get telemetry
        telemetry = simulator.get_telemetry()
        
        # Print it
        print(f"Update {i+1}:")
        print(json.dumps(telemetry, indent=2))
        print("-" * 40)
        
        time.sleep(1)
    
    print("\nTest complete!")

if __name__ == "__main__":
    main()