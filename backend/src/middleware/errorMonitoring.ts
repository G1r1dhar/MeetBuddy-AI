/**
 * Error Monitoring Middleware
 * 
 * Integrates error monitoring service with Express middleware
 * to automatically track errors and performance metrics
 */

import { Request, Response, NextFunction } from 'express';
import { errorMonitoring } from '../services/errorMonitoringService';
import { logger } from '../utils/logger';

// Extend Request interface to include monitoring data
declare global {
  namespace Express {
    interface Request {
      monitoringStartTime?: number;
      monitoringContext?: {
        operation?: string;
        metadata?: Record<string, any>;
      };
    }
  }
}

/**
 * Middleware to track request performance
 */
export const performanceMonitoring = (req: Request, res: Response, next: NextFunction): void => {
  // Record start time
  req.monitoringStartTime = Date.now();
  
  // Set up monitoring context
  req.monitoringContext = {
    operation: `${req.method} ${req.route?.path || req.path}`,
    metadata: {
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: (req as any).user?.id,
      requestId: (req as any).requestId,
    },
  };

  // Override res.end to capture response metrics
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, callback?: any) {
    if (req.monitoringStartTime) {
      const duration = Date.now() - req.monitoringStartTime;
      
      // Track performance metric
      errorMonitoring.trackPerformance('response_time', duration, {
        ...req.monitoringContext?.metadata,
        statusCode: res.statusCode,
        success: res.statusCode < 400,
      }).catch(error => {
        logger.warn('Failed to track performance metric', { error });
      });

      // Track slow requests as potential issues
      if (duration > 5000) { // 5 seconds
        errorMonitoring.trackPerformance('slow_request', duration, {
          ...req.monitoringContext?.metadata,
          statusCode: res.statusCode,
          threshold: 5000,
        }).catch(error => {
          logger.warn('Failed to track slow request', { error });
        });
      }
    }
    
    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
};

/**
 * Middleware to automatically track errors
 */
export const errorTrackingMiddleware = (error: Error, req: Request, res: Response, next: NextFunction): void => {
  // Skip tracking for expected authentication errors (401)
  if (error.name === 'AuthenticationError' && (error as any).statusCode === 401) {
    next(error);
    return;
  }

  // Skip tracking for expected authorization errors (403)
  if (error.name === 'AuthorizationError' && (error as any).statusCode === 403) {
    next(error);
    return;
  }

  // Track the error
  errorMonitoring.trackError(error, {
    requestId: (req as any).requestId,
    userId: (req as any).user?.id,
    operation: req.monitoringContext?.operation || `${req.method} ${req.path}`,
    metadata: {
      ...req.monitoringContext?.metadata,
      statusCode: res.statusCode,
      errorName: error.name,
      url: req.originalUrl,
      body: req.method !== 'GET' ? req.body : undefined,
      params: req.params,
      query: req.query,
    },
  }).catch(trackingError => {
    logger.warn('Failed to track error', { error: trackingError, originalError: error });
  });

  // Continue with normal error handling
  next(error);
};

/**
 * Middleware to track security events
 */
export const securityEventTracking = (req: Request, res: Response, next: NextFunction): void => {
  // Override res.status to detect security-related status codes
  const originalStatus = res.status;
  res.status = function(code: number) {
    // Track security events for specific status codes
    if (code === 401 || code === 403) {
      const severity = code === 401 ? 'medium' : 'high';
      const event = code === 401 ? 'unauthorized_access' : 'forbidden_access';
      
      errorMonitoring.trackSecurityEvent(event, severity, {
        userId: (req as any).user?.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: (req as any).requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: code,
      }).catch(error => {
        logger.warn('Failed to track security event', { error });
      });
    }
    
    return originalStatus.call(this, code);
  };

  // Check for suspicious patterns in request
  const suspiciousPatterns = [
    /\.\.\//,  // Path traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript injection
    /eval\(/i, // Code injection
    /exec\(/i, // Command injection
  ];

  const fullUrl = req.originalUrl + JSON.stringify(req.body || {});
  const suspiciousPattern = suspiciousPatterns.find(pattern => pattern.test(fullUrl));
  
  if (suspiciousPattern) {
    errorMonitoring.trackSecurityEvent('suspicious_request_pattern', 'high', {
      userId: (req as any).user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: (req as any).requestId,
      method: req.method,
      url: req.originalUrl,
      body: req.body,
      pattern: suspiciousPattern.toString(),
      suspiciousContent: fullUrl.substring(0, 500), // Limit length
    }).catch(error => {
      logger.warn('Failed to track suspicious pattern', { error });
    });
  }

  next();
};

/**
 * Middleware to track database operations
 */
export const databaseMonitoring = (operation: string, table: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    let success = true;
    let recordCount: number | undefined;
    let error: string | undefined;

    // Override res.json to capture success/failure
    const originalJson = res.json;
    res.json = function(body: any) {
      const duration = Date.now() - startTime;
      
      // Determine success based on status code
      success = res.statusCode < 400;
      
      // Try to extract record count from response
      if (body && typeof body === 'object') {
        if (Array.isArray(body)) {
          recordCount = body.length;
        } else if (body.data && Array.isArray(body.data)) {
          recordCount = body.data.length;
        } else if (body.total && typeof body.total === 'number') {
          recordCount = body.total;
        }
      }

      // Track database operation
      errorMonitoring.trackPerformance(`db_${operation.toLowerCase()}_${table}`, duration, {
        operation,
        table,
        success,
        recordCount,
        userId: (req as any).user?.id,
        requestId: (req as any).requestId,
        error,
      }).catch(trackingError => {
        logger.warn('Failed to track database operation', { error: trackingError });
      });

      return originalJson.call(this, body);
    };

    // Override error handling
    const originalNext = next;
    const monitoringNext = (err?: any) => {
      if (err) {
        success = false;
        error = err.message;
        
        const duration = Date.now() - startTime;
        errorMonitoring.trackPerformance(`db_${operation.toLowerCase()}_${table}`, duration, {
          operation,
          table,
          success,
          userId: (req as any).user?.id,
          requestId: (req as any).requestId,
          error,
        }).catch(trackingError => {
          logger.warn('Failed to track failed database operation', { error: trackingError });
        });
      }
      
      originalNext(err);
    };

    next = monitoringNext;
    next();
  };
};

/**
 * Middleware to track API endpoint usage
 */
export const apiUsageTracking = (req: Request, res: Response, next: NextFunction): void => {
  // Only track API endpoints
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  const endpoint = `${req.method} ${req.route?.path || req.path}`;
  
  // Track API usage
  errorMonitoring.trackPerformance('api_usage', 1, {
    endpoint,
    method: req.method,
    path: req.path,
    userId: (req as any).user?.id,
    requestId: (req as any).requestId,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  }).catch(error => {
    logger.warn('Failed to track API usage', { error });
  });

  next();
};

/**
 * Middleware to track authentication events
 */
export const authenticationTracking = (req: Request, res: Response, next: NextFunction): void => {
  // Only track auth endpoints
  if (!req.path.startsWith('/api/auth/')) {
    return next();
  }

  const originalJson = res.json;
  res.json = function(body: any) {
    const success = res.statusCode < 400;
    const event = req.path.includes('/login') ? 'login_attempt' : 
                  req.path.includes('/register') ? 'registration_attempt' :
                  req.path.includes('/logout') ? 'logout_attempt' : 'auth_attempt';

    // Track authentication event
    if (!success) {
      errorMonitoring.trackSecurityEvent(`failed_${event}`, 'medium', {
        userId: body?.user?.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: (req as any).requestId,
        endpoint: req.path,
        statusCode: res.statusCode,
        reason: body?.error || 'unknown',
      }).catch(error => {
        logger.warn('Failed to track authentication event', { error });
      });
    } else {
      // Track successful authentication for analytics
      errorMonitoring.trackPerformance(`successful_${event}`, 1, {
        userId: body?.user?.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: (req as any).requestId,
        endpoint: req.path,
      }).catch(error => {
        logger.warn('Failed to track successful authentication', { error });
      });
    }

    return originalJson.call(this, body);
  };

  next();
};

/**
 * Middleware to track rate limiting events
 */
export const rateLimitTracking = (req: Request, res: Response, next: NextFunction): void => {
  const originalStatus = res.status;
  res.status = function(code: number) {
    if (code === 429) { // Too Many Requests
      errorMonitoring.trackSecurityEvent('rate_limit_exceeded', 'medium', {
        userId: (req as any).user?.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: (req as any).requestId,
        endpoint: req.path,
        method: req.method,
      }).catch(error => {
        logger.warn('Failed to track rate limit event', { error });
      });
    }
    
    return originalStatus.call(this, code);
  };

  next();
};