import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { logger, logSecurity } from '../utils/logger';
import { AuthenticationError, ForbiddenError } from './errorHandler';

/**
 * Enhanced admin authentication middleware with additional security checks
 */
export const verifyAdminPrivileges = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    const { userId, role } = req.user;

    // First check: Role-based verification
    if (role !== 'ADMIN') {
      logSecurity('Non-admin attempted admin access', {
        userId,
        role,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
      });
      throw new ForbiddenError('Admin privileges required');
    }

    // Second check: Database verification (ensure user still exists and is admin)
    const adminUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        email: true,
        name: true,
        lastLoginAt: true,
      },
    });

    if (!adminUser) {
      logSecurity('Admin access attempt with non-existent user', {
        userId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      throw new AuthenticationError('User account not found');
    }

    if (adminUser.role !== 'ADMIN') {
      logSecurity('Admin access attempt with demoted user', {
        userId,
        currentRole: adminUser.role,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      throw new ForbiddenError('Admin privileges have been revoked');
    }

    // Third check: Session freshness (optional additional security)
    const sessionAge = adminUser.lastLoginAt 
      ? Date.now() - adminUser.lastLoginAt.getTime()
      : Infinity;
    
    const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (sessionAge > maxSessionAge) {
      logSecurity('Admin access with stale session', {
        userId,
        sessionAge: Math.floor(sessionAge / 1000 / 60), // minutes
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      // Note: This is a warning, not a blocking condition
      // In high-security environments, you might want to require re-authentication
    }

    // Log successful admin access
    logger.info('Admin access granted', {
      userId,
      email: adminUser.email,
      name: adminUser.name,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    // Add admin user details to request for use in handlers
    req.user = {
      ...req.user,
      email: adminUser.email,
      name: adminUser.name,
    };

    next();
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof ForbiddenError) {
      res.status(error instanceof AuthenticationError ? 401 : 403).json({
        error: {
          code: error instanceof AuthenticationError ? 'AUTHENTICATION_REQUIRED' : 'INSUFFICIENT_PRIVILEGES',
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      logger.error('Admin authentication middleware error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId: req.user?.userId,
        path: req.path,
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Authentication verification failed',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
};

/**
 * Middleware to log admin actions for audit trail
 */
export const logAdminAction = (action: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Store original res.json to intercept response
    const originalJson = res.json;
    
    res.json = function(body: any) {
      // Log the admin action with request and response details
      logSecurity(`Admin action: ${action}`, {
        adminUserId: req.user?.userId,
        adminEmail: req.user?.email,
        action,
        path: req.path,
        method: req.method,
        params: req.params,
        query: req.query,
        body: req.method !== 'GET' ? req.body : undefined,
        responseStatus: res.statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
      });

      // Call original json method
      return originalJson.call(this, body);
    };

    next();
  };
};

/**
 * Rate limiting middleware for admin endpoints
 */
export const adminRateLimit = (() => {
  const attempts = new Map<string, { count: number; resetTime: number }>();
  const maxAttempts = 100; // Max 100 admin actions per hour per IP
  const windowMs = 60 * 60 * 1000; // 1 hour

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `admin:${req.ip}`;
    const now = Date.now();
    const record = attempts.get(key);

    if (!record || now > record.resetTime) {
      attempts.set(key, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxAttempts) {
      logSecurity('Admin rate limit exceeded', {
        ip: req.ip,
        userId: req.user?.userId,
        attempts: record.count,
        path: req.path,
      });

      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many admin requests. Please try again later.',
          retryAfter: Math.ceil((record.resetTime - now) / 1000),
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    record.count++;
    next();
  };
})();

/**
 * Middleware to validate admin action permissions based on target user
 */
export const validateAdminAction = (req: Request, res: Response, next: NextFunction): void => {
  const adminUserId = req.user?.userId;
  const targetUserId = req.params.id || req.body.userId;

  // Prevent admin from performing certain actions on themselves
  if (adminUserId === targetUserId) {
    const restrictedActions = ['DELETE', 'PUT'];
    const restrictedPaths = ['/users/', '/admin/users/'];
    
    const isRestrictedAction = restrictedActions.includes(req.method);
    const isRestrictedPath = restrictedPaths.some(path => req.path.includes(path));
    
    if (isRestrictedAction && isRestrictedPath) {
      // Allow role changes but not self-demotion from admin
      if (req.method === 'PUT' && req.body.role && req.body.role !== 'ADMIN') {
        logSecurity('Admin attempted self-demotion', {
          adminUserId,
          targetRole: req.body.role,
          ip: req.ip,
          path: req.path,
        });
        
        res.status(403).json({
          error: {
            code: 'SELF_MODIFICATION_DENIED',
            message: 'Cannot modify your own admin privileges',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }
      
      // Block self-deletion
      if (req.method === 'DELETE') {
        logSecurity('Admin attempted self-deletion', {
          adminUserId,
          ip: req.ip,
          path: req.path,
        });
        
        res.status(403).json({
          error: {
            code: 'SELF_DELETION_DENIED',
            message: 'Cannot delete your own account',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }
    }
  }

  next();
};