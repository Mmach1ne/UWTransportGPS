// services/geofence-alerts/src/notificationService.ts
import WebSocket from 'ws';
import AWS from 'aws-sdk';

export interface GeofenceAlert {
  id: string;
  vehicleId: string;
  geofenceId: string;
  geofenceName: string;
  eta: any;
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

export interface WebSocketMessage {
  type: 'geofence_alert' | 'eta_update' | 'alert_acknowledged';
  data: any;
  timestamp: Date;
}

export class NotificationService {
  private wss: WebSocket.Server;
  private dynamodb: AWS.DynamoDB.DocumentClient;
  private alertsTableName: string;
  private activeAlerts: Map<string, GeofenceAlert> = new Map();

  constructor(wss: WebSocket.Server) {
    this.wss = wss;
    this.dynamodb = new AWS.DynamoDB.DocumentClient();
    this.alertsTableName = process.env.ALERTS_TABLE_NAME || 'transport-alerts-dev';
  }

  async sendGeofenceAlert(alertData: Omit<GeofenceAlert, 'id' | 'acknowledged' | 'priority'>): Promise<void> {
    try {
      const alert: GeofenceAlert = {
        ...alertData,
        id: this.generateAlertId(),
        acknowledged: false,
        priority: this.calculatePriority(alertData)
      };

      // Store alert in database
      await this.storeAlert(alert);

      // Add to active alerts
      this.activeAlerts.set(alert.id, alert);

      // Send to all connected WebSocket clients
      this.broadcastToClients({
        type: 'geofence_alert',
        data: alert,
        timestamp: new Date()
      });

      console.log(`Sent geofence alert: ${alert.alertType} for vehicle ${alert.vehicleId} at ${alert.geofenceName}`);

      // Send email/SMS notifications for high priority alerts
      if (alert.priority === 'high') {
        await this.sendHighPriorityNotification(alert);
      }

    } catch (error) {
      console.error('Error sending geofence alert:', error);
      throw error;
    }
  }

  async sendETAUpdate(vehicleId: string, geofenceId: string, eta: any): Promise<void> {
    try {
      const message: WebSocketMessage = {
        type: 'eta_update',
        data: {
          vehicleId,
          geofenceId,
          eta
        },
        timestamp: new Date()
      };

      this.broadcastToClients(message);
    } catch (error) {
      console.error('Error sending ETA update:', error);
    }
  }

  async acknowledgeAlert(alertId: string, userId?: string): Promise<boolean> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) return false;

      alert.acknowledged = true;

      // Update in database
      await this.dynamodb.update({
        TableName: this.alertsTableName,
        Key: { id: alertId },
        UpdateExpression: 'SET acknowledged = :ack, acknowledgedAt = :time, acknowledgedBy = :user',
        ExpressionAttributeValues: {
          ':ack': true,
          ':time': new Date().toISOString(),
          ':user': userId || 'unknown'
        }
      }).promise();

      // Broadcast acknowledgment
      this.broadcastToClients({
        type: 'alert_acknowledged',
        data: { alertId, acknowledgedBy: userId },
        timestamp: new Date()
      });

      // Remove from active alerts after a delay
      setTimeout(() => {
        this.activeAlerts.delete(alertId);
      }, 30000); // Keep for 30 seconds after acknowledgment

      return true;
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      return false;
    }
  }

  async getActiveAlerts(): Promise<GeofenceAlert[]> {
    return Array.from(this.activeAlerts.values());
  }

  private broadcastToClients(message: WebSocketMessage): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error('Error sending message to WebSocket client:', error);
        }
      }
    });
  }

  private async storeAlert(alert: GeofenceAlert): Promise<void> {
    try {
      await this.dynamodb.put({
        TableName: this.alertsTableName,
        Item: {
          ...alert,
          ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours TTL
        }
      }).promise();
    } catch (error) {
      console.error('Error storing alert:', error);
      throw error;
    }
  }

  private calculatePriority(alertData: Omit<GeofenceAlert, 'id' | 'acknowledged' | 'priority'>): 'low' | 'medium' | 'high' {
    // High priority: Vehicle entering restricted area or major delay
    if (alertData.alertType === 'entered' && alertData.geofenceName.toLowerCase().includes('restricted')) {
      return 'high';
    }

    // High priority: ETA significantly behind schedule
    if (alertData.eta && alertData.metadata?.scheduledArrival) {
      const scheduledTime = new Date(alertData.metadata.scheduledArrival).getTime();
      const estimatedTime = Date.now() + (alertData.eta.estimatedArrivalMinutes * 60 * 1000);
      const delayMinutes = (estimatedTime - scheduledTime) / (60 * 1000);
      
      if (delayMinutes > 15) return 'high';
      if (delayMinutes > 5) return 'medium';
    }

    // Medium priority: Approaching important stops
    if (alertData.alertType === 'approaching' && alertData.eta?.estimatedArrivalMinutes <= 2) {
      return 'medium';
    }

    return 'low';
  }

  private async sendHighPriorityNotification(alert: GeofenceAlert): Promise<void> {
    try {
      // Send SNS notification for high priority alerts
      const sns = new AWS.SNS();
      const topicArn = process.env.HIGH_PRIORITY_SNS_TOPIC;
      
      if (topicArn) {
        await sns.publish({
          TopicArn: topicArn,
          Subject: `High Priority Alert: ${alert.alertType} - ${alert.geofenceName}`,
          Message: JSON.stringify({
            alertId: alert.id,
            vehicleId: alert.vehicleId,
            geofenceName: alert.geofenceName,
            alertType: alert.alertType,
            timestamp: alert.timestamp,
            eta: alert.eta
          }, null, 2)
        }).promise();
      }
    } catch (error) {
      console.error('Error sending high priority notification:', error);
    }
  }

  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Clean up old alerts periodically
  startCleanupTask(): void {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 2 * 60 * 60 * 1000; // 2 hours

      for (const [id, alert] of this.activeAlerts.entries()) {
        if (now - alert.timestamp.getTime() > maxAge) {
          this.activeAlerts.delete(id);
        }
      }
    }, 15 * 60 * 1000); // Run every 15 minutes
  }
}