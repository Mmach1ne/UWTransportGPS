export * from './websocket';

export interface Geofence {
  id: string;
  name: string;
  description?: string;
  type: 'circle' | 'polygon';
  coordinates: {
    latitude: number;
    longitude: number;
    radius?: number;
    points?: Array<{ lat: number; lng: number }>;
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
  id: string;
  vehicleId: string;
  geofenceId: string;
  geofenceName: string;
  eta: ETAResult | null;
  alertType: 'approaching' | 'entered' | 'exited';
  timestamp: Date;
  acknowledged: boolean;
  priority: 'low' | 'medium' | 'high';
  metadata?: {
    passengerCount?: number;
    routeId?: string;
    scheduledArrival?: Date;
  };
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

export interface VehicleLocation {
  id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: Date;
}