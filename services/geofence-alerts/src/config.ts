import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '*'
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  dynamodb: {
    geofenceTable: process.env.GEOFENCE_TABLE_NAME || 'transport-geofences-dev',
    locationTable: process.env.LOCATION_TABLE_NAME || 'transport-locations-dev',
    alertsTable: process.env.ALERTS_TABLE_NAME || 'transport-alerts-dev'
  },
  database: {
    url: process.env.DATABASE_URL || 'mongodb://localhost:27017/geofence-alerts'
  },
    redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  apis: {
    mapboxKey: process.env.MAPBOX_API_KEY,
  },
  notifications: {
    cleanupIntervalMinutes: parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '60', 10),
    alertRetentionHours: parseInt(process.env.ALERT_RETENTION_HOURS || '24', 10)
  },
  websocket: {
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000')
  }
};