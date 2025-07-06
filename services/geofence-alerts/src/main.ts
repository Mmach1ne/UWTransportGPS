import express, { Request, Response, NextFunction, Application } from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import { GeofenceManager } from './geofenceManager';
import { ETACalculator } from './etaCalculator';
import { NotificationService } from './notificationService';
import { config } from './config';
import { logger } from './types/logger';
import { ExtendedWebSocket, WebSocketMessage } from './types';

// Import middleware modules directly
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

// Explicitly type the Express app
const app: Application = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Apply middleware - use require() imports to avoid type issues
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Import the optimized GeofenceMonitor
import { GeofenceMonitor } from './geofenceMonitor';

// Initialize services
const geofenceManager = new GeofenceManager();
const etaCalculator = new ETACalculator();
const notificationService = new NotificationService(wss);
const geofenceMonitor = new GeofenceMonitor(notificationService, geofenceManager, etaCalculator);

// WebSocket connection handling
wss.on('connection', (ws, request) => {
  // Cast to our extended type
  const extendedWs = ws as ExtendedWebSocket;
  
  logger.info('New WebSocket connection established', { 
    ip: request.socket.remoteAddress,
    userAgent: request.headers['user-agent']
  });
  
  // Initialize metadata
  extendedWs.metadata = {
    connectedAt: new Date()
  };
  
  extendedWs.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleWebSocketMessage(extendedWs, data);
    } catch (error) {
      logger.error('Invalid WebSocket message:', error);
      extendedWs.send(JSON.stringify({ 
        type: 'error', 
        message: 'Invalid message format',
        timestamp: new Date()
      } as WebSocketMessage));
    }
  });

  extendedWs.on('close', () => {
    logger.info('WebSocket connection closed');
  });

  extendedWs.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });

  // Send welcome message
  extendedWs.send(JSON.stringify({
    type: 'connection',
    message: 'Connected to geofence alerts',
    timestamp: new Date()
  } as WebSocketMessage));
});

function handleWebSocketMessage(ws: ExtendedWebSocket, data: any) {
  try {
    switch (data.type) {
      case 'subscribe':
        if (ws.metadata) {
          ws.metadata.subscription = data.geofenceId;
        }
        ws.send(JSON.stringify({
          type: 'subscribed',
          message: `Subscribed to ${data.geofenceId || 'all alerts'}`,
          geofenceId: data.geofenceId,
          timestamp: new Date()
        } as WebSocketMessage));
        break;
        
      case 'unsubscribe':
        if (ws.metadata) {
          delete ws.metadata.subscription;
        }
        ws.send(JSON.stringify({
          type: 'unsubscribed',
          message: 'Unsubscribed from alerts',
          timestamp: new Date()
        } as WebSocketMessage));
        break;
        
      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date()
        } as WebSocketMessage));
        break;
        
      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${data.type}`,
          timestamp: new Date()
        } as WebSocketMessage));
    }
  } catch (error) {
    logger.error('Error handling WebSocket message:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Error processing message',
      timestamp: new Date()
    } as WebSocketMessage));
  }
}

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    environment: config.server.nodeEnv,
    websocketConnections: wss.clients.size
  });
});

// Monitoring endpoint for optimization stats
app.get('/api/monitoring/stats', async (req: Request, res: Response) => {
  try {
    const stats = {
      etaCalculator: etaCalculator.getCacheStats(),
      optimization: {
        config: {
          maxApiDistance: 5000,
          cacheEnabled: true,
          smartApiUsage: true
        },
        estimates: estimateMonthlyApiCalls(50, 8), // Assuming 50 vehicles, 8 hours/day
        recommendations: getOptimizationRecommendations(
          etaCalculator.getCacheStats().apiCallsPerMinute * 60 * 24 * 30
        )
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        activeWebSockets: wss.clients.size
      }
    };
    
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get monitoring stats:', error);
    res.status(500).json({ error: 'Failed to get monitoring stats' });
  }
});

// Cost estimation endpoint
app.get('/api/monitoring/cost-estimate', async (req: Request, res: Response) => {
  try {
    const vehicleCount = parseInt(req.query.vehicles as string) || 50;
    const hoursPerDay = parseInt(req.query.hours as string) || 8;
    
    const estimate = estimateMonthlyApiCalls(vehicleCount, hoursPerDay);
    
    res.json({
      parameters: {
        vehicleCount,
        hoursPerDay
      },
      estimate,
      currentUsage: {
        apiCallsPerMinute: etaCalculator.getCacheStats().apiCallsPerMinute,
        projectedMonthlyCalls: etaCalculator.getCacheStats().apiCallsPerMinute * 60 * 24 * 30
      }
    });
  } catch (error) {
    logger.error('Failed to calculate cost estimate:', error);
    res.status(500).json({ error: 'Failed to calculate cost estimate' });
  }
});
app.get('/api/monitoring/stats', async (req: Request, res: Response) => {
  try {
    const stats = {
      etaCalculator: etaCalculator.getCacheStats(),
      optimization: {
        config: {
          maxApiDistance: config.optimization?.maxApiDistance || 5000,
          cacheEnabled: true,
          smartApiUsage: true
        },
        estimates: estimateMonthlyApiCalls(50, 8), // Assuming 50 vehicles, 8 hours/day
        recommendations: getOptimizationRecommendations(
          etaCalculator.getCacheStats().apiCallsPerMinute * 60 * 24 * 30
        )
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        activeWebSockets: wss.clients.size
      }
    };
    
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get monitoring stats:', error);
    res.status(500).json({ error: 'Failed to get monitoring stats' });
  }
});

// Cost estimation endpoint
app.get('/api/monitoring/cost-estimate', async (req: Request, res: Response) => {
  try {
    const vehicleCount = parseInt(req.query.vehicles as string) || 50;
    const hoursPerDay = parseInt(req.query.hours as string) || 8;
    
    const estimate = estimateMonthlyApiCalls(vehicleCount, hoursPerDay);
    
    res.json({
      parameters: {
        vehicleCount,
        hoursPerDay
      },
      estimate,
      currentUsage: {
        apiCallsPerMinute: etaCalculator.getCacheStats().apiCallsPerMinute,
        projectedMonthlyCalls: etaCalculator.getCacheStats().apiCallsPerMinute * 60 * 24 * 30
      }
    });
  } catch (error) {
    logger.error('Failed to calculate cost estimate:', error);
    res.status(500).json({ error: 'Failed to calculate cost estimate' });
  }
});

// API Routes
app.get('/api/geofences', async (req: Request, res: Response) => {
  try {
    const geofences = await geofenceManager.getAllGeofences();
    res.json(geofences);
  } catch (error) {
    logger.error('Failed to fetch geofences:', error);
    res.status(500).json({ error: 'Failed to fetch geofences' });
  }
});

app.post('/api/geofences', async (req: Request, res: Response) => {
  try {
    const geofence = await geofenceManager.createGeofence(req.body);
    logger.info('Created geofence:', { id: geofence.id, name: geofence.name });
    res.status(201).json(geofence);
  } catch (error) {
    logger.error('Failed to create geofence:', error);
    res.status(500).json({ error: 'Failed to create geofence' });
  }
});

app.put('/api/geofences/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const geofence = await geofenceManager.updateGeofence(req.params.id, req.body);
    if (!geofence) {
      res.status(404).json({ error: 'Geofence not found' });
      return;
    }
    logger.info('Updated geofence:', { id: geofence.id });
    res.json(geofence);
  } catch (error) {
    logger.error('Failed to update geofence:', error);
    res.status(500).json({ error: 'Failed to update geofence' });
  }
});

app.delete('/api/geofences/:id', async (req: Request, res: Response) => {
  try {
    await geofenceManager.deleteGeofence(req.params.id);
    logger.info('Deleted geofence:', { id: req.params.id });
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete geofence:', error);
    res.status(500).json({ error: 'Failed to delete geofence' });
  }
});

app.get('/api/eta/:vehicleId/:geofenceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { vehicleId, geofenceId } = req.params;
    const eta = await etaCalculator.calculateETA(vehicleId, geofenceId);
    if (!eta) {
      res.status(404).json({ error: 'Unable to calculate ETA' });
      return;
    }
    res.json(eta);
  } catch (error) {
    logger.error('Failed to calculate ETA:', error);
    res.status(500).json({ error: 'Failed to calculate ETA' });
  }
});

app.get('/api/alerts', async (req: Request, res: Response) => {
  try {
    const alerts = await notificationService.getActiveAlerts();
    res.json(alerts);
  } catch (error) {
    logger.error('Failed to fetch alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

app.post('/api/alerts/:id/acknowledge', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const success = await notificationService.acknowledgeAlert(id, userId);
    if (!success) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    logger.info('Alert acknowledged:', { alertId: id, userId });
    res.json({ message: 'Alert acknowledged' });
  } catch (error) {
    logger.error('Failed to acknowledge alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Mock function - replace with actual vehicle data integration
async function getActiveVehicles() {
  try {
    // This would integrate with your TrackStore service
    // For now, return empty array to prevent errors
    return [];
  } catch (error) {
    logger.error('Error fetching active vehicles:', error);
    return [];
  }
}

async function checkGeofenceAlerts(vehicle: any) {
  try {
    const geofences = await geofenceManager.getAllGeofences();
    
    for (const geofence of geofences) {
      // Check if vehicle is approaching geofence
      const eta = await etaCalculator.calculateETA(vehicle.id, geofence.id);
      
      if (eta && eta.estimatedArrivalMinutes <= geofence.alertThresholdMinutes) {
        await notificationService.sendGeofenceAlert({
          vehicleId: vehicle.id,
          geofenceId: geofence.id,
          geofenceName: geofence.name,
          eta: eta,
          alertType: 'approaching',
          timestamp: new Date()
        });
      }

      // Additional geofence logic would go here
    }
  } catch (error) {
    logger.error('Error checking geofence alerts for vehicle:', error);
  }
}

async function processLocationUpdates() {
  try {
    const vehicles = await getActiveVehicles();
    for (const vehicle of vehicles) {
      await checkGeofenceAlerts(vehicle);
    }
  } catch (error) {
    logger.error('Error processing location updates:', error);
  }
}

// Start the location processing loop
setInterval(processLocationUpdates, 30000);

// Start notification service cleanup
notificationService.startCleanupTask();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Clear intervals
  clearInterval(locationProcessingInterval);
  clearInterval(cleanupInterval);
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  // Clear intervals
  clearInterval(locationProcessingInterval);
  clearInterval(cleanupInterval);
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

const PORT = config.server.port;
server.listen(PORT, () => {
  logger.info(`Geofence Alert Service running on port ${PORT}`, {
    environment: config.server.nodeEnv,
    region: config.aws.region
  });
});

export default app;