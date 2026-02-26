import { Router } from 'express';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { verifyAdminPrivileges, logAdminAction } from '../middleware/adminAuth';
import { securityMonitoringService } from '../services/securityMonitoringService';
import { auditTrailService } from '../services/auditTrailService';
import { logger } from '../utils/logger';

const router = Router();

// Apply authentication and admin authorization to all routes
router.use(authenticateToken);
router.use(verifyAdminPrivileges);

// GET /api/security/events - Get security events
router.get('/events', logAdminAction('view_security_events'), asyncHandler(async (req, res) => {
  const {
    page = '1',
    limit = '50',
    eventType,
    severity,
    startDate,
    endDate,
    userId
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  if (pageNum < 1 || limitNum < 1 || limitNum > 200) {
    throw new ValidationError('Invalid pagination parameters');
  }

  const events = await securityMonitoringService.getSecurityEvents(
    pageNum,
    limitNum,
    eventType as any,
    severity as any,
    startDate ? new Date(startDate as string) : undefined,
    endDate ? new Date(endDate as string) : undefined,
    userId as string
  );

  logger.info('Admin retrieved security events', {
    adminUserId: req.user!.userId,
    page: pageNum,
    limit: limitNum,
    filters: { eventType, severity, startDate, endDate, userId },
  });

  res.json(events);
}));

// GET /api/security/audit-trail - Get audit trail entries
router.get('/audit-trail', logAdminAction('view_audit_trail'), asyncHandler(async (req, res) => {
  const {
    page = '1',
    limit = '50',
    userId,
    action,
    resource,
    startDate,
    endDate,
    success
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  if (pageNum < 1 || limitNum < 1 || limitNum > 200) {
    throw new ValidationError('Invalid pagination parameters');
  }

  const auditTrail = await auditTrailService.getAuditTrail({
    page: pageNum,
    limit: limitNum,
    userId: userId as string,
    action: action as string,
    resource: resource as string,
    startDate: startDate ? new Date(startDate as string) : undefined,
    endDate: endDate ? new Date(endDate as string) : undefined,
    success: success ? success === 'true' : undefined,
  });

  logger.info('Admin retrieved audit trail', {
    adminUserId: req.user!.userId,
    page: pageNum,
    limit: limitNum,
    filters: { userId, action, resource, startDate, endDate, success },
  });

  res.json(auditTrail);
}));

// GET /api/security/audit-trail/export - Export audit trail to CSV
router.get('/audit-trail/export', logAdminAction('export_audit_trail'), asyncHandler(async (req, res) => {
  const {
    userId,
    action,
    resource,
    startDate,
    endDate,
    success
  } = req.query;

  const csvContent = await auditTrailService.exportAuditTrail({
    userId: userId as string,
    action: action as string,
    resource: resource as string,
    startDate: startDate ? new Date(startDate as string) : undefined,
    endDate: endDate ? new Date(endDate as string) : undefined,
    success: success ? success === 'true' : undefined,
  });

  logger.info('Admin exported audit trail', {
    adminUserId: req.user!.userId,
    filters: { userId, action, resource, startDate, endDate, success },
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csvContent);
}));

// GET /api/security/audit-trail/statistics - Get audit trail statistics
router.get('/audit-trail/statistics', logAdminAction('view_audit_statistics'), asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const statistics = await auditTrailService.getAuditStatistics(
    startDate ? new Date(startDate as string) : undefined,
    endDate ? new Date(endDate as string) : undefined
  );

  logger.info('Admin retrieved audit statistics', {
    adminUserId: req.user!.userId,
    dateRange: { startDate, endDate },
  });

  res.json(statistics);
}));

// GET /api/security/dashboard - Get security dashboard data
router.get('/dashboard', logAdminAction('view_security_dashboard'), asyncHandler(async (req, res) => {
  const { timeRange = '24h' } = req.query;

  // Calculate date range based on timeRange parameter
  const now = new Date();
  let startDate: Date;

  switch (timeRange) {
    case '1h':
      startDate = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  // Get security events and audit statistics
  const [securityEvents, auditStatistics] = await Promise.all([
    securityMonitoringService.getSecurityEvents(1, 100, undefined, undefined, startDate, now),
    auditTrailService.getAuditStatistics(startDate, now),
  ]);

  // Aggregate dashboard data
  const dashboardData = {
    timeRange,
    period: {
      startDate,
      endDate: now,
    },
    securityEvents: {
      total: securityEvents.events?.length || 0,
      bySeverity: securityEvents.events?.reduce((acc: any, event: any) => {
        acc[event.severity] = (acc[event.severity] || 0) + 1;
        return acc;
      }, {}) || {},
      byType: securityEvents.events?.reduce((acc: any, event: any) => {
        acc[event.eventType] = (acc[event.eventType] || 0) + 1;
        return acc;
      }, {}) || {},
      recent: securityEvents.events?.slice(0, 10) || [],
    },
    auditTrail: {
      totalEntries: auditStatistics.totalEntries,
      successfulActions: auditStatistics.successfulActions,
      failedActions: auditStatistics.failedActions,
      successRate: auditStatistics.totalEntries > 0 ? 
        (auditStatistics.successfulActions / auditStatistics.totalEntries * 100).toFixed(2) : '0',
      topActions: auditStatistics.topActions.slice(0, 5),
      topUsers: auditStatistics.topUsers.slice(0, 5),
    },
    alerts: {
      active: 0, // Would be calculated from active security alerts
      resolved: 0, // Would be calculated from resolved security alerts
      critical: securityEvents.events?.filter((e: any) => e.severity === 'CRITICAL').length || 0,
      high: securityEvents.events?.filter((e: any) => e.severity === 'HIGH').length || 0,
    },
  };

  logger.info('Admin retrieved security dashboard', {
    adminUserId: req.user!.userId,
    timeRange,
  });

  res.json(dashboardData);
}));

// POST /api/security/test-alert - Test security alert system (admin only)
router.post('/test-alert', logAdminAction('test_security_alert'), asyncHandler(async (req, res) => {
  const { eventType = 'ADMIN_ACTION', severity = 'LOW', message = 'Test security alert' } = req.body;

  // Log a test security event
  await securityMonitoringService.logSecurityEvent({
    eventType: eventType as any,
    severity: severity as any,
    userId: req.user!.userId,
    ipAddress: req.ip || 'unknown',
    userAgent: req.get('User-Agent'),
    resource: 'security_test',
    action: 'TEST_ALERT',
    details: {
      message,
      testAlert: true,
      triggeredBy: req.user!.email,
      timestamp: new Date(),
    },
  });

  logger.info('Admin triggered test security alert', {
    adminUserId: req.user!.userId,
    eventType,
    severity,
    message,
  });

  res.json({
    success: true,
    message: 'Test security alert triggered successfully',
    eventType,
    severity,
  });
}));

export { router as securityRoutes };