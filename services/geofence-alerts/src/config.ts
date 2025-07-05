import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3001'),
    nodeEnv: process.env.NODE_ENV || 'development'
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
  apis: {
    mapboxKey: process.env.MAPBOX_API_KEY,
    googleMapsKey: process.env.GOOGLE_MAPS_API_KEY
  },
  notifications: {
    highPrioritySNSTopic: process.env.HIGH_PRIORITY_SNS_TOPIC
  },
  websocket: {
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000')
  }
};