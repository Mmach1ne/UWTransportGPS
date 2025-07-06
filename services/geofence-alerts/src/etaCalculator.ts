// services/geofence-alerts/src/etaCalculator.ts
import AWS from 'aws-sdk';
import axios from 'axios';
import { logger } from './types/logger';
import { ETAResult, VehicleLocation } from './types';
import { GeofenceManager } from './geofenceManager';
import { config } from './config';

// Cache entry type
interface CacheEntry {
  result: ETAResult;
  timestamp: number;
  key: string;
}

// Route cache type
interface RouteCache {
  [key: string]: CacheEntry;
}

export class ETACalculator {
  private dynamodb: AWS.DynamoDB.DocumentClient;
  private locationTableName: string;
  private routingApiKey?: string;
  private geofenceManager: GeofenceManager;
  
  // Caching
  private routeCache: RouteCache = {};
  private readonly CACHE_TTL_MS = 60000; // 60 seconds
  private readonly MAX_CACHE_SIZE = 1000; // Prevent memory issues
  
  // Optimization thresholds
  private readonly MAX_DISTANCE_FOR_API = 5000; // 5km - only use API if closer
  private readonly MIN_DISTANCE_FOR_API = 100; // 100m - too close, don't bother with API
  private readonly HEADING_TOLERANCE = 45; // degrees
  private readonly MIN_SPEED_KMH = 5; // Below this, vehicle is considered stopped
  
  // Rate limiting
  private apiCallCount = 0;
  private apiCallResetTime = Date.now();
  private readonly MAX_API_CALLS_PER_MINUTE = 500; // Stay under Mapbox limit

  constructor() {
    this.dynamodb = new AWS.DynamoDB.DocumentClient();
    this.locationTableName = process.env.LOCATION_TABLE_NAME || 'transport-locations-dev';
    
    if (process.env.MAPBOX_API_KEY) {
      this.routingApiKey = process.env.MAPBOX_API_KEY;
      logger.info('ETA Calculator initialized with Mapbox');
    } else {
      logger.warn('No Mapbox API key configured, will use GPS projection only');
    }

    this.geofenceManager = new GeofenceManager();
    
    // Clean up cache periodically
    setInterval(() => this.cleanupCache(), 120000); // Every 2 minutes
  }

  async calculateETA(vehicleId: string, geofenceId: string): Promise<ETAResult | null> {
    try {
      // Get current vehicle location
      const vehicleLocation = await this.getCurrentVehicleLocation(vehicleId);
      if (!vehicleLocation) {
        logger.warn(`No current location found for vehicle ${vehicleId}`);
        return null;
      }

      // Get geofence details
      const geofence = await this.geofenceManager.getGeofence(geofenceId);
      if (!geofence) {
        logger.warn(`Geofence ${geofenceId} not found`);
        return null;
      }

      // Calculate basic distance first
      const distance = this.calculateDistance(
        vehicleLocation.latitude,
        vehicleLocation.longitude,
        geofence.coordinates.latitude,
        geofence.coordinates.longitude
      );

      // Check cache first
      const cacheKey = this.getCacheKey(vehicleLocation, geofence.coordinates);
      const cachedResult = this.getFromCache(cacheKey);
      if (cachedResult) {
        logger.debug(`Cache hit for ${vehicleId} -> ${geofenceId}`);
        return cachedResult;
      }

      // Determine best calculation method based on distance and conditions
      let result: ETAResult | null = null;

      if (distance < this.MIN_DISTANCE_FOR_API) {
        // Very close - vehicle has basically arrived
        result = {
          estimatedArrivalMinutes: 0,
          distanceMeters: Math.round(distance),
          confidence: 'high',
          method: 'gps_projection'
        };
      } else if (distance > this.MAX_DISTANCE_FOR_API) {
        // Too far - use simple calculation to save API calls
        result = await this.calculateETAWithGPSProjection(vehicleLocation, geofence.coordinates);
      } else if (this.shouldUseRoutingAPI(vehicleLocation, geofence.coordinates, distance)) {
        // Within optimal range and conditions are good for API call
        result = await this.calculateETAWithRoutingAPI(vehicleLocation, geofence.coordinates);
        
        // Fall back to GPS projection if API fails
        if (!result) {
          result = await this.calculateETAWithGPSProjection(vehicleLocation, geofence.coordinates);
        }
      } else {
        // Use GPS projection (vehicle not heading towards geofence, stopped, etc.)
        result = await this.calculateETAWithGPSProjection(vehicleLocation, geofence.coordinates);
      }

      // Cache the result if it's good
      if (result && result.confidence !== 'low') {
        this.addToCache(cacheKey, result);
      }

      return result;
    } catch (error) {
      logger.error('Error calculating ETA:', error);
      return null;
    }
  }

  private shouldUseRoutingAPI(
    vehicle: VehicleLocation, 
    destination: { latitude: number; longitude: number },
    distance: number
  ): boolean {
    // Check rate limiting
    if (!this.checkRateLimit()) {
      logger.warn('API rate limit reached, using GPS projection');
      return false;
    }

    // Don't use API if vehicle is stopped
    if (vehicle.speed < this.MIN_SPEED_KMH) {
      return false;
    }

    // Check if vehicle is heading towards destination
    const bearing = this.calculateBearing(
      vehicle.latitude,
      vehicle.longitude,
      destination.latitude,
      destination.longitude
    );

    const headingDifference = Math.abs(bearing - vehicle.heading);
    const normalizedDifference = headingDifference > 180 ? 360 - headingDifference : headingDifference;
    
    if (normalizedDifference > this.HEADING_TOLERANCE) {
      logger.debug(`Vehicle ${vehicle.id} not heading towards geofence (${normalizedDifference}° off)`);
      return false;
    }

    return true;
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    
    // Reset counter every minute
    if (now - this.apiCallResetTime > 60000) {
      this.apiCallCount = 0;
      this.apiCallResetTime = now;
    }

    if (this.apiCallCount >= this.MAX_API_CALLS_PER_MINUTE) {
      return false;
    }

    return true;
  }

  private async getCurrentVehicleLocation(vehicleId: string): Promise<VehicleLocation | null> {
    try {
      const result = await this.dynamodb.query({
        TableName: this.locationTableName,
        KeyConditionExpression: 'deviceId = :deviceId',
        ExpressionAttributeValues: {
          ':deviceId': vehicleId
        },
        ScanIndexForward: false,
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
      logger.error('Error fetching vehicle location:', error);
      return null;
    }
  }

  private async calculateETAWithRoutingAPI(
    from: VehicleLocation,
    to: { latitude: number; longitude: number }
  ): Promise<ETAResult | null> {
    try {
      if (!this.routingApiKey) {
        return null;
      }

      // Increment API call counter
      this.apiCallCount++;

      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
      
      const response = await axios.get(url, {
        params: {
          access_token: this.routingApiKey,
          geometries: 'geojson',
          overview: 'simplified',
          alternatives: false // Save API calls by not requesting alternatives
        },
        timeout: 3000 // Shorter timeout for better responsiveness
      });

      if (response.data.routes && response.data.routes.length > 0) {
        const route = response.data.routes[0];
        logger.debug(`Mapbox API call successful for vehicle ${from.id}`);
        
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

      return null;
    } catch (error: any) {
      if (error.response?.status === 429) {
        logger.error('Mapbox rate limit hit');
        // Disable API calls for a minute
        this.apiCallCount = this.MAX_API_CALLS_PER_MINUTE;
      } else {
        logger.error('Mapbox API error:', error.message);
      }
      return null;
    }
  }

  private async calculateETAWithGPSProjection(
    from: VehicleLocation,
    to: { latitude: number; longitude: number }
  ): Promise<ETAResult> {
    const distance = this.calculateDistance(
      from.latitude,
      from.longitude,
      to.latitude,
      to.longitude
    );

    // If vehicle is stopped, use average speed
    const effectiveSpeed = from.speed > this.MIN_SPEED_KMH ? from.speed : 25; // 25 km/h average
    
    // Calculate bearing to destination
    const bearing = this.calculateBearing(
      from.latitude,
      from.longitude,
      to.latitude,
      to.longitude
    );

    // Check if vehicle is heading towards destination
    const headingDifference = Math.abs(bearing - from.heading);
    const normalizedDifference = headingDifference > 180 ? 360 - headingDifference : headingDifference;
    const isHeadingTowards = normalizedDifference <= this.HEADING_TOLERANCE;

    // Adjust speed based on heading
    let adjustedSpeed = effectiveSpeed;
    if (!isHeadingTowards && from.speed > this.MIN_SPEED_KMH) {
      // Vehicle is moving but not towards destination, assume it needs to turn around
      adjustedSpeed = effectiveSpeed * 0.7; // 30% penalty for wrong direction
    }

    const speedMs = (adjustedSpeed * 1000) / 3600; // Convert km/h to m/s
    const etaSeconds = distance / speedMs;

    // Determine confidence based on conditions
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (isHeadingTowards && from.speed > 10 && distance < 2000) {
      confidence = 'high';
    } else if (!isHeadingTowards || from.speed < this.MIN_SPEED_KMH || distance > 4000) {
      confidence = 'low';
    }

    return {
      estimatedArrivalMinutes: Math.round(etaSeconds / 60),
      distanceMeters: Math.round(distance),
      confidence,
      method: 'gps_projection'
    };
  }

  // Cache management methods
  private getCacheKey(from: VehicleLocation, to: { latitude: number; longitude: number }): string {
    // Round coordinates to 4 decimal places (about 11m precision)
    const fromLat = from.latitude.toFixed(4);
    const fromLng = from.longitude.toFixed(4);
    const toLat = to.latitude.toFixed(4);
    const toLng = to.longitude.toFixed(4);
    
    // Include speed range in key (rounded to nearest 10 km/h)
    const speedRange = Math.round(from.speed / 10) * 10;
    
    return `${fromLat},${fromLng}-${toLat},${toLng}-${speedRange}`;
  }

  private getFromCache(key: string): ETAResult | null {
    const entry = this.routeCache[key];
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.CACHE_TTL_MS) {
      delete this.routeCache[key];
      return null;
    }

    return entry.result;
  }

  private addToCache(key: string, result: ETAResult): void {
    // Prevent cache from growing too large
    const cacheSize = Object.keys(this.routeCache).length;
    if (cacheSize >= this.MAX_CACHE_SIZE) {
      this.cleanupCache();
    }

    this.routeCache[key] = {
      result,
      timestamp: Date.now(),
      key
    };
  }

  private cleanupCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of Object.entries(this.routeCache)) {
      if (now - entry.timestamp > this.CACHE_TTL_MS) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => delete this.routeCache[key]);
    
    if (keysToDelete.length > 0) {
      logger.debug(`Cleaned up ${keysToDelete.length} expired cache entries`);
    }
  }

  // Utility methods
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
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

    const bearing = Math.atan2(y, x);
    return (this.toDegrees(bearing) + 360) % 360;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }

  // Public method to get cache statistics
  public getCacheStats(): { size: number; hitRate: number; apiCallsPerMinute: number } {
    return {
      size: Object.keys(this.routeCache).length,
      hitRate: 0, // Would need to track hits/misses for this
      apiCallsPerMinute: this.apiCallCount
    };
  }
}