/**
 * Log Management Routes
 * 
 * Provides endpoints for log search, analysis, and management
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { verifyAdminPrivileges } from '../middleware/adminAuth';
import { LogService } from '../services/logService';
import { logAudit, logger } from '../utils/logger';
import { ValidationError } from '../middleware/errorHandler';

const router = Router();

// All log routes require authentication
router.use(authenticateToken);

/**
 * Search logs with filtering and pagination
 * GET /api/logs/search
 */
router.get('/search', verifyAdminPrivileges, async (req, res) => {
  try {
    const {
      level,
      category,
      userId,
      requestId,
      startDate,
      endDate,
      message,
      page = '1',
      limit = '50',
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = req.query;

    // Validate parameters
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    
    if (isNaN(pageNum) || pageNum < 1) {
      throw new ValidationError('Invalid page number');
    }
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
      throw new ValidationError('Invalid limit (must be between 1 and 1000)');
    }

    const searchParams = {
      level: level as any,
      category: category as any,
      userId: userId as string,
      requestId: requestId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      message: message as string,
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      sortBy: sortBy as any,
      sortOrder: sortOrder as any,
    };

    const result = await LogService.searchLogs(searchParams);

    // Log audit event
    logAudit({
      action: 'search_logs',
      resource: 'logs',
      userId: req.user!.id,
      result: 'success',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId,
      changes: { searchParams: { ...searchParams, offset: undefined } },
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Log search failed', {
      error,
      userId: req.user!.id,
      requestId: req.requestId,
    });
    throw error;
  }
});

/**
 * Get log statistics and analytics
 * GET /api/logs/stats
 */
router.get('/stats', verifyAdminPrivileges, async (req, res) => {
  try {
    const { timeframe = 'day' } = req.query;
    
    if (!['hour', 'day', 'week', 'month'].includes(timeframe as string)) {
      throw new ValidationError('Invalid timeframe. Must be: hour, day, week, or month');
    }

    const stats = await LogService.getLogStatistics(timeframe as any);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get log statistics', {
      error,
      userId: req.user!.id,
      requestId: req.requestId,
    });
    throw error;
  }
});

/**
 * Export logs to file
 * POST /api/logs/export
 */
router.post('/export', verifyAdminPrivileges, async (req, res) => {
  try {
    const {
      level,
      category,
      userId,
      requestId,
      startDate,
      endDate,
      message,
      format = 'json',
    } = req.body;

    if (!['json', 'csv'].includes(format)) {
      throw new ValidationError('Invalid format. Must be json or csv');
    }

    const searchParams = {
      level,
      category,
      userId,
      requestId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      message,
    };

    const filepath = await LogService.exportLogs(searchParams, format);

    // Log audit event
    logAudit({
      action: 'export_logs',
      resource: 'logs',
      userId: req.user!.id,
      result: 'success',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId,
      changes: { exportParams: searchParams, format, filepath },
    });

    res.json({
      success: true,
      data: {
        message: 'Logs exported successfully',
        filepath,
        format,
      },
    });
  } catch (error) {
    logger.error('Log export failed', {
      error,
      userId: req.user!.id,
      requestId: req.requestId,
    });
    throw error;
  }
});

/**
 * Analyze log patterns for anomalies
 * GET /api/logs/analyze
 */
router.get('/analyze', verifyAdminPrivileges, async (req, res) => {
  try {
    const { timeframe = 'hour' } = req.query;
    
    if (!['hour', 'day'].includes(timeframe as string)) {
      throw new ValidationError('Invalid timeframe. Must be: hour or day');
    }

    const analysis = await LogService.analyzeLogPatterns(timeframe as any);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    logger.error('Log analysis failed', {
      error,
      userId: req.user!.id,
      requestId: req.requestId,
    });
    throw error;
  }
});

/**
 * Get recent logs for real-time monitoring
 * GET /api/logs/recent
 */
router.get('/recent', verifyAdminPrivileges, async (req, res) => {
  try {
    const { limit = '100' } = req.query;
    const limitNum = parseInt(limit as string);
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 500) {
      throw new ValidationError('Invalid limit (must be between 1 and 500)');
    }

    const logs = await LogService.getRecentLogs(limitNum);

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    logger.error('Failed to get recent logs', {
      error,
      userId: req.user!.id,
      requestId: req.requestId,
    });
    throw error;
  }
});

/**
 * Clean up old logs
 * DELETE /api/logs/cleanup
 */
router.delete('/cleanup', verifyAdminPrivileges, async (req, res) => {
  try {
    const { retentionDays = 30 } = req.body;
    
    if (typeof retentionDays !== 'number' || retentionDays < 1 || retentionDays > 365) {
      throw new ValidationError('Invalid retention days (must be between 1 and 365)');
    }

    const result = await LogService.cleanupOldLogs(retentionDays);

    // Log audit event
    logAudit({
      action: 'cleanup_logs',
      resource: 'logs',
      userId: req.user!.id,
      result: 'success',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId,
      changes: { retentionDays, deletedCount: result.deletedCount },
    });

    res.json({
      success: true,
      data: {
        message: 'Log cleanup completed',
        deletedCount: result.deletedCount,
        retentionDays,
      },
    });
  } catch (error) {
    logger.error('Log cleanup failed', {
      error,
      userId: req.user!.id,
      requestId: req.requestId,
    });
    throw error;
  }
});

/**
 * Get log levels and categories for filtering
 * GET /api/logs/metadata
 */
router.get('/metadata', verifyAdminPrivileges, async (req, res) => {
  try {
    const metadata = {
      levels: ['error', 'warn', 'info', 'debug'],
      categories: [
        'http',
        'security',
        'audit',
        'performance',
        'database',
        'error',
        'api',
      ],
      sortOptions: [
        { value: 'timestamp', label: 'Timestamp' },
        { value: 'level', label: 'Level' },
        { value: 'category', label: 'Category' },
      ],
      timeframes: [
        { value: 'hour', label: 'Last Hour' },
        { value: 'day', label: 'Last Day' },
        { value: 'week', label: 'Last Week' },
        { value: 'month', label: 'Last Month' },
      ],
    };

    res.json({
      success: true,
      data: metadata,
    });
  } catch (error) {
    logger.error('Failed to get log metadata', {
      error,
      userId: req.user!.id,
      requestId: req.requestId,
    });
    throw error;
  }
});

export { router as logRoutes };