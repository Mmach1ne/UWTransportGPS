// test-optimizations.ts
import { ETACalculator } from './src/etaCalculator';
import { VehicleLocation } from './src/types';
import { estimateMonthlyApiCalls } from './src/optimizationConfig';

// Mock vehicle locations around University of Waterloo
const mockVehicles: VehicleLocation[] = [
  {
    id: 'bus-001',
    latitude: 43.4723,
    longitude: -80.5449,
    speed: 30,
    heading: 45,
    timestamp: new Date()
  },
  {
    id: 'bus-002',
    latitude: 43.4700,
    longitude: -80.5400,
    speed: 0, // Stopped
    heading: 180,
    timestamp: new Date()
  },
  {
    id: 'bus-003',
    latitude: 43.4900,
    longitude: -80.5300,
    speed: 40,
    heading: 270, // Wrong direction
    timestamp: new Date()
  }
];

const mockGeofence = {
  id: 'gf-001',
  name: 'Conestoga Mall',
  coordinates: {
    latitude: 43.4969,
    longitude: -80.5331
  }
};

async function testOptimizations() {
  console.log('🧪 Testing Geofence ETA Optimizations\n');

  const calculator = new ETACalculator();
  const startTime = Date.now();
  let apiCalls = 0;

  // Test 1: Multiple calls for same vehicle (should hit cache)
  console.log('Test 1: Cache effectiveness');
  for (let i = 0; i < 5; i++) {
    const eta = await calculator.calculateETA(mockVehicles[0].id, mockGeofence.id);
    const stats = calculator.getCacheStats();
    console.log(`  Call ${i + 1}: ${eta?.estimatedArrivalMinutes}min, API calls: ${stats.apiCallsPerMinute}`);
    if (i === 0) apiCalls = stats.apiCallsPerMinute;
  }
  console.log(`  ✅ Cache working: ${calculator.getCacheStats().apiCallsPerMinute === apiCalls ? 'Yes' : 'No'}\n`);

  // Test 2: Stopped vehicle (should use GPS projection)
  console.log('Test 2: Stopped vehicle optimization');
  const stoppedEta = await calculator.calculateETA(mockVehicles[1].id, mockGeofence.id);
  console.log(`  Result: ${stoppedEta?.method} method used`);
  console.log(`  ✅ Avoided API call: ${stoppedEta?.method === 'gps_projection' ? 'Yes' : 'No'}\n`);

  // Test 3: Wrong direction vehicle
  console.log('Test 3: Wrong direction vehicle');
  const wrongDirectionEta = await calculator.calculateETA(mockVehicles[2].id, mockGeofence.id);
  console.log(`  Result: ${wrongDirectionEta?.confidence} confidence`);
  console.log(`  ✅ Low confidence detected: ${wrongDirectionEta?.confidence === 'low' ? 'Yes' : 'No'}\n`);

  // Test 4: Performance stats
  const endTime = Date.now();
  const stats = calculator.getCacheStats();
  console.log('📊 Performance Statistics:');
  console.log(`  Total time: ${endTime - startTime}ms`);
  console.log(`  Cache size: ${stats.size}`);
  console.log(`  API calls/minute: ${stats.apiCallsPerMinute}`);
  console.log(`  Cache hit rate: ${((5 - apiCalls) / 5 * 100).toFixed(0)}%\n`);

  // Test 5: Cost estimation
  console.log('💰 Cost Estimation:');
  const estimate = estimateMonthlyApiCalls(50, 8);
  console.log(`  For 50 vehicles, 8 hours/day:`);
  console.log(`  Estimated monthly API calls: ${estimate.estimatedCalls.toLocaleString()}`);
  console.log(`  Estimated monthly cost: $${estimate.estimatedCost}`);
  console.log(`  Within free tier: ${estimate.withinFreeTier ? 'Yes ✅' : 'No ❌'}\n`);

  // Test 6: Different fleet sizes
  console.log('📈 Scaling Analysis:');
  const fleetSizes = [10, 25, 50, 100, 200];
  for (const size of fleetSizes) {
    const est = estimateMonthlyApiCalls(size, 8);
    console.log(`  ${size} vehicles: ${est.estimatedCalls.toLocaleString()} calls, $${est.estimatedCost}/month`);
  }
}

// Run tests
testOptimizations().catch(console.error);