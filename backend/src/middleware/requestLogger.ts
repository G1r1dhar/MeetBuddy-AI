import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logRequest, logSecurity, logPerformance, logger } from '../utils/logger';

// Extend Request interface to include custom properties
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
      requestSize?: number;
    }
  }
}

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Add unique request ID
  req.requestId = uuidv4();

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);

  // Record start time and request size
  req.startTime = Date.now();
  req.requestSize = req.get('Content-Length') ? parseInt(req.get('Content-Length') || '0') : 0;

  // Log incoming request
  logger.debug('HTTP Request Started', {
    category: 'http',
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    requestId: req.requestId,
    requestSize: req.requestSize,
    referer: req.get('Referer'),
    userId: (req as any).user?.id,
  });

  // Track response size
  let responseSize = 0;
  const originalWrite = res.write;
  const originalEnd = res.end;

  // Override res.write to track response size
  res.write = function (chunk: any, encoding?: any, callback?: any) {
    if (chunk) {
      responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
    }
    return originalWrite.call(this, chunk, encoding, callback);
  };

  // Override res.end to capture final metrics
  res.end = function (chunk?: any, encoding?: any, callback?: any) {
    if (chunk) {
      responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
    }

    const duration = Date.now() - req.startTime;

    // Set response size header
    if (responseSize > 0) {
      res.setHeader('X-Response-Size', responseSize.toString());
    }

    // Log the completed request
    logRequest(req, res, duration);

    // Log performance metrics for slow requests
    if (duration > 1000) { // Log requests slower than 1 second
      logPerformance({
        operation: `${req.method} ${req.route?.path || req.originalUrl}`,
        duration,
        success: res.statusCode < 400,
        userId: (req as any).user?.id,
        requestId: req.requestId,
        metadata: {
          statusCode: res.statusCode,
          requestSize: req.requestSize,
          responseSize,
        },
      });
    }

    // Log security events for suspicious requests
    if (res.statusCode === 401 || res.statusCode === 403) {
      logSecurity({
        event: res.statusCode === 401 ? 'unauthorized_access' : 'forbidden_access',
        severity: 'medium',
        userId: (req as any).user?.id,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId,
        details: {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
        },
      });
    }

    // Log potential attack patterns
    const suspiciousPatterns = [
      /\.\.\//,  // Path traversal
      /<script/i, // XSS attempts
      /union.*select/i, // SQL injection
      /javascript:/i, // JavaScript injection
    ];

    const fullUrl = req.originalUrl + JSON.stringify(req.body || {});
    if (suspiciousPatterns.some(pattern => pattern.test(fullUrl))) {
      logSecurity({
        event: 'suspicious_request_pattern',
        severity: 'high',
        userId: (req as any).user?.id,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId,
        details: {
          method: req.method,
          url: req.originalUrl,
          body: req.body,
          suspiciousContent: fullUrl,
        },
      });
    }

    // Call original end method
    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
};

// Middleware for detailed API request logging
export const apiRequestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Only log API requests in detail
  if (!req.originalUrl.startsWith('/api/')) {
    return next();
  }

  const startTime = Date.now();

  // Log API request details
  logger.info('API Request', {
    category: 'api',
    method: req.method,
    endpoint: req.originalUrl,
    userId: (req as any).user?.id,
    requestId: req.requestId,
    params: req.params,
    query: req.query,
    // Only log body for non-sensitive endpoints
    body: req.originalUrl.includes('/auth/') ? '[REDACTED]' : req.body,
    headers: {
      'content-type': req.get('Content-Type'),
      'authorization': req.get('Authorization') ? '[PRESENT]' : '[ABSENT]',
    },
  });

  // Override response to log API response
  const originalJson = res.json;
  res.json = function (body: any) {
    const duration = Date.now() - startTime;

    logger.info('API Response', {
      category: 'api',
      method: req.method,
      endpoint: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userId: (req as any).user?.id,
      requestId: req.requestId,
      // Only log response body for successful requests and non-sensitive data
      responseBody: res.statusCode >= 400 || req.originalUrl.includes('/auth/')
        ? '[REDACTED]'
        : body,
    });

    return originalJson.call(this, body);
  };

  next();
};

// Middleware for error request logging
export const errorRequestLogger = (error: Error, req: Request, res: Response, next: NextFunction): void => {
  logger.error('Request Error', {
    category: 'error',
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
    method: req.method,
    url: req.originalUrl,
    userId: (req as any).user?.id,
    requestId: req.requestId,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  next(error);
};