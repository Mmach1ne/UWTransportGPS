// services/geofence-alerts/src/geofenceMonitor.ts
import { GeofenceManager } from './geofenceManager';
import { ETACalculator } from './etaCalculator';
import { NotificationService } from './notificationService';
import { logger } from './types/logger';
import { Geofence, VehicleLocation, GeofenceAlert } from './types';
import AWS from 'aws-sdk';

interface VehicleState {
  vehicleId: string;
  lastLocation?: VehicleLocation;
  lastCheckTime: number;
  nearbyGeofences: Set<string>; // Geofences within monitoring range
  activeAlerts: Map<string, number>; // geofenceId -> last alert time
}

interface GeofenceProximity {
  geofence: Geofence;
  distance: number;
  bearing: number;
}

export class GeofenceMonitor {
  private geofenceManager: GeofenceManager;
  private etaCalculator: ETACalculator;
  private notificationService: NotificationService;
  private dynamodb: AWS.DynamoDB.DocumentClient;
  
  // Vehicle state tracking
  private vehicleStates: Map<string, VehicleState> = new Map();
  
  // Optimization parameters
  private readonly MONITORING_RADIUS = 10000; // 10km - start monitoring when this close
  private readonly CHECK_INTERVAL_MS = 30000; // 30 seconds between checks
  private readonly ALERT_COOLDOWN_MS = 300000; // 5 minutes between alerts for same geofence
  private readonly MIN_MOVEMENT_METERS = 50; // Ignore updates if vehicle moved less than this
  private readonly BATCH_SIZE = 10; // Process vehicles in batches
  
  // Performance tracking
  private processedCount = 0;
  private skippedCount = 0;
  private lastReportTime = Date.now();

  constructor(
    notificationService: NotificationService,
    geofenceManager?: GeofenceManager,
    etaCalculator?: ETACalculator
  ) {
    this.notificationService = notificationService;
    this.geofenceManager = geofenceManager || new GeofenceManager();
    this.etaCalculator = etaCalculator || new ETACalculator();
    this.dynamodb = new AWS.DynamoDB.DocumentClient();
    
    // Report statistics periodically
    setInterval(() => this.reportStatistics(), 60000);
  }

  /**
   * Process location updates for multiple vehicles efficiently
   */
  async processLocationUpdates(vehicles: VehicleLocation[]): Promise<void> {
    logger.info(`Processing ${vehicles.length} vehicle location updates`);
    
    // Get all active geofences once
    const activeGeofences = await this.geofenceManager.getAllGeofences();
    const geofenceMap = new Map(activeGeofences.map(g => [g.id, g]));
    
    // Process vehicles in batches to avoid overwhelming the system
    for (let i = 0; i < vehicles.length; i += this.BATCH_SIZE) {
      const batch = vehicles.slice(i, i + this.BATCH_SIZE);
      await Promise.all(batch.map(vehicle => 
        this.processVehicleUpdate(vehicle, geofenceMap)
      ));
    }
  }

  /**
   * Process a single vehicle location update
   */
  private async processVehicleUpdate(
    vehicle: VehicleLocation, 
    geofences: Map<string, Geofence>
  ): Promise<void> {
    try {
      // Get or create vehicle state
      let vehicleState = this.vehicleStates.get(vehicle.id);
      if (!vehicleState) {
        vehicleState = {
          vehicleId: vehicle.id,
          lastCheckTime: 0,
          nearbyGeofences: new Set(),
          activeAlerts: new Map()
        };
        this.vehicleStates.set(vehicle.id, vehicleState);
      }

      // Skip if checked too recently
      const timeSinceLastCheck = Date.now() - vehicleState.lastCheckTime;
      if (timeSinceLastCheck < this.CHECK_INTERVAL_MS) {
        this.skippedCount++;
        return;
      }

      // Skip if vehicle hasn't moved significantly
      if (vehicleState.lastLocation) {
        const movement = this.calculateDistance(
          vehicleState.lastLocation.latitude,
          vehicleState.lastLocation.longitude,
          vehicle.latitude,
          vehicle.longitude
        );
        
        if (movement < this.MIN_MOVEMENT_METERS && vehicle.speed < 5) {
          this.skippedCount++;
          logger.debug(`Vehicle ${vehicle.id} hasn't moved significantly (${movement.toFixed(0)}m)`);
          return;
        }
      }

      // Update vehicle state
      vehicleState.lastLocation = vehicle;
      vehicleState.lastCheckTime = Date.now();

      // Find geofences within monitoring radius
      const nearbyGeofences = this.findNearbyGeofences(vehicle, geofences);
      
      // Update the set of nearby geofences
      vehicleState.nearbyGeofences = new Set(nearbyGeofences.map(p => p.geofence.id));

      // Process only nearby geofences
      for (const proximity of nearbyGeofences) {
        await this.checkGeofenceAlert(vehicle, proximity, vehicleState);
      }

      this.processedCount++;

    } catch (error) {
      logger.error(`Error processing vehicle ${vehicle.id}:`, error);
    }
  }

  /**
   * Find geofences within monitoring radius of the vehicle
   */
  private findNearbyGeofences(
    vehicle: VehicleLocation, 
    geofences: Map<string, Geofence>
  ): GeofenceProximity[] {
    const nearby: GeofenceProximity[] = [];

    for (const geofence of geofences.values()) {
      if (!geofence.isActive) continue;

      const distance = this.calculateDistance(
        vehicle.latitude,
        vehicle.longitude,
        geofence.coordinates.latitude,
        geofence.coordinates.longitude
      );

      // Add buffer based on geofence radius
      const effectiveRadius = this.MONITORING_RADIUS + (geofence.coordinates.radius || 0);

      if (distance <= effectiveRadius) {
        const bearing = this.calculateBearing(
          vehicle.latitude,
          vehicle.longitude,
          geofence.coordinates.latitude,
          geofence.coordinates.longitude
        );

        nearby.push({ geofence, distance, bearing });
      }
    }

    // Sort by distance for prioritized processing
    return nearby.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Check if an alert should be sent for a specific geofence
   */
  private async checkGeofenceAlert(
    vehicle: VehicleLocation,
    proximity: GeofenceProximity,
    vehicleState: VehicleState
  ): Promise<void> {
    const { geofence, distance } = proximity;

    // Check if we've already alerted recently
    const lastAlertTime = vehicleState.activeAlerts.get(geofence.id) || 0;
    const timeSinceLastAlert = Date.now() - lastAlertTime;
    
    if (timeSinceLastAlert < this.ALERT_COOLDOWN_MS) {
      logger.debug(`Skipping alert for ${vehicle.id} -> ${geofence.name} (cooldown)`);
      return;
    }

    // Check if vehicle is inside geofence
    const isInside = this.geofenceManager.isPointInGeofence(
      { lat: vehicle.latitude, lng: vehicle.longitude },
      geofence
    );

    if (isInside) {
      // Send "entered" alert
      await this.sendAlert(vehicle, geofence, 'entered', null);
      vehicleState.activeAlerts.set(geofence.id, Date.now());
      return;
    }

    // For approaching alerts, calculate ETA only if close enough
    const etaThresholdDistance = geofence.alertThresholdMinutes * vehicle.speed * 1000 / 60; // Rough distance
    
    if (distance > etaThresholdDistance * 1.5) {
      // Too far for accurate ETA calculation
      return;
    }

    // Calculate ETA
    const eta = await this.etaCalculator.calculateETA(vehicle.id, geofence.id);
    
    if (eta && eta.estimatedArrivalMinutes <= geofence.alertThresholdMinutes) {
      // Check if vehicle is actually approaching (not moving away)
      const headingDifference = Math.abs(proximity.bearing - vehicle.heading);
      const normalizedDifference = headingDifference > 180 ? 360 - headingDifference : headingDifference;
      
      if (normalizedDifference <= 60) { // Within 60 degrees of target bearing
        await this.sendAlert(vehicle, geofence, 'approaching', eta);
        vehicleState.activeAlerts.set(geofence.id, Date.now());
      }
    }
  }

  /**
   * Send alert through notification service
   */
  private async sendAlert(
    vehicle: VehicleLocation,
    geofence: Geofence,
    alertType: 'approaching' | 'entered' | 'exited',
    eta: any
  ): Promise<void> {
    try {
      await this.notificationService.sendGeofenceAlert({
        vehicleId: vehicle.id,
        geofenceId: geofence.id,
        geofenceName: geofence.name,
        eta: eta,
        alertType: alertType,
        timestamp: new Date(),
        metadata: geofence.metadata
      });

      logger.info(`Alert sent: ${vehicle.id} ${alertType} ${geofence.name}`);
    } catch (error) {
      logger.error('Error sending alert:', error);
    }
  }

  /**
   * Utility methods
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
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

  /**
   * Report performance statistics
   */
  private reportStatistics(): void {
    const duration = (Date.now() - this.lastReportTime) / 1000;
    const processRate = this.processedCount / duration;
    const skipRate = this.skippedCount / duration;
    
    logger.info('Geofence Monitor Statistics:', {
      processedPerSecond: processRate.toFixed(2),
      skippedPerSecond: skipRate.toFixed(2),
      activeVehicles: this.vehicleStates.size,
      cacheStats: this.etaCalculator.getCacheStats()
    });

    // Reset counters
    this.processedCount = 0;
    this.skippedCount = 0;
    this.lastReportTime = Date.now();
  }

  /**
   * Clean up old vehicle states
   */
  public cleanupOldStates(): void {
    const cutoffTime = Date.now() - 3600000; // 1 hour
    const toDelete: string[] = [];

    for (const [vehicleId, state] of this.vehicleStates.entries()) {
      if (state.lastCheckTime < cutoffTime) {
        toDelete.push(vehicleId);
      }
    }

    toDelete.forEach(id => this.vehicleStates.delete(id));
    
    if (toDelete.length > 0) {
      logger.info(`Cleaned up ${toDelete.length} inactive vehicle states`);
    }
  }
}