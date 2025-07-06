import { Geofence } from './types';
import { logger } from './types/logger';

export class GeofenceManager {
  private geofences: Map<string, Geofence> = new Map();

  constructor() {
    // Initialize with some sample data or load from database
    this.initializeGeofences();
  }

  private initializeGeofences() {
    // This would typically load from a database
    // For now, we'll use in-memory storage
    logger.info('GeofenceManager initialized');
  }

  async getAllGeofences(): Promise<Geofence[]> {
    return Array.from(this.geofences.values());
  }

  async getGeofence(id: string): Promise<Geofence | null> {
    return this.geofences.get(id) || null;
  }

  async createGeofence(data: Partial<Geofence>): Promise<Geofence> {
    const geofence: Geofence = {
      id: this.generateId(),
      name: data.name || 'Unnamed Geofence',
      description: data.description,
      type: data.type || 'circle',
      coordinates: data.coordinates || {
        latitude: 0,
        longitude: 0,
        radius: 100
      },
      alertThresholdMinutes: data.alertThresholdMinutes || 5,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: data.metadata
    };

    this.geofences.set(geofence.id, geofence);
    logger.info('Geofence created', { id: geofence.id, name: geofence.name });
    return geofence;
  }

  async updateGeofence(id: string, data: Partial<Geofence>): Promise<Geofence | null> {
    const existing = this.geofences.get(id);
    if (!existing) {
      return null;
    }

    const updated: Geofence = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date()
    };

    this.geofences.set(id, updated);
    logger.info('Geofence updated', { id });
    return updated;
  }

  async deleteGeofence(id: string): Promise<boolean> {
    const result = this.geofences.delete(id);
    if (result) {
      logger.info('Geofence deleted', { id });
    }
    return result;
  }

  private generateId(): string {
    return `gf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Check if a point is inside a geofence
  isPointInGeofence(point: { lat: number; lng: number }, geofence: Geofence): boolean {
    if (geofence.type === 'circle') {
      return this.isPointInCircle(point, geofence);
    } else if (geofence.type === 'polygon') {
      return this.isPointInPolygon(point, geofence);
    }
    return false;
  }

  private isPointInCircle(point: { lat: number; lng: number }, geofence: Geofence): boolean {
    if (!geofence.coordinates.radius) return false;
    
    const distance = this.calculateDistance(
      point.lat,
      point.lng,
      geofence.coordinates.latitude,
      geofence.coordinates.longitude
    );
    
    return distance <= geofence.coordinates.radius;
  }

  private isPointInPolygon(point: { lat: number; lng: number }, geofence: Geofence): boolean {
    if (!geofence.coordinates.points) return false;
    
    const points = geofence.coordinates.points;
    let inside = false;
    
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].lat, yi = points[i].lng;
      const xj = points[j].lat, yj = points[j].lng;
      
      const intersect = ((yi > point.lng) !== (yj > point.lng))
        && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}