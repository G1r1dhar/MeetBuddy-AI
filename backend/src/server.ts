import dotenv from 'dotenv';
// Load environment variables immediately
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Fix BigInt serialization globally
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger, apiRequestLogger, errorRequestLogger } from './middleware/requestLogger';
import { comprehensiveSecurityMonitoring } from './middleware/securityMonitoring';
import { auditTrailMiddleware } from './middleware/auditTrail';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { meetingRoutes } from './routes/meetings';
import { transcriptRoutes } from './routes/transcripts';
import { summaryRoutes } from './routes/summaries';
import { platformRoutes } from './routes/platforms';
import { platformCaptureRoutes } from './routes/platformCapture';
import { adminRoutes } from './routes/admin';
import { securityRoutes } from './routes/security';
import { fileRoutes } from './routes/files';
import { logRoutes } from './routes/logs';
import { healthRoutes } from './routes/health';
import { monitoringRoutes } from './routes/monitoring';
import { storageRoutes } from './routes/storage';
import { whisperRoutes } from './routes/whisper';
import { setupSocketHandlers } from './sockets/socketHandlers';
import { connectDatabase } from './lib/prisma';
import redisClient from './lib/redis';
import { CleanupService } from './services/cleanupService';
import { MeetingAutoCompleteService } from './services/meetingAutoCompleteService';
import {
  performanceMonitoring,
  errorTrackingMiddleware,
  securityEventTracking,
  apiUsageTracking,
  authenticationTracking,
  rateLimitTracking
} from './middleware/errorMonitoring';
import { errorMonitoring } from './services/errorMonitoringService';
import { externalApiMonitoring } from './services/externalApiMonitoringService';


const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 10000,
  transports: ['websocket', 'polling'],
});

const PORT = process.env.PORT || 5000;

// Initialize services
const cleanupService = new CleanupService();
const autoCompleteService = new MeetingAutoCompleteService();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ],
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);
app.use(apiRequestLogger);

// Error monitoring and performance tracking
app.use(performanceMonitoring);
app.use(securityEventTracking);
app.use(apiUsageTracking);
app.use(authenticationTracking);
app.use(rateLimitTracking);

// Security monitoring and audit trail
app.use('/api/', comprehensiveSecurityMonitoring);
app.use('/api/', auditTrailMiddleware);

// Health check routes
app.use('/health', healthRoutes);

// Monitoring dashboard routes
app.use('/api/monitoring', monitoringRoutes);

// Static file serving for uploads
app.use('/files', express.static(process.env.UPLOAD_DIR || 'uploads'));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/summaries', summaryRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/platform-capture', platformCaptureRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/whisper', whisperRoutes);

// Socket.IO setup
setupSocketHandlers(io);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
});

// Error request logging (before global error handler)
app.use(errorRequestLogger);

// Error tracking middleware (before global error handler)
app.use(errorTrackingMiddleware);

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  errorMonitoring.stopHealthChecks();
  cleanupService.stop();
  autoCompleteService.stop();
  // externalApiMonitoring.stop();
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  errorMonitoring.stopHealthChecks();
  cleanupService.stop();
  autoCompleteService.stop();
  // externalApiMonitoring.stop();
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  errorMonitoring.trackError(error, {
    operation: 'uncaught_exception',
    metadata: { fatal: true },
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  const error = reason instanceof Error ? reason : new Error(String(reason));
  errorMonitoring.trackError(error, {
    operation: 'unhandled_rejection',
    metadata: { fatal: false },
  });
});

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();

    // Try to connect to Redis (optional in development)
    try {
      await redisClient.connect();
      logger.info('✅ Redis connected successfully');
    } catch (error) {
      logger.warn('⚠️  Redis connection failed - continuing without cache', { error });
    }

    // Start external API monitoring (temporarily disabled for development)
    // externalApiMonitoring.start();

    // Start services
    cleanupService.start();
    autoCompleteService.start();

    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🚀 MeetBuddy AI Backend Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      logger.info(`💾 Database: SQLite (${process.env.DATABASE_URL})`);
      logger.info(`🔍 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

startServer();

export { app, server, io };