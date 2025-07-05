import AWS from 'aws-sdk';
import { config } from '../src/config';

// Sample geofences for University of Waterloo campus
const sampleGeofences = [
  {
    name: 'University Station',
    description: 'Main bus terminal at University of Waterloo',
    type: 'circle' as const,
    coordinates: {
      latitude: 43.472215,
      longitude: -80.544134,
      radius: 30
    },
    alertThresholdMinutes: 2,
    isActive: true,
    metadata: {
      stopId: 'UW-STATION-01',
      category: 'bus_stop' as const
    }
  },
  {
    name: 'Dana Porter Library',
    description: 'Main library building',
    type: 'circle' as const,
    coordinates: {
      latitude: 43.468640,
      longitude: -80.542987,
      radius: 25
    },
    alertThresholdMinutes: 1,
    isActive: true,
    metadata: {
      stopId: 'UW-LIBRARY-01',
      category: 'bus_stop' as const
    }
  },
  {
    name: 'Student Life Centre',
    description: 'Student services and activities center',
    type: 'circle' as const,
    coordinates: {
      latitude: 43.468870,
      longitude: -80.540970,
      radius: 35
    },
    alertThresholdMinutes: 2,
    isActive: true,
    metadata: {
      stopId: 'UW-SLC-01',
      category: 'bus_stop' as const
    }
  },
  {
    name: 'Campus Restricted Zone',
    description: 'Construction area - vehicles should not enter',
    type: 'polygon' as const,
    coordinates: {
      points: [
        { lat: 43.4700, lng: -80.5430 },
        { lat: 43.4705, lng: -80.5430 },
        { lat: 43.4705, lng: -80.5420 },
        { lat: 43.4700, lng: -80.5420 }
      ]
    },
    alertThresholdMinutes: 5,
    isActive: true,
    metadata: {
      category: 'restricted' as const
    }
  },
  {
    name: 'Bus Depot',
    description: 'Vehicle maintenance and storage facility',
    type: 'polygon' as const,
    coordinates: {
      points: [
        { lat: 43.4750, lng: -80.5460 },
        { lat: 43.4760, lng: -80.5460 },
        { lat: 43.4760, lng: -80.5440 },
        { lat: 43.4750, lng: -80.5440 }
      ]
    },
    alertThresholdMinutes: 10,
    isActive: true,
    metadata: {
      category: 'depot' as const
    }
  }
];

async function setupSampleGeofences() {
  console.log('Setting up sample geofences...');
  
  const dynamodb = new AWS.DynamoDB.DocumentClient({
    region: config.aws.region
  });

  for (const geofenceData of sampleGeofences) {
    const geofence = {
      ...geofenceData,
      id: `geofence-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await dynamodb.put({
        TableName: config.dynamodb.geofenceTable,
        Item: geofence
      }).promise();

      console.log(`✓ Created geofence: ${geofence.name}`);
    } catch (error) {
      console.error(`✗ Failed to create geofence ${geofence.name}:`, error);
    }
  }

  console.log('\nSample geofences setup complete!');
}

// Test ETA calculations
async function testETACalculations() {
  console.log('\nTesting ETA calculations...');
  
  const testVehicle = {
    id: 'bus-001',
    latitude: 43.4700,
    longitude: -80.5450,
    speed: 25, // km/h
    heading: 45,
    timestamp: new Date()
  };

  // This would normally be done by the service
  console.log(`Test vehicle at: (${testVehicle.latitude}, ${testVehicle.longitude})`);
  console.log('Use the API endpoint to test ETA calculations once the service is running.');
}

if (require.main === module) {
  setupSampleGeofences()
    .then(() => testETACalculations())
    .catch(error => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

// services/geofence-alerts/scripts/test-alerts.ts
import WebSocket from 'ws';
import axios from 'axios';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const WS_URL = process.env.WS_URL || 'ws://localhost:3001';

interface TestAlert {
  vehicleId: string;
  geofenceId: string;
  alertType: 'approaching' | 'entered' | 'exited';
  priority: 'low' | 'medium' | 'high';
}

async function testGeofenceAPI() {
  console.log('Testing Geofence API...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${API_BASE}/health`);
    console.log(`✓ Health check: ${healthResponse.data.status}\n`);

    // Test get geofences
    console.log('2. Testing get geofences...');
    const geofencesResponse = await axios.get(`${API_BASE}/api/geofences`);
    console.log(`✓ Found ${geofencesResponse.data.length} geofences\n`);

    if (geofencesResponse.data.length > 0) {
      const firstGeofence = geofencesResponse.data[0];
      console.log(`First geofence: ${firstGeofence.name}`);
      
      // Test ETA calculation
      console.log('3. Testing ETA calculation...');
      try {
        const etaResponse = await axios.get(`${API_BASE}/api/eta/bus-001/${firstGeofence.id}`);
        console.log(`✓ ETA calculated: ${JSON.stringify(etaResponse.data, null, 2)}\n`);
      } catch (error) {
        console.log('! ETA calculation failed (expected if no vehicle data)\n');
      }
    }

    // Test get alerts
    console.log('4. Testing get alerts...');
    const alertsResponse = await axios.get(`${API_BASE}/api/alerts`);
    console.log(`✓ Found ${alertsResponse.data.length} active alerts\n`);

  } catch (error) {
    console.error('API test failed:', error.message);
  }
}

function testWebSocketConnection() {
  console.log('Testing WebSocket connection...\n');

  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✓ WebSocket connected');
    
    // Subscribe to alerts
    ws.send(JSON.stringify({
      type: 'subscribe',
      geofenceId: 'all'
    }));
    
    console.log('✓ Subscribed to alerts');
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 Received message:', JSON.stringify(message, null, 2));
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Keep connection open for 30 seconds
  setTimeout(() => {
    ws.close();
    console.log('\nWebSocket test complete');
  }, 30000);
}

async function simulateVehicleMovement() {
  console.log('Simulating vehicle movement for alerts...\n');
  
  // This would simulate a vehicle moving through geofences
  // In practice, this data would come from your IoT devices
  
  const mockAlerts: TestAlert[] = [
    {
      vehicleId: 'bus-001',
      geofenceId: 'geofence-test-1',
      alertType: 'approaching',
      priority: 'medium'
    },
    {
      vehicleId: 'bus-001', 
      geofenceId: 'geofence-test-1',
      alertType: 'entered',
      priority: 'low'
    },
    {
      vehicleId: 'bus-002',
      geofenceId: 'geofence-restricted',
      alertType: 'entered',
      priority: 'high'
    }
  ];

  console.log('Mock alerts that would be generated:');
  mockAlerts.forEach((alert, index) => {
    console.log(`${index + 1}. ${alert.alertType.toUpperCase()} - Vehicle ${alert.vehicleId} (${alert.priority} priority)`);
  });
}

async function runTests() {
  console.log('=== Geofence Service Tests ===\n');
  
  await testGeofenceAPI();
  testWebSocketConnection();
  await simulateVehicleMovement();
  
  console.log('\n=== Tests Complete ===');
  console.log('Note: Start the geofence service with "npm run dev" to run live tests');
}

if (require.main === module) {
  runTests().catch(console.error);
}