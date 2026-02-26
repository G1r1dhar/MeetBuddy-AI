/**
 * Log Management Service
 * 
 * Provides log aggregation, search, analysis, and management capabilities
 */

import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../lib/prisma';
import { logger, LogAggregator } from '../utils/logger';

export interface LogSearchParams {
  level?: 'error' | 'warn' | 'info' | 'debug';
  category?: 'http' | 'security' | 'audit' | 'performance' | 'database' | 'error';
  userId?: string;
  requestId?: string;
  startDate?: Date;
  endDate?: Date;
  message?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'level' | 'category';
  sortOrder?: 'asc' | 'desc';
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: string;
  message: string;
  category?: string;
  userId?: string;
  requestId?: string;
  metadata: Record<string, any>;
}

export interface LogStats {
  totalLogs: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  debugCount: number;
  categoryCounts: Record<string, number>;
  hourlyDistribution: Array<{ hour: string; count: number }>;
  topUsers: Array<{ userId: string; count: number }>;
  topErrors: Array<{ error: string; count: number }>;
}

export interface LogAlert {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  timeWindow: number; // minutes
  isActive: boolean;
  lastTriggered?: Date;
  actions: string[];
}

export class LogService {
  /**
   * Search logs with advanced filtering
   */
  static async searchLogs(params: LogSearchParams): Promise<{
    logs: LogEntry[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      level,
      category,
      userId,
      requestId,
      startDate,
      endDate,
      message,
      limit = 50,
      offset = 0,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = params;

    // Build where clause
    const where: any = {};

    if (level) {
      where.level = level.toUpperCase();
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    if (message) {
      where.message = {
        contains: message,
        mode: 'insensitive',
      };
    }

    // For JSON field queries, we'll use raw SQL for better performance
    let additionalWhere = '';
    const params_array: any[] = [];

    if (category) {
      additionalWhere += ` AND meta->>'category' = $${params_array.length + 1}`;
      params_array.push(category);
    }

    if (userId) {
      additionalWhere += ` AND meta->>'userId' = $${params_array.length + 1}`;
      params_array.push(userId);
    }

    if (requestId) {
      additionalWhere += ` AND meta->>'requestId' = $${params_array.length + 1}`;
      params_array.push(requestId);
    }

    // Build order clause
    const orderBy = sortBy === 'timestamp' ? 'created_at' : sortBy;
    const order = sortOrder.toUpperCase();

    try {
      // Use raw SQL for complex queries
      let query = `
        SELECT id, level, message, meta, created_at
        FROM system_logs
        WHERE 1=1
      `;

      // Add basic where conditions
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (level) {
        query += ` AND level = $${paramIndex}`;
        queryParams.push(level.toUpperCase());
        paramIndex++;
      }

      if (startDate) {
        query += ` AND created_at >= $${paramIndex}`;
        queryParams.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND created_at <= $${paramIndex}`;
        queryParams.push(endDate);
        paramIndex++;
      }

      if (message) {
        query += ` AND message ILIKE $${paramIndex}`;
        queryParams.push(`%${message}%`);
        paramIndex++;
      }

      // Add JSON field conditions
      if (category) {
        query += ` AND meta->>'category' = $${paramIndex}`;
        queryParams.push(category);
        paramIndex++;
      }

      if (userId) {
        query += ` AND meta->>'userId' = $${paramIndex}`;
        queryParams.push(userId);
        paramIndex++;
      }

      if (requestId) {
        query += ` AND meta->>'requestId' = $${paramIndex}`;
        queryParams.push(requestId);
        paramIndex++;
      }

      // Add ordering and pagination
      query += ` ORDER BY ${orderBy} ${order}`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(limit, offset);

      // Execute query
      const logs = await prisma.$queryRawUnsafe(query, ...queryParams) as any[];

      // Get total count
      const countQuery = (query.split('ORDER BY')[0] || '').replace('SELECT id, level, message, meta, created_at', 'SELECT COUNT(*)');
      const countParams = queryParams.slice(0, -2); // Remove limit and offset
      const totalResult = await prisma.$queryRawUnsafe(countQuery, ...countParams) as any[];
      const total = parseInt(totalResult[0].count);

      // Transform results
      const transformedLogs: LogEntry[] = logs.map(log => ({
        id: log.id,
        timestamp: log.created_at,
        level: log.level.toLowerCase(),
        message: log.message,
        category: log.meta?.category,
        userId: log.meta?.userId,
        requestId: log.meta?.requestId,
        metadata: log.meta || {},
      }));

      return {
        logs: transformedLogs,
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
      };
    } catch (error) {
      logger.error('Log search failed', { error, params });
      throw error;
    }
  }

  /**
   * Get comprehensive log statistics
   */
  static async getLogStatistics(timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'): Promise<LogStats> {
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case 'hour':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    try {
      // Get level distribution
      const levelStats = await prisma.systemLog.groupBy({
        by: ['level'],
        where: { createdAt: { gte: startDate } },
        _count: { level: true },
      });

      // Get category distribution using raw SQL
      const categoryStats = await prisma.$queryRaw`
        SELECT meta->>'category' as category, COUNT(*) as count
        FROM system_logs
        WHERE created_at >= ${startDate}
        AND meta->>'category' IS NOT NULL
        GROUP BY meta->>'category'
        ORDER BY count DESC
      ` as any[];

      // Get hourly distribution
      const hourlyStats = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as count
        FROM system_logs
        WHERE created_at >= ${startDate}
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour
      ` as any[];

      // Get top users by log count
      const topUsers = await prisma.$queryRaw`
        SELECT 
          meta->>'userId' as userId,
          COUNT(*) as count
        FROM system_logs
        WHERE created_at >= ${startDate}
        AND meta->>'userId' IS NOT NULL
        GROUP BY meta->>'userId'
        ORDER BY count DESC
        LIMIT 10
      ` as any[];

      // Get top errors
      const topErrors = await prisma.$queryRaw`
        SELECT 
          meta->>'errorName' as error,
          COUNT(*) as count
        FROM system_logs
        WHERE created_at >= ${startDate}
        AND level = 'ERROR'
        AND meta->>'errorName' IS NOT NULL
        GROUP BY meta->>'errorName'
        ORDER BY count DESC
        LIMIT 10
      ` as any[];

      // Get total count
      const totalLogs = await prisma.systemLog.count({
        where: { createdAt: { gte: startDate } },
      });

      // Transform results
      const levelCounts = levelStats.reduce((acc, stat) => {
        acc[stat.level.toLowerCase() + 'Count'] = stat._count.level;
        return acc;
      }, {} as any);

      const categoryCounts = categoryStats.reduce((acc, stat) => {
        if (stat.category) {
          acc[stat.category] = parseInt(stat.count);
        }
        return acc;
      }, {} as Record<string, number>);

      return {
        totalLogs,
        errorCount: levelCounts.errorCount || 0,
        warningCount: levelCounts.warnCount || 0,
        infoCount: levelCounts.infoCount || 0,
        debugCount: levelCounts.debugCount || 0,
        categoryCounts,
        hourlyDistribution: hourlyStats.map(stat => ({
          hour: stat.hour.toISOString(),
          count: parseInt(stat.count),
        })),
        topUsers: topUsers.map(user => ({
          userId: user.userId,
          count: parseInt(user.count),
        })),
        topErrors: topErrors.map(error => ({
          error: error.error,
          count: parseInt(error.count),
        })),
      };
    } catch (error) {
      logger.error('Failed to get log statistics', { error, timeframe });
      throw error;
    }
  }

  /**
   * Export logs to file
   */
  static async exportLogs(params: LogSearchParams, format: 'json' | 'csv' = 'json'): Promise<string> {
    try {
      // Get all matching logs (remove pagination)
      const searchParams = { ...params, limit: 10000, offset: 0 };
      const { logs } = await this.searchLogs(searchParams);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `logs-export-${timestamp}.${format}`;
      const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
      const filepath = path.join(logDir, 'exports', filename);

      // Ensure export directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });

      if (format === 'json') {
        await fs.writeFile(filepath, JSON.stringify(logs, null, 2));
      } else {
        // CSV format
        const headers = ['timestamp', 'level', 'message', 'category', 'userId', 'requestId'];
        const csvContent = [
          headers.join(','),
          ...logs.map(log => [
            log.timestamp.toISOString(),
            log.level,
            `"${log.message.replace(/"/g, '""')}"`,
            log.category || '',
            log.userId || '',
            log.requestId || '',
          ].join(','))
        ].join('\n');

        await fs.writeFile(filepath, csvContent);
      }

      logger.info('Logs exported successfully', {
        category: 'audit',
        filename,
        format,
        logCount: logs.length,
        exportParams: params,
      });

      return filepath;
    } catch (error) {
      logger.error('Log export failed', { error, params, format });
      throw error;
    }
  }

  /**
   * Clean up old logs
   */
  static async cleanupOldLogs(retentionDays: number = 30): Promise<{ deletedCount: number }> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const result = await prisma.systemLog.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          // Keep error and security logs longer
          level: { notIn: ['ERROR', 'WARN'] },
        },
      });

      logger.info('Old logs cleaned up', {
        category: 'audit',
        deletedCount: result.count,
        retentionDays,
        cutoffDate,
      });

      return { deletedCount: result.count };
    } catch (error) {
      logger.error('Log cleanup failed', { error, retentionDays });
      throw error;
    }
  }

  /**
   * Analyze log patterns for anomalies
   */
  static async analyzeLogPatterns(timeframe: 'hour' | 'day' = 'hour'): Promise<{
    anomalies: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      count: number;
      examples: string[];
    }>;
  }> {
    const now = new Date();
    const startDate = timeframe === 'hour'
      ? new Date(now.getTime() - 60 * 60 * 1000)
      : new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
      const anomalies: any[] = [];

      // Check for error spikes
      const errorCount = await prisma.systemLog.count({
        where: {
          level: 'ERROR',
          createdAt: { gte: startDate },
        },
      });

      if (errorCount > 50) { // Threshold for error spike
        const errorExamples = await prisma.systemLog.findMany({
          where: {
            level: 'ERROR',
            createdAt: { gte: startDate },
          },
          select: { message: true },
          take: 3,
        });

        anomalies.push({
          type: 'error_spike',
          description: `High error rate detected: ${errorCount} errors in the last ${timeframe}`,
          severity: errorCount > 100 ? 'high' : 'medium',
          count: errorCount,
          examples: errorExamples.map(e => e.message),
        });
      }

      // Check for security events
      const securityEvents = await prisma.$queryRaw`
        SELECT COUNT(*) as count, meta->>'securityEvent' as event_type
        FROM system_logs
        WHERE created_at >= ${startDate}
        AND meta->>'category' = 'security'
        GROUP BY meta->>'securityEvent'
        HAVING COUNT(*) > 5
      ` as any[];

      for (const event of securityEvents) {
        anomalies.push({
          type: 'security_pattern',
          description: `Repeated security event: ${event.event_type}`,
          severity: 'high',
          count: parseInt(event.count),
          examples: [event.event_type],
        });
      }

      // Check for performance issues
      const slowRequests = await prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM system_logs
        WHERE created_at >= ${startDate}
        AND meta->>'category' = 'performance'
        AND (meta->>'duration')::int > 5000
      ` as any[];

      if (slowRequests.length > 0 && parseInt(slowRequests[0].count) > 10) {
        anomalies.push({
          type: 'performance_degradation',
          description: `High number of slow requests detected`,
          severity: 'medium',
          count: parseInt(slowRequests[0].count),
          examples: ['Requests taking > 5 seconds'],
        });
      }

      return { anomalies };
    } catch (error) {
      logger.error('Log pattern analysis failed', { error, timeframe });
      throw error;
    }
  }

  /**
   * Get real-time log stream (for monitoring dashboards)
   */
  static async getRecentLogs(limit: number = 100): Promise<LogEntry[]> {
    try {
      const logs = await prisma.systemLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return logs.map(log => ({
        id: log.id,
        timestamp: log.createdAt,
        level: log.level.toLowerCase(),
        message: log.message,
        category: (log.meta as any)?.category,
        userId: (log.meta as any)?.userId,
        requestId: (log.meta as any)?.requestId,
        metadata: log.meta as any || {},
      }));
    } catch (error) {
      logger.error('Failed to get recent logs', { error });
      throw error;
    }
  }
}