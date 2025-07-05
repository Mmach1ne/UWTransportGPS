// services/geofence-alerts/src/etaCalculator.ts
import AWS from 'aws-sdk';
import axios from 'axios';

export interface VehicleLocation {
  id: string;
  latitude: number;
  longitude: number;
  speed: number; // km/h
  heading: number;
  timestamp: Date;
}

export interface ETAResult {
  estimatedArrivalMinutes: number;
  distanceMeters: number;
  route?: {
    duration: number;
    distance: number;
    geometry?: any;
  };
  confidence: 'high' | 'medium' | 'low';
  method: 'gps_projection' | 'routing_api' | 'historical_average';
}

export class ETACalculator {
  private dynamodb: AWS.DynamoDB.DocumentClient;
  private locationTableName: string;
  private routingApiKey?: string;

  constructor() {
    this.dynamodb = new AWS.DynamoDB.DocumentClient();
    this.locationTableName = process.env.LOCATION_TABLE_NAME || 'transport-locations-dev';
    this.routingApiKey = process.env.MAPBOX_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  }

  async calculateETA(vehicleId: string, geofenceId: string): Promise<ETAResult | null> {
    try {
      // Get current vehicle location
      const currentLocation = await this.getCurrentVehicleLocation(vehicleId);
      if (!currentLocation) {
        console.log(`No current location found for vehicle ${vehicleId}`);
        return null;
      }

      // Get geofence details
      const geofence = await this.getGeofenceLocation(geofenceId);
      if (!geofence) {
        console.log(`Geofence ${geofenceId} not found`);
        return null;
      }

      // Try different ETA calculation methods in order of preference
      let eta: ETAResult | null = null;

      // Method 1: Use routing API if available
      if (this.routingApiKey) {
        eta = await this.calculateETAWithRoutingAPI(currentLocation, geofence);
      }

      // Method 2: GPS projection based on current speed and direction
      if (!eta || eta.confidence === 'low') {
        const gpsETA = await this.calculateETAWithGPSProjection(currentLocation, geofence);
        if (!eta || (gpsETA && gpsETA.confidence === 'high')) {
          eta = gpsETA;
        }
      }

      // Method 3: Historical average as fallback
      if (!eta) {
        eta = await this.calculateETAFromHistoricalData(vehicleId, geofenceId);
      }

      return eta;
    } catch (error) {
      console.error('Error calculating ETA:', error);
      return null;
    }
  }

  private async getCurrentVehicleLocation(vehicleId: string): Promise<VehicleLocation | null> {
    try {
      const result = await this.dynamodb.query({
        TableName: this.locationTableName,
        KeyConditionExpression: 'deviceId = :deviceId',
        ExpressionAttributeValues: {
          ':deviceId': vehicleId
        },
        ScanIndexForward: false, // Get most recent first
        Limit: 1
      }).promise();

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      const item = result.Items[0];
      return {
        id: item.deviceId,
        latitude: item.latitude,
        longitude: item.longitude,
        speed: item.speed || 0,
        heading: item.heading || 0,
        timestamp: new Date(item.timestamp)
      };
    } catch (error) {
      console.error('Error fetching vehicle location:', error);
      return null;
    }
  }

  private async getGeofenceLocation(geofenceId: string): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const dynamodb = new AWS.DynamoDB.DocumentClient();
      const result = await dynamodb.get({
        TableName: process.env.GEOFENCE_TABLE_NAME || 'transport-geofences-dev',
        Key: { id: geofenceId }
      }).promise();

      if (!result.Item) return null;

      return {
        latitude: result.Item.coordinates.latitude,
        longitude: result.Item.coordinates.longitude
      };
    } catch (error) {
      console.error('Error fetching geofence location:', error);
      return null;
    }
  }

  private async calculateETAWithRoutingAPI(
    from: VehicleLocation,
    to: { latitude: number; longitude: number }
  ): Promise<ETAResult | null> {
    try {
      // Example using Mapbox Directions API
      if (this.routingApiKey && process.env.MAPBOX_API_KEY) {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
        
        const response = await axios.get(url, {
          params: {
            access_token: this.routingApiKey,
            geometries: 'geojson',
            overview: 'simplified'
          },
          timeout: 5000 // 5 second timeout
        });

        if (response.data.routes && response.data.routes.length > 0) {
          const route = response.data.routes[0];
          return {
            estimatedArrivalMinutes: Math.round(route.duration / 60),
            distanceMeters: Math.round(route.distance),
            route: {
              duration: route.duration,
              distance: route.distance,
              geometry: route.geometry
            },
            confidence: 'high',
            method: 'routing_api'
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error with routing API:', error);
      return null;
    }
  }

  private async calculateETAWithGPSProjection(
    from: VehicleLocation,
    to: { latitude: number; longitude: number }
  ): Promise<ETAResult | null> {
    try {
      const distance = this.calculateDistance(
        from.latitude,
        from.longitude,
        to.latitude,
        to.longitude
      );

      // If vehicle is not moving, can't calculate ETA with projection
      if (from.speed <= 5) { // Less than 5 km/h considered stationary
        return {
          estimatedArrivalMinutes: Math.round(distance / 1000 / 30 * 60), // Assume 30 km/h average
          distanceMeters: distance,
          confidence: 'low',
          method: 'gps_projection'
        };
      }

      // Calculate bearing to destination
      const bearing = this.calculateBearing(
        from.latitude,
        from.longitude,
        to.latitude,
        to.longitude
      );

      // Check if vehicle is heading towards destination
      const headingDifference = Math.abs(bearing - from.heading);
      const isHeadingTowards = headingDifference <= 45 || headingDifference >= 315;

      const speedMs = (from.speed * 1000) / 3600; // Convert km/h to m/s
      const etaSeconds = distance / speedMs;

      let confidence: 'high' | 'medium' | 'low' = 'medium';
      if (isHeadingTowards && from.speed > 10) {
        confidence = 'high';
      } else if (!isHeadingTowards || from.speed < 5) {
        confidence = 'low';
      }

      return {
        estimatedArrivalMinutes: Math.round(etaSeconds / 60),
        distanceMeters: distance,
        confidence,
        method: 'gps_projection'
      };
    } catch (error) {
      console.error('Error with GPS projection:', error);
      return null;
    }
  }

  private async calculateETAFromHistoricalData(
    vehicleId: string,
    geofenceId: string
  ): Promise<ETAResult | null> {
    try {
      // Query historical data for this vehicle-geofence combination
      // This is a simplified version - in practice, you'd want more sophisticated analysis
      
      const currentTime = Date.now();
      const oneWeekAgo = currentTime - (7 * 24 * 60 * 60 * 1000);

      // This would require a more complex query to find historical arrival patterns
      // For now, return a basic estimate based on average urban speeds
      
      const currentLocation = await this.getCurrentVehicleLocation(vehicleId);
      const geofenceLocation = await this.getGeofenceLocation(geofenceId);
      
      if (!currentLocation || !geofenceLocation) return null;

      const distance = this.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        geofenceLocation.latitude,
        geofenceLocation.longitude
      );

      // Assume average urban transit speed of 25 km/h
      const averageSpeedKmh = 25;
      const etaMinutes = (distance / 1000) / averageSpeedKmh * 60;

      return {
        estimatedArrivalMinutes: Math.round(etaMinutes),
        distanceMeters: distance,
        confidence: 'medium',
        method: 'historical_average'
      };
    } catch (error) {
      console.error('Error calculating historical ETA:', error);
      return null;
    }
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLng = this.toRadians(lng2 - lng1);
    const lat1Rad = this.toRadians(lat1);
    const lat2Rad = this.toRadians(lat2);

    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

    const bearing = Math.atan2(y, x);
    return (this.toDegrees(bearing) + 360) % 360;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }
}