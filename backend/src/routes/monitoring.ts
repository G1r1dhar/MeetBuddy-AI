/**
 * Monitoring Dashboard Routes
 * 
 * Provides comprehensive monitoring endpoints for system observability,
 * performance tracking, and operational insights
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { verifyAdminPrivileges } from '../middleware/adminAuth';
import { errorMonitoring } from '../services/errorMonitoringService';
import { externalApiMonitoring } from '../services/externalApiMonitoringService';
import { notificationService } from '../services/notificationService';
import { LogAggregator } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router = Router();

/**
 * System overview dashboard
 * GET /monitoring/overview
 */
router.get('/overview', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const [
      systemHealth,
      externalHealth,
      activeAlerts,
      logStats,
      systemMetrics,
    ] = await Promise.all([
      errorMonitoring.getSystemHealth(),
      externalApiMonitoring.getOverallHealth(),
      errorMonitoring.getActiveAlerts(),
      LogAggregator.getLogStats('day'),
      getSystemMetrics(),
    ]);

    const overview = {
      timestamp: new Date().toISOString(),
      system: {
        status: systemHealth.status,
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        services: systemHealth.services,
        metrics: systemHealth.metrics,
      },
      external: {
        status: externalHealth.status,
        totalServices: externalHealth.totalServices,
        healthyServices: externalHealth.healthyServices,
        degradedServices: externalHealth.degradedServices,
        unhealthyServices: externalHealth.unhealthyServices,
        criticalServicesDown: externalHealth.criticalServicesDown,
      },
      alerts: {
        active: activeAlerts.length,
        critical: activeAlerts.filter(a => a.level === 'critical').length,
        high: activeAlerts.filter(a => a.level === 'high').length,
        medium: activeAlerts.filter(a => a.level === 'medium').length,
        low: activeAlerts.filter(a => a.level === 'low').length,
      },
      logs: logStats,
      performance: systemMetrics,
    };

    res.json(overview);
  } catch (error: any) {
    logger.error('Failed to get monitoring overview', { error });
    res.status(500).json({
      error: 'Failed to get monitoring overview',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Real-time metrics endpoint
 * GET /monitoring/metrics/realtime
 */
router.get('/metrics/realtime', authenticateToken, verifyAdminPrivileges, async (req, res) => {
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
      case '6h':
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
    }

    const [requestMetrics, errorMetrics, performanceMetrics, externalMetrics] = await Promise.all([
      getRequestMetrics(startTime, now),
      getErrorMetrics(startTime, now),
      getPerformanceMetrics(startTime, now),
      getExternalApiMetrics(startTime, now),
    ]);

    res.json({
      timeframe,
      startTime,
      endTime: now,
      metrics: {
        requests: requestMetrics,
        errors: errorMetrics,
        performance: performanceMetrics,
        external: externalMetrics,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get real-time metrics', { error });
    res.status(500).json({
      error: 'Failed to get real-time metrics',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Error analysis endpoint
 * GET /monitoring/errors/analysis
 */
router.get('/errors/analysis', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;

    const now = new Date();
    let startTime: Date;

    switch (timeframe) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const [errorsByLevel, errorsByType, topErrors, errorTrends] = await Promise.all([
      getErrorsByLevel(startTime, now),
      getErrorsByType(startTime, now),
      getTopErrors(startTime, now),
      getErrorTrends(startTime, now),
    ]);

    res.json({
      timeframe,
      startTime,
      endTime: now,
      analysis: {
        byLevel: errorsByLevel,
        byType: errorsByType,
        topErrors,
        trends: errorTrends,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get error analysis', { error });
    res.status(500).json({
      error: 'Failed to get error analysis',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Performance analysis endpoint
 * GET /monitoring/performance/analysis
 */
router.get('/performance/analysis', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;

    const now = new Date();
    let startTime: Date;

    switch (timeframe) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const [slowestEndpoints, responseTimeDistribution, throughputMetrics] = await Promise.all([
      getSlowestEndpoints(startTime, now),
      getResponseTimeDistribution(startTime, now),
      getThroughputMetrics(startTime, now),
    ]);

    res.json({
      timeframe,
      startTime,
      endTime: now,
      analysis: {
        slowestEndpoints,
        responseTimeDistribution,
        throughput: throughputMetrics,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get performance analysis', { error });
    res.status(500).json({
      error: 'Failed to get performance analysis',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Security events endpoint
 * GET /monitoring/security/events
 */
router.get('/security/events', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const { timeframe = '24h', limit = '100' } = req.query;

    const now = new Date();
    let startTime: Date;

    switch (timeframe) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const securityEvents = await getSecurityEvents(startTime, now, parseInt(limit as string));

    res.json({
      timeframe,
      startTime,
      endTime: now,
      events: securityEvents,
      total: (securityEvents as any[]).length,
    });
  } catch (error: any) {
    logger.error('Failed to get security events', { error });
    res.status(500).json({
      error: 'Failed to get security events',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Notification channels management
 * GET /monitoring/notifications/channels
 */
router.get('/notifications/channels', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const channels = notificationService.getChannels();

    res.json({
      channels,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Failed to get notification channels', { error });
    res.status(500).json({
      error: 'Failed to get notification channels',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Test notification channel
 * POST /monitoring/notifications/test/:channelId
 */
router.post('/notifications/test/:channelId', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const { channelId } = req.params;

    const success = await notificationService.testChannel(channelId as string);

    res.json({
      success,
      channelId,
      message: success ? 'Test notification sent successfully' : 'Test notification failed',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Failed to test notification channel', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test notification channel',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * System resource usage
 * GET /monitoring/resources
 */
router.get('/resources', authenticateToken, verifyAdminPrivileges, async (req, res) => {
  try {
    const resources = {
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
      },
      system: await getSystemResources(),
      database: await getDatabaseResources(),
      timestamp: new Date().toISOString(),
    };

    res.json(resources);
  } catch (error: any) {
    logger.error('Failed to get system resources', { error });
    res.status(500).json({
      error: 'Failed to get system resources',
      timestamp: new Date().toISOString(),
    });
  }
});

// Helper functions

async function getSystemMetrics() {
  const memoryUsage = process.memoryUsage();
  return {
    memory: {
      used: memoryUsage.heapUsed,
      total: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss,
    },
    uptime: process.uptime(),
    pid: process.pid,
  };
}

async function getRequestMetrics(startTime: Date, endTime: Date) {
  const metrics = await prisma.$queryRaw`
    SELECT 
      DATE_TRUNC('minute', created_at) as minute,
      COUNT(*) as request_count,
      AVG(CAST(meta->>'duration' AS NUMERIC)) as avg_response_time,
      COUNT(CASE WHEN meta->>'statusCode' >= '400' THEN 1 END) as error_count
    FROM system_logs 
    WHERE created_at >= ${startTime} AND created_at <= ${endTime}
    AND message = 'HTTP Request Completed'
    GROUP BY DATE_TRUNC('minute', created_at)
    ORDER BY minute
  `;

  return metrics;
}

async function getErrorMetrics(startTime: Date, endTime: Date) {
  const metrics = await prisma.$queryRaw`
    SELECT 
      level,
      COUNT(*) as count,
      DATE_TRUNC('hour', created_at) as hour
    FROM system_logs 
    WHERE created_at >= ${startTime} AND created_at <= ${endTime}
    AND level IN ('ERROR', 'WARN')
    GROUP BY level, DATE_TRUNC('hour', created_at)
    ORDER BY hour
  `;

  return metrics;
}

async function getPerformanceMetrics(startTime: Date, endTime: Date) {
  const metrics = await prisma.$queryRaw`
    SELECT 
      meta->>'operation' as operation,
      AVG(CAST(meta->>'duration' AS NUMERIC)) as avg_duration,
      MAX(CAST(meta->>'duration' AS NUMERIC)) as max_duration,
      MIN(CAST(meta->>'duration' AS NUMERIC)) as min_duration,
      COUNT(*) as count
    FROM system_logs 
    WHERE created_at >= ${startTime} AND created_at <= ${endTime}
    AND meta->>'category' = 'performance'
    GROUP BY meta->>'operation'
    ORDER BY avg_duration DESC
    LIMIT 20
  `;

  return metrics;
}

async function getExternalApiMetrics(startTime: Date, endTime: Date) {
  // Get external API metrics from monitoring service
  const services = externalApiMonitoring.getAllServiceStatus();
  return services.map(service => ({
    serviceId: service.id,
    serviceName: service.name,
    status: service.status,
    responseTime: service.responseTime,
    uptime: service.uptime,
    lastCheck: service.lastCheck,
  }));
}

async function getErrorsByLevel(startTime: Date, endTime: Date) {
  const errors = await prisma.$queryRaw`
    SELECT 
      level,
      COUNT(*) as count
    FROM system_logs 
    WHERE created_at >= ${startTime} AND created_at <= ${endTime}
    AND level IN ('ERROR', 'WARN')
    GROUP BY level
    ORDER BY count DESC
  `;

  return errors;
}

async function getErrorsByType(startTime: Date, endTime: Date) {
  const errors = await prisma.$queryRaw`
    SELECT 
      meta->>'errorName' as error_type,
      COUNT(*) as count
    FROM system_logs 
    WHERE created_at >= ${startTime} AND created_at <= ${endTime}
    AND level = 'ERROR'
    AND meta->>'errorName' IS NOT NULL
    GROUP BY meta->>'errorName'
    ORDER BY count DESC
    LIMIT 10
  `;

  return errors;
}

async function getTopErrors(startTime: Date, endTime: Date) {
  const errors = await prisma.$queryRaw`
    SELECT 
      message,
      meta->>'errorName' as error_type,
      COUNT(*) as count,
      MAX(created_at) as last_occurrence
    FROM system_logs 
    WHERE created_at >= ${startTime} AND created_at <= ${endTime}
    AND level = 'ERROR'
    GROUP BY message, meta->>'errorName'
    ORDER BY count DESC
    LIMIT 10
  `;

  return errors;
}

async function getErrorTrends(startTime: Date, endTime: Date) {
  const trends = await prisma.$queryRaw`
    SELECT 
      DATE_TRUNC('hour', created_at) as hour,
      COUNT(*) as error_count
    FROM system_logs 
    WHERE created_at >= ${startTime} AND created_at <= ${endTime}
    AND level = 'ERROR'
    GROUP BY DATE_TRUNC('hour', created_at)
    ORDER BY hour
  `;

  return trends;
}

async function getSlowestEndpoints(startTime: Date, endTime: Date) {
  const endpoints = await prisma.$queryRaw`
    SELECT 
      meta->>'url' as endpoint,
      meta->>'method' as method,
      AVG(CAST(meta->>'duration' AS NUMERIC)) as avg_response_time,
      MAX(CAST(meta->>'duration' AS NUMERIC)) as max_response_time,
      COUNT(*) as request_count
    FROM system_logs 
    WHERE created_at >= ${startTime} AND created_at <= ${endTime}
    AND message = 'HTTP Request Completed'
    AND meta->>'url' IS NOT NULL
    GROUP BY meta->>'url', meta->>'method'
    ORDER BY avg_response_time DESC
    LIMIT 10
  `;

  return endpoints;
}

async function getResponseTimeDistribution(startTime: Date, endTime: Date) {
  const distribution = await prisma.$queryRaw`
    SELECT 
      CASE 
        WHEN CAST(meta->>'duration' AS NUMERIC) < 100 THEN '0-100ms'
        WHEN CAST(meta->>'duration' AS NUMERIC) < 500 THEN '100-500ms'
        WHEN CAST(meta->>'duration' AS NUMERIC) < 1000 THEN '500ms-1s'
        WHEN CAST(meta->>'duration' AS NUMERIC) < 5000 THEN '1-5s'
        ELSE '5s+'
      END as response_time_bucket,
      COUNT(*) as count
    FROM system_logs 
    WHERE created_at >= ${startTime} AND created_at <= ${endTime}
    AND message = 'HTTP Request Completed'
    AND meta->>'duration' IS NOT NULL
    GROUP BY response_time_bucket
    ORDER BY 
      CASE response_time_bucket
        WHEN '0-100ms' THEN 1
        WHEN '100-500ms' THEN 2
        WHEN '500ms-1s' THEN 3
        WHEN '1-5s' THEN 4
        WHEN '5s+' THEN 5
      END
  `;

  return distribution;
}

async function getThroughputMetrics(startTime: Date, endTime: Date) {
  const throughput = await prisma.$queryRaw`
    SELECT 
      DATE_TRUNC('minute', created_at) as minute,
      COUNT(*) as requests_per_minute
    FROM system_logs 
    WHERE created_at >= ${startTime} AND created_at <= ${endTime}
    AND message = 'HTTP Request Completed'
    GROUP BY DATE_TRUNC('minute', created_at)
    ORDER BY minute
  `;

  return throughput;
}

async function getSecurityEvents(startTime: Date, endTime: Date, limit: number) {
  const events = await prisma.$queryRaw`
    SELECT 
      created_at,
      message,
      meta->>'securityEvent' as event_type,
      meta->>'severity' as severity,
      meta->>'userId' as user_id,
      meta->>'ip' as ip_address,
      meta->>'userAgent' as user_agent
    FROM system_logs 
    WHERE created_at >= ${startTime} AND created_at <= ${endTime}
    AND meta->>'category' = 'security'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return events;
}

async function getSystemResources() {
  // Basic system resource information
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    environment: process.env.NODE_ENV || 'development',
  };
}

async function getDatabaseResources() {
  try {
    const [userCount, meetingCount, logCount] = await Promise.all([
      prisma.user.count(),
      prisma.meeting.count(),
      prisma.systemLog.count(),
    ]);

    return {
      users: userCount,
      meetings: meetingCount,
      logs: logCount,
    };
  } catch (error: any) {
    logger.error('Failed to get database resources', { error });
    return {
      users: 0,
      meetings: 0,
      logs: 0,
      error: 'Failed to fetch database metrics',
    };
  }
}

export { router as monitoringRoutes };