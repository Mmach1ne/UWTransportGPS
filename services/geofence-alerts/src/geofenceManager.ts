// services/geofence-alerts/src/geofenceManager.ts
import AWS from 'aws-sdk';

export interface Geofence {
  id: string;
  name: string;
  description?: string;
  type: 'circle' | 'polygon';
  coordinates: {
    latitude: number;
    longitude: number;
    radius?: number; // For circle type
    points?: Array<{ lat: number; lng: number }>; // For polygon type
  };
  alertThresholdMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    stopId?: string;
    routeId?: string;
    category?: 'bus_stop' | 'depot' | 'maintenance' | 'restricted';
  };
}

export interface GeofenceAlert {
  vehicleId: string;
  geofenceId: string;
  geofenceName: string;
  eta: ETAResult | null;
  alertType: 'approaching' | 'entered' | 'exited';
  timestamp: Date;
}

export interface ETAResult {
  estimatedArrivalMinutes: number;
  distanceMeters: number;
  route?: any;
}

export class GeofenceManager {
  private dynamodb: AWS.DynamoDB.DocumentClient;
  private tableName: string;

  constructor() {
    this.dynamodb = new AWS.DynamoDB.DocumentClient();
    this.tableName = process.env.GEOFENCE_TABLE_NAME || 'transport-geofences-dev';
  }

  async getAllGeofences(): Promise<Geofence[]> {
    try {
      const result = await this.dynamodb.scan({
        TableName: this.tableName,
        FilterExpression: 'isActive = :active',
        ExpressionAttributeValues: {
          ':active': true
        }
      }).promise();

      return result.Items as Geofence[];
    } catch (error) {
      console.error('Error fetching geofences:', error);
      throw error;
    }
  }

  async getGeofenceById(id: string): Promise<Geofence | null> {
    try {
      const result = await this.dynamodb.get({
        TableName: this.tableName,
        Key: { id }
      }).promise();

      return result.Item as Geofence || null;
    } catch (error) {
      console.error('Error fetching geofence:', error);
      throw error;
    }
  }

  async createGeofence(geofenceData: Omit<Geofence, 'id' | 'createdAt' | 'updatedAt'>): Promise<Geofence> {
    const geofence: Geofence = {
      ...geofenceData,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    try {
      await this.dynamodb.put({
        TableName: this.tableName,
        Item: geofence
      }).promise();

      return geofence;
    } catch (error) {
      console.error('Error creating geofence:', error);
      throw error;
    }
  }

  async updateGeofence(id: string, updates: Partial<Geofence>): Promise<Geofence | null> {
    try {
      const existing = await this.getGeofenceById(id);
      if (!existing) return null;

      const updated = {
        ...existing,
        ...updates,
        updatedAt: new Date()
      };

      await this.dynamodb.put({
        TableName: this.tableName,
        Item: updated
      }).promise();

      return updated;
    } catch (error) {
      console.error('Error updating geofence:', error);
      throw error;
    }
  }

  async deleteGeofence(id: string): Promise<void> {
    try {
      await this.dynamodb.update({
        TableName: this.tableName,
        Key: { id },
        UpdateExpression: 'SET isActive = :active, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':active': false,
          ':updatedAt': new Date()
        }
      }).promise();
    } catch (error) {
      console.error('Error deleting geofence:', error);
      throw error;
    }
  }

  isPointInGeofence(latitude: number, longitude: number, geofence: Geofence): boolean {
    if (geofence.type === 'circle') {
      return this.isPointInCircle(
        latitude,
        longitude,
        geofence.coordinates.latitude,
        geofence.coordinates.longitude,
        geofence.coordinates.radius || 100
      );
    } else if (geofence.type === 'polygon') {
      return this.isPointInPolygon(latitude, longitude, geofence.coordinates.points || []);
    }
    return false;
  }

  private isPointInCircle(
    pointLat: number,
    pointLng: number,
    centerLat: number,
    centerLng: number,
    radiusMeters: number
  ): boolean {
    const distance = this.calculateDistance(pointLat, pointLng, centerLat, centerLng);
    return distance <= radiusMeters;
  }

  private isPointInPolygon(
    pointLat: number,
    pointLng: number,
    polygon: Array<{ lat: number; lng: number }>
  ): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (
        polygon[i].lng > pointLng !== polygon[j].lng > pointLng &&
        pointLat <
          ((polygon[j].lat - polygon[i].lat) * (pointLng - polygon[i].lng)) /
            (polygon[j].lng - polygon[i].lng) +
            polygon[i].lat
      ) {
        inside = !inside;
      }
    }
    return inside;
  }

  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private generateId(): string {
    return `geofence-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Pre-defined geofences for common use cases
  async createBusStopGeofences(): Promise<void> {
    const busStops = [
      {
        name: 'University Station',
        latitude: 43.472215,
        longitude: -80.544134,
        radius: 50
      },
      {
        name: 'Dana Porter Library',
        latitude: 43.468640,
        longitude: -80.542987,
        radius: 30
      },
      {
        name: 'Student Life Centre',
        latitude: 43.468870,
        longitude: -80.540970,
        radius: 40
      }
    ];

    for (const stop of busStops) {
      await this.createGeofence({
        name: stop.name,
        description: `Bus stop at ${stop.name}`,
        type: 'circle',
        coordinates: {
          latitude: stop.latitude,
          longitude: stop.longitude,
          radius: stop.radius
        },
        alertThresholdMinutes: 2,
        isActive: true,
        metadata: {
          category: 'bus_stop'
        }
      });
    }
  }
}