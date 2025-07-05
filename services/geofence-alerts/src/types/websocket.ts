import { WebSocket } from 'ws';

export interface WebSocketMetadata {
  subscription?: string;
  userId?: string;
  connectedAt?: Date;
}

export interface ExtendedWebSocket extends WebSocket {
  metadata?: WebSocketMetadata;
}

export interface WebSocketMessage {
  type: 'geofence_alert' | 'eta_update' | 'alert_acknowledged' | 'connection' | 'error' | 'ping' | 'pong' | 'subscribed' | 'unsubscribed';
  data?: any;
  timestamp: Date;
  message?: string;
  geofenceId?: string;
}