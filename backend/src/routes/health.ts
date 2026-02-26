/**
 * Health Check Routes
 * 
 * Provides comprehensive health monitoring endpoints for system status,
 * performance metrics, and service availability
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { verifyAdminPrivileges } from '../middleware/adminAuth';
import { errorMonitoring } from '../services/errorMonitoringService';
import { externalApiMonitoring } from '../services/externalApiMonitoringService';
import { prisma } from '../lib/prisma';
import redisClient from '../lib/redis';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Basic health check endpoint (public)
 * GET /health
 */
router.get('/', async (req, res) => {
  try {
    const [health, externalHealth] = await Promise.all([
      errorMonitoring.getSystemHealth(),
      externalApiMonitoring.getOverallHealth(),
    ]);

    // Combine internal and external service health
    const overallStatus = health.status === 'unhealthy' || externalHealth.status === 'unhealthy' ? 'unhealthy' :
      health.status === 'degraded' || externalHealth.status === 'degraded' ? 'degraded' : 'healthy';

    const statusCode = overallStatus === 'healthy' ? 200 :
      overallStatus === 'degraded' ? 200 : 503;

    res.status(statusCode).json({
      status: overallStatus,
      timestamp: health.timestamp,
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      services: {
        ...health.services,
        external_apis: externalHealth.status,
      },
      external: {
        totalServices: externalHealth.totalServices,
        healthyServices: externalHealth.healthyServices,
        criticalServicesDown: externalHealth.criticalServicesDown,
      },
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

/**
 * Detailed health check (admin only)
 * GET /health/detailed
 */
router.get('/detailed', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const health = await errorMonitoring.getSystemHealth();
    const activeAlerts = errorMonitoring.getActiveAlerts();

    res.json({
      ...health,
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      process: {
        pid: process.pid,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
      },
      activeAlerts: activeAlerts.map(alert => ({
        id: alert.id,
        level: alert.level,
        type: alert.type,
        message: alert.message,
        timestamp: alert.timestamp,
      })),
    });
  } catch (error) {
    logger.error('Detailed health check failed', { error });
    res.status(500).json({
      error: 'Detailed health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Database health check
 * GET /health/database
 */
router.get('/database', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const start = Date.now();

    // Test basic connectivity with SQLite
    await prisma.$queryRaw`SELECT 1`;

    // Test write capability
    const testLog = await prisma.systemLog.create({
      data: {
        level: 'INFO',
        message: 'Database health check',
        meta: JSON.stringify({ healthCheck: true, timestamp: new Date() }),
      },
    });

    // Clean up test log
    await prisma.systemLog.delete({
      where: { id: testLog.id },
    });

    const duration = Date.now() - start;

    // Get database stats
    const stats = await Promise.all([
      prisma.user.count(),
      prisma.meeting.count(),
      prisma.systemLog.count(),
    ]);

    res.json({
      status: 'connected',
      responseTime: duration,
      timestamp: new Date().toISOString(),
      stats: {
        users: stats[0],
        meetings: stats[1],
        logs: stats[2],
      },
    });
  } catch (error) {
    logger.error('Database health check failed', { error });
    res.status(503).json({
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Redis health check
 * GET /health/redis
 */
router.get('/redis', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const start = Date.now();

    // Test basic connectivity
    const pong = await redisClient.ping();

    // Test write/read capability
    const testKey = `health_check_${Date.now()}`;
    await redisClient.set(testKey, 'test_value', 10);
    const testValue = await redisClient.get(testKey);
    await redisClient.del(testKey);

    const duration = Date.now() - start;

    // Get Redis info
    const info = await redisClient.getClient().info();
    const memory = await redisClient.getClient().info('memory');

    res.json({
      status: 'connected',
      responseTime: duration,
      timestamp: new Date().toISOString(),
      ping: pong,
      testResult: testValue === 'test_value' ? 'passed' : 'failed',
      info: {
        version: info.split('\n').find(line => line.startsWith('redis_version:'))?.split(':')[1]?.trim(),
        uptime: info.split('\n').find(line => line.startsWith('uptime_in_seconds:'))?.split(':')[1]?.trim(),
        memory: memory.split('\n').find(line => line.startsWith('used_memory_human:'))?.split(':')[1]?.trim(),
      },
    });
  } catch (error) {
    logger.error('Redis health check failed', { error });
    res.status(503).json({
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Performance metrics
 * GET /health/metrics
 */
router.get('/metrics', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const { timeframe = '1h' } = req.query;

    // Calculate time range
    const now = new Date();
    let startTime: Date;

    switch (timeframe) {
      case '5m':
        startTime = new Date(now.getTime() - 5 * 60 * 1000);
        break;
      case '15m':
        startTime = new Date(now.getTime() - 15 * 60 * 1000);
        break;
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
    }

    // Get metrics from database
    const [requestMetrics, errorMetrics, performanceMetrics] = await Promise.all([
      // Request count and response times
      prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('minute', created_at) as minute,
          COUNT(*) as request_count,
          AVG(CAST(meta->>'duration' AS NUMERIC)) as avg_response_time
        FROM system_logs 
        WHERE created_at >= ${startTime}
        AND message = 'HTTP Request Completed'
        GROUP BY DATE_TRUNC('minute', created_at)
        ORDER BY minute
      `,

      // Error counts by level
      prisma.$queryRaw`
        SELECT 
          level,
          COUNT(*) as count
        FROM system_logs 
        WHERE created_at >= ${startTime}
        AND level IN ('ERROR', 'WARN')
        GROUP BY level
      `,

      // Performance metrics
      prisma.$queryRaw`
        SELECT 
          meta->>'operation' as operation,
          AVG(CAST(meta->>'duration' AS NUMERIC)) as avg_duration,
          MAX(CAST(meta->>'duration' AS NUMERIC)) as max_duration,
          COUNT(*) as count
        FROM system_logs 
        WHERE created_at >= ${startTime}
        AND meta->>'category' = 'performance'
        GROUP BY meta->>'operation'
        ORDER BY avg_duration DESC
      `,
    ]);

    // Get current system metrics
    const health = await errorMonitoring.getSystemHealth();

    res.json({
      timeframe,
      startTime,
      endTime: now,
      current: health.metrics,
      historical: {
        requests: requestMetrics,
        errors: errorMetrics,
        performance: performanceMetrics,
      },
      alerts: {
        active: errorMonitoring.getActiveAlerts().length,
        rules: errorMonitoring.getAlertRules().length,
      },
    });
  } catch (error) {
    logger.error('Failed to get performance metrics', { error });
    res.status(500).json({
      error: 'Failed to get performance metrics',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Alert management
 * GET /health/alerts
 */
router.get('/alerts', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const activeAlerts = errorMonitoring.getActiveAlerts();
    const alertRules = errorMonitoring.getAlertRules();

    res.json({
      active: activeAlerts,
      rules: alertRules,
      summary: {
        total: activeAlerts.length,
        critical: activeAlerts.filter(a => a.level === 'critical').length,
        high: activeAlerts.filter(a => a.level === 'high').length,
        medium: activeAlerts.filter(a => a.level === 'medium').length,
        low: activeAlerts.filter(a => a.level === 'low').length,
      },
    });
  } catch (error) {
    logger.error('Failed to get alerts', { error });
    res.status(500).json({
      error: 'Failed to get alerts',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Resolve alert
 * POST /health/alerts/:alertId/resolve
 */
router.post('/alerts/:alertId/resolve', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const { alertId } = req.params;
    const resolvedBy = req.user?.id || 'system';

    const success = await errorMonitoring.resolveAlert(alertId as string, resolvedBy as string);

    if (success) {
      res.json({
        success: true,
        message: 'Alert resolved successfully',
        alertId,
        resolvedBy,
        resolvedAt: new Date().toISOString(),
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Alert not found',
        alertId,
      });
    }
  } catch (error) {
    logger.error('Failed to resolve alert', { error, alertId: req.params.alertId });
    res.status(500).json({
      success: false,
      error: 'Failed to resolve alert',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * System status summary
 * GET /health/status
 */
router.get('/status', async (req, res) => {
  try {
    const health = await errorMonitoring.getSystemHealth();

    // Simple status response for monitoring tools
    res.json({
      status: health.status,
      timestamp: health.timestamp,
      services: Object.entries(health.services).map(([name, status]) => ({
        name,
        status,
        healthy: status === 'connected' || status === 'available',
      })),
      alerts: health.alerts.active > 0 ? 'active' : 'none',
    });
  } catch (error) {
    logger.error('Status check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Status check failed',
    });
  }
});

/**
 * Readiness probe (for Kubernetes)
 * GET /health/ready
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if essential services are ready
    const [dbReady, redisReady] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      redisClient.ping().then(() => true).catch(() => false),
    ]);

    // In development, Redis is optional
    const isReady = process.env.NODE_ENV === 'development' ? dbReady : (dbReady && redisReady);

    if (isReady) {
      res.status(200).json({
        ready: true,
        timestamp: new Date().toISOString(),
        services: {
          database: dbReady,
          redis: redisReady,
        },
      });
    } else {
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        services: {
          database: dbReady,
          redis: redisReady,
        },
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', { error });
    res.status(503).json({
      ready: false,
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
    });
  }
});

/**
 * Liveness probe (for Kubernetes)
 * GET /health/live
 */
router.get('/live', (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
  });
});

/**
 * External API health check
 * GET /health/external
 */
router.get('/external', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const overallHealth = externalApiMonitoring.getOverallHealth();
    const serviceStatuses = externalApiMonitoring.getAllServiceStatus();

    res.json({
      overall: overallHealth,
      services: serviceStatuses,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('External API health check failed', { error });
    res.status(500).json({
      error: 'External API health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * External API service metrics
 * GET /health/external/:serviceId/metrics
 */
router.get('/external/:serviceId/metrics', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { limit = '100' } = req.query;

    const status = externalApiMonitoring.getServiceStatus(serviceId as string);
    const metrics = externalApiMonitoring.getServiceMetrics(serviceId as string, parseInt(limit as string));

    if (!status) {
      res.status(404).json({
        error: 'Service not found',
        serviceId,
      });
      return;
    }

    res.json({
      serviceId,
      status,
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get external service metrics', { error });
    res.status(500).json({
      error: 'Failed to get external service metrics',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Force check all external services
 * POST /health/external/check
 */
router.post('/external/check', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    await externalApiMonitoring.checkAllServices();

    res.json({
      success: true,
      message: 'Health check initiated for all external services',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to check external services', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to check external services',
      timestamp: new Date().toISOString(),
    });
  }
});

export { router as healthRoutes };