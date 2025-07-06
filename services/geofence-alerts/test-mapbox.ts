// test-mapbox.ts
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testMapboxAPI() {
  const apiKey = process.env.MAPBOX_API_KEY;
  
  if (!apiKey) {
    console.error('❌ MAPBOX_API_KEY not found in environment variables');
    return;
  }

  console.log('🔑 Mapbox API Key found:', apiKey.substring(0, 10) + '...');

  // Test coordinates - from University of Waterloo to Conestoga Mall
  const origin = { lat: 43.4723, lng: -80.5449 }; // UW
  const destination = { lat: 43.4969, lng: -80.5331 }; // Conestoga Mall

  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    
    console.log('📍 Testing route from UW to Conestoga Mall...');
    
    const response = await axios.get(url, {
      params: {
        access_token: apiKey,
        geometries: 'geojson',
        overview: 'simplified'
      }
    });

    if (response.data.routes && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      console.log('✅ Mapbox API working!');
      console.log(`📏 Distance: ${(route.distance / 1000).toFixed(2)} km`);
      console.log(`⏱️  Duration: ${Math.round(route.duration / 60)} minutes`);
      console.log(`🚗 ETA: ${new Date(Date.now() + route.duration * 1000).toLocaleTimeString()}`);
    } else {
      console.error('❌ No routes found');
    }
  } catch (error: any) {
    console.error('❌ Mapbox API Error:', error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error('🔐 Authentication failed - check your API key');
    }
  }
}

// Run the test
testMapboxAPI();