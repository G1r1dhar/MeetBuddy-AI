import winston from 'winston';
import path from 'path';
import { prisma } from '../lib/prisma';

const logLevel = process.env.LOG_LEVEL || 'info';
const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

// Create logs directory if it doesn't exist
import fs from 'fs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Enhanced structured format with correlation IDs and context
const categoryFilter = (category: string) => winston.format((info) => info.category === category ? info : false)();

const structuredFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    // Create clean log entry without duplicates
    const { timestamp, level, message, ...otherFields } = info;

    const logEntry = {
      timestamp,
      level,
      message,
      service: 'meetbuddy-ai-backend',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      ...otherFields,
    };

    return JSON.stringify(logEntry);
  })
);

// Console format for development with better readability
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS',
  }),
  winston.format.printf(({ timestamp, level, message, requestId, userId, ...meta }) => {
    let log = `${timestamp} [${level}]`;

    // Add request ID if present
    if (requestId && typeof requestId === 'string') {
      log += ` [${requestId.substring(0, 8)}]`;
    }

    // Add user ID if present
    if (userId && typeof userId === 'string') {
      log += ` [user:${userId.substring(0, 8)}]`;
    }

    log += `: ${message}`;

    // Add metadata if present (excluding common fields)
    const filteredMeta = { ...meta };
    delete filteredMeta.service;
    delete filteredMeta.environment;
    delete filteredMeta.version;

    if (Object.keys(filteredMeta).length > 0) {
      log += ` ${JSON.stringify(filteredMeta)}`;
    }

    return log;
  })
);

// Create multiple transports for different log types
const transports: winston.transport[] = [
  // Combined logs
  new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    maxsize: 10485760, // 10MB
    maxFiles: 10,
    format: structuredFormat,
  }),

  // Error logs
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    maxsize: 10485760, // 10MB
    maxFiles: 5,
    format: structuredFormat,
  }),

  // Security logs
  new winston.transports.File({
    filename: path.join(logDir, 'security.log'),
    level: 'warn',
    maxsize: 10485760, // 10MB
    maxFiles: 5,
    format: winston.format.combine(
      categoryFilter('security'),
      structuredFormat
    ),
  }),

  // Performance logs
  new winston.transports.File({
    filename: path.join(logDir, 'performance.log'),
    maxsize: 10485760, // 10MB
    maxFiles: 5,
    format: winston.format.combine(
      categoryFilter('performance'),
      structuredFormat
    ),
  }),

  // Audit logs
  new winston.transports.File({
    filename: path.join(logDir, 'audit.log'),
    maxsize: 10485760, // 10MB
    maxFiles: 10,
    format: winston.format.combine(
      categoryFilter('audit'),
      structuredFormat
    ),
  }),
];

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  transports.push(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Create logger instance with enhanced configuration
export const logger = winston.createLogger({
  level: logLevel,
  format: structuredFormat,
  defaultMeta: {
    service: 'meetbuddy-ai-backend',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    hostname: process.env.HOSTNAME || 'localhost',
    pid: process.pid,
  },
  transports,
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: 10485760,
      maxFiles: 3,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      maxsize: 10485760,
      maxFiles: 3,
    }),
  ],
});

// Enhanced helper functions for structured logging

export interface RequestLogData {
  method: string;
  url: string;
  statusCode: number;
  duration: number;
  userAgent?: string;
  ip: string;
  userId?: string;
  requestId: string;
  requestSize?: number;
  responseSize?: number;
  referer?: string;
}

export const logRequest = (req: any, res: any, duration: number): void => {
  const logData: RequestLogData = {
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    duration,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.id,
    requestId: req.requestId,
    requestSize: req.get('Content-Length') ? parseInt(req.get('Content-Length')) : undefined,
    responseSize: res.get('Content-Length') ? parseInt(res.get('Content-Length')) : undefined,
    referer: req.get('Referer'),
  };

  // Determine log level based on status code
  const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

  logger.log(level, 'HTTP Request Completed', {
    category: 'http',
    ...logData,
  });
};

export interface ErrorLogContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  [key: string]: any;
}

export const logError = (error: Error, context?: ErrorLogContext): void => {
  logger.error('Application Error', {
    category: 'error',
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
    ...context,
  });
};

export interface SecurityEventData {
  event: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  details?: Record<string, any>;
  [key: string]: any;
}

export const logSecurity = (eventOrData: string | SecurityEventData, details?: Partial<SecurityEventData>): void => {
  let data: SecurityEventData;
  if (typeof eventOrData === 'string') {
    data = { event: eventOrData, severity: 'medium', ...details } as SecurityEventData;
  } else {
    data = eventOrData;
  }
  logger.warn('Security Event Detected', {
    category: 'security',
    securityEvent: data.event,
    severity: data.severity,
    userId: data.userId,
    ip: data.ip,
    userAgent: data.userAgent,
    requestId: data.requestId,
    timestamp: new Date().toISOString(),
    ...(typeof eventOrData === 'string' ? details : data.details),
  });
};

export interface PerformanceMetric {
  operation: string;
  duration: number;
  success: boolean;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export const logPerformance = (metric: PerformanceMetric): void => {
  const level = metric.duration > 5000 ? 'warn' : 'info'; // Warn for operations > 5s

  logger.log(level, 'Performance Metric', {
    category: 'performance',
    operation: metric.operation,
    duration: metric.duration,
    durationMs: `${metric.duration}ms`,
    success: metric.success,
    userId: metric.userId,
    requestId: metric.requestId,
    ...metric.metadata,
  });
};

export interface AuditLogData {
  action: string;
  resource: string;
  resourceId?: string;
  userId: string;
  result: 'success' | 'failure';
  ip?: string;
  userAgent?: string;
  requestId?: string;
  changes?: Record<string, any>;
  reason?: string;
}

export const logAudit = (data: AuditLogData): void => {
  logger.info('Audit Event', {
    category: 'audit',
    auditAction: data.action,
    resource: data.resource,
    resourceId: data.resourceId,
    userId: data.userId,
    result: data.result,
    ip: data.ip,
    userAgent: data.userAgent,
    requestId: data.requestId,
    changes: data.changes,
    reason: data.reason,
    timestamp: new Date().toISOString(),
  });
};

export interface DatabaseLogData {
  operation: string;
  table: string;
  duration: number;
  success: boolean;
  recordCount?: number;
  userId?: string;
  requestId?: string;
  error?: string;
}

export const logDatabase = (data: DatabaseLogData): void => {
  const level = data.success ? 'debug' : 'error';

  logger.log(level, 'Database Operation', {
    category: 'database',
    dbOperation: data.operation,
    table: data.table,
    duration: data.duration,
    durationMs: `${data.duration}ms`,
    success: data.success,
    recordCount: data.recordCount,
    userId: data.userId,
    requestId: data.requestId,
    error: data.error,
  });
};

// Log aggregation and search utilities
export class LogAggregator {
  /**
   * Store log entry in database for searchability
   */
  static async storeLogEntry(logData: any): Promise<void> {
    try {
      // Temporarily disable database logging due to MongoDB transaction limitations
      // TODO: Re-enable when MongoDB replica set is properly configured for transactions
      return;

      // Only store important logs in database to avoid overwhelming it
      const importantLevels = ['error', 'warn'];
      const importantCategories = ['security', 'audit', 'error'];

      if (importantLevels.includes(logData.level) ||
        importantCategories.includes(logData.category)) {

        await prisma.systemLog.create({
          data: {
            level: logData.level.toUpperCase() as any,
            message: logData.message,
            meta: JSON.stringify({
              ...logData,
              timestamp: new Date(logData.timestamp),
            }),
          },
        });
      }
    } catch (error) {
      // Don't let logging errors break the application
      console.error('Failed to store log entry in database:', error);
    }
  }

  /**
   * Search logs in database
   */
  static async searchLogs(params: {
    level?: string;
    category?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    message?: string;
    limit?: number;
    offset?: number;
  }) {
    const {
      level,
      category,
      userId,
      startDate,
      endDate,
      message,
      limit = 100,
      offset = 0,
    } = params;

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

    if (category || userId) {
      where.meta = {};
      if (category) {
        where.meta.path = ['category'];
        where.meta.equals = category;
      }
      // Note: For complex JSON queries, you might need raw SQL
    }

    const [logs, total] = await Promise.all([
      prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.systemLog.count({ where }),
    ]);

    return { logs, total, limit, offset };
  }

  /**
   * Get log statistics
   */
  static async getLogStats(timeframe: 'hour' | 'day' | 'week' = 'day') {
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case 'hour':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const stats = await prisma.systemLog.groupBy({
      by: ['level'],
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      _count: {
        level: true,
      },
    });

    return stats.reduce((acc, stat) => {
      acc[stat.level.toLowerCase()] = stat._count.level;
      return acc;
    }, {} as Record<string, number>);
  }
}

// Enhanced logger with database integration
const originalLog = logger.log.bind(logger);
(logger as any).log = function (level: any, message: any, meta: any = {}) {
  const logData = {
    level: typeof level === 'string' ? level : level.level,
    message: typeof level === 'string' ? message : level.message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  // Store important logs in database asynchronously
  LogAggregator.storeLogEntry(logData).catch(() => {
    // Silently fail to avoid logging loops
  });

  return originalLog(level, message, meta);
};