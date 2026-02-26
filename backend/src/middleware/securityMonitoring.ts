import { Request, Response, NextFunction } from 'express';
import { securityMonitoringService } from '../services/securityMonitoringService';
import { logger } from '../utils/logger';

/**
 * Middleware to monitor and detect suspicious input patterns
 */
export const inputSecurityMonitoring = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Check for SQL injection patterns (more specific to avoid false positives)
    const sqlInjectionPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b.*\b(FROM|INTO|SET|WHERE|VALUES)\b)/i,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
      /(;.*--)|(--.*$)/,
      /(\bUNION\b.*\bSELECT\b)/i,
      /(\'\s*(OR|AND)\s*\'\s*=\s*\')/i,
      /(\bEXEC\s*\()/i,
    ];

    // Check for XSS patterns
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
    ];

    // Check request body, query, and params for suspicious patterns
    const inputSources = [
      { source: 'body', data: JSON.stringify(req.body || {}) },
      { source: 'query', data: JSON.stringify(req.query || {}) },
      { source: 'params', data: JSON.stringify(req.params || {}) },
    ];

    for (const { source, data } of inputSources) {
      // Check for SQL injection
      for (const pattern of sqlInjectionPatterns) {
        if (pattern.test(data)) {
          securityMonitoringService.monitorSQLInjectionAttempt(req, data);
          logger.warn('Potential SQL injection attempt detected', {
            source,
            pattern: pattern.toString(),
            userId: req.user?.userId,
            ip: req.ip,
            path: req.path,
          });
          break;
        }
      }

      // Check for XSS
      for (const pattern of xssPatterns) {
        if (pattern.test(data)) {
          securityMonitoringService.monitorXSSAttempt(req, data);
          logger.warn('Potential XSS attempt detected', {
            source,
            pattern: pattern.toString(),
            userId: req.user?.userId,
            ip: req.ip,
            path: req.path,
          });
          break;
        }
      }
    }

    next();
  } catch (error) {
    logger.error('Error in input security monitoring', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
    });
    next(); // Continue processing even if monitoring fails
  }
};

/**
 * Middleware to monitor API usage patterns
 */
export const apiUsageMonitoring = (() => {
  const apiCallCounts = new Map<string, { count: number; resetTime: number }>();
  const MONITORING_WINDOW = 60 * 1000; // 1 minute
  const UNUSUAL_THRESHOLD = 100; // calls per minute

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const key = `${req.ip}:${req.user?.userId || 'anonymous'}`;
      const now = Date.now();
      
      let record = apiCallCounts.get(key);
      
      if (!record || now > record.resetTime) {
        record = { count: 1, resetTime: now + MONITORING_WINDOW };
      } else {
        record.count++;
      }
      
      apiCallCounts.set(key, record);

      // Check for unusual API usage
      if (record.count > UNUSUAL_THRESHOLD) {
        securityMonitoringService.logSecurityEvent({
          eventType: 'UNUSUAL_API_USAGE' as any,
          severity: 'MEDIUM' as any,
          userId: req.user?.userId,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent'),
          resource: req.path,
          action: req.method,
          details: {
            callCount: record.count,
            timeWindow: MONITORING_WINDOW / 1000,
            threshold: UNUSUAL_THRESHOLD,
          },
        });
      }

      next();
    } catch (error) {
      logger.error('Error in API usage monitoring', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: req.path,
      });
      next();
    }
  };
})();

/**
 * Middleware to monitor file access patterns
 */
export const fileAccessMonitoring = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Monitor access to sensitive file endpoints
    const sensitivePatterns = [
      /\/api\/admin\//,
      /\/api\/users\/.*\/avatar/,
      /\/api\/meetings\/.*\/export/,
      /\/api\/transcripts\/.*\/download/,
    ];

    const isSensitiveEndpoint = sensitivePatterns.some(pattern => 
      pattern.test(req.path)
    );

    if (isSensitiveEndpoint) {
      securityMonitoringService.logSecurityEvent({
        eventType: 'SUSPICIOUS_FILE_ACCESS' as any,
        severity: 'LOW' as any,
        userId: req.user?.userId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent'),
        resource: req.path,
        action: req.method,
        details: {
          endpoint: req.path,
          method: req.method,
          params: req.params,
          query: req.query,
          userRole: req.user?.role,
        },
      });
    }

    next();
  } catch (error) {
    logger.error('Error in file access monitoring', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
    });
    next();
  }
};

/**
 * Middleware to monitor authentication events
 */
export const authenticationMonitoring = {
  /**
   * Monitor successful login
   */
  onLoginSuccess: async (req: Request, userId: string): Promise<void> => {
    try {
      // Check for suspicious login patterns
      const user = await import('../lib/prisma').then(({ prisma }) =>
        prisma.user.findUnique({
          where: { id: userId },
          select: { lastLoginAt: true, email: true },
        })
      );

      if (user?.lastLoginAt) {
        const timeSinceLastLogin = Date.now() - user.lastLoginAt.getTime();
        const hoursSinceLastLogin = timeSinceLastLogin / (1000 * 60 * 60);

        // Flag logins from different locations or unusual times
        if (hoursSinceLastLogin < 0.5) { // Less than 30 minutes
          await securityMonitoringService.monitorSuspiciousLogin(
            req,
            userId,
            'Very frequent login attempts'
          );
        }
      }

      // Log successful authentication
      logger.info('User authentication successful', {
        userId,
        email: user?.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });

    } catch (error) {
      logger.error('Error in authentication success monitoring', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
    }
  },

  /**
   * Monitor failed login
   */
  onLoginFailure: async (req: Request, email?: string, reason?: string): Promise<void> => {
    try {
      let userId: string | undefined;

      if (email) {
        const user = await import('../lib/prisma').then(({ prisma }) =>
          prisma.user.findUnique({
            where: { email },
            select: { id: true },
          })
        );
        userId = user?.id;
      }

      await securityMonitoringService.monitorAuthenticationFailure(req, userId, reason);

    } catch (error) {
      logger.error('Error in authentication failure monitoring', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
      });
    }
  },

  /**
   * Monitor unauthorized access
   */
  onUnauthorizedAccess: async (req: Request, requiredRole?: string): Promise<void> => {
    try {
      await securityMonitoringService.monitorUnauthorizedAccess(req, req.user?.userId, requiredRole);
    } catch (error) {
      logger.error('Error in unauthorized access monitoring', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.userId,
      });
    }
  },
};

/**
 * Middleware to monitor rate limit violations
 */
export const rateLimitMonitoring = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Store original res.status to intercept 429 responses
  const originalStatus = res.status;
  
  res.status = function(code: number) {
    if (code === 429) {
      // Rate limit exceeded
      securityMonitoringService.monitorRateLimitViolation(req, req.user?.userId);
    }
    return originalStatus.call(this, code);
  };

  next();
};

/**
 * Comprehensive security monitoring middleware
 */
export const comprehensiveSecurityMonitoring = [
  inputSecurityMonitoring,
  apiUsageMonitoring,
  fileAccessMonitoring,
  rateLimitMonitoring,
];