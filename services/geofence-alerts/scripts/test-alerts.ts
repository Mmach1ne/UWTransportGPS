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