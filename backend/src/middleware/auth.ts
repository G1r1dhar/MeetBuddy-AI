import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/authService';
import { sessionCache } from '../utils/cache';
import { logger, logSecurity } from '../utils/logger';
import { AuthenticationError, ForbiddenError } from './errorHandler';
import { authenticationMonitoring } from './securityMonitoring';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        userId: string;
        email: string;
        name: string;
        role: string;
        sessionId: string;
      };
    }
  }
}

const authService = new AuthService();

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      logSecurity('Missing authentication token', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      throw new AuthenticationError('Access token required');
    }

    // Verify JWT token
    const decoded = await authService.verifyToken(token);

    // Check if session is still valid
    const sessionData = await sessionCache.get(decoded.sessionId);
    if (!sessionData) {
      logSecurity('Invalid or expired session', {
        sessionId: decoded.sessionId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      throw new AuthenticationError('Session expired');
    }

    // Extend session TTL on activity
    await sessionCache.extend(decoded.sessionId);

    // Add user info to request
    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      sessionId: decoded.sessionId,
    };

    logger.debug('User authenticated', {
      userId: req.user.userId,
      email: req.user.email,
      path: req.path,
      method: req.method,
    });

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({ error: error.message });
    } else if (error instanceof Error && (error as any).name === 'TokenExpiredError') {
      logSecurity('Invalid JWT token', {
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      res.status(401).json({ error: 'Token expired' });
    } else if (error instanceof jwt.JsonWebTokenError) {
      logSecurity('Invalid JWT token', {
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      res.status(401).json({ error: 'Invalid token' });
    } else {
      logger.error('Authentication middleware error', { error });
      res.status(500).json({ error: 'Authentication failed' });
    }
  }
};

/**
 * Middleware to check if user has admin role
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    throw new AuthenticationError('Authentication required');
  }

  if (req.user.role !== 'ADMIN') {
    logSecurity('Unauthorized admin access attempt', {
      userId: req.user.userId,
      email: req.user.email,
      role: req.user.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });

    // Log unauthorized access attempt
    authenticationMonitoring.onUnauthorizedAccess(req, 'ADMIN');

    throw new ForbiddenError('Admin access required');
  }

  logger.info('Admin access granted', {
    userId: req.user.userId,
    email: req.user.email,
    path: req.path,
    method: req.method,
  });

  next();
};

/**
 * Middleware to check if user has specific role
 */
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    if (!roles.includes(req.user.role)) {
      logSecurity('Unauthorized role access attempt', {
        userId: req.user.userId,
        email: req.user.email,
        role: req.user.role,
        requiredRoles: roles,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });

      // Log unauthorized access attempt
      authenticationMonitoring.onUnauthorizedAccess(req, roles.join(', '));

      throw new ForbiddenError(`Access denied. Required roles: ${roles.join(', ')}`);
    }

    next();
  };
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = await authService.verifyToken(token);
      const sessionData = await sessionCache.get(decoded.sessionId);

      if (sessionData) {
        req.user = {
          id: decoded.userId,
          userId: decoded.userId,
          email: decoded.email,
          name: decoded.name,
          role: decoded.role,
          sessionId: decoded.sessionId,
        };

        // Extend session TTL on activity
        await sessionCache.extend(decoded.sessionId);
      }
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors, just continue without user
    logger.debug('Optional auth failed', { error: error instanceof Error ? error.message : String(error) });
    next();
  }
};

/**
 * Middleware to validate API key for external integrations
 */
export const validateApiKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    logger.error('API_KEY environment variable not set');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  if (!apiKey || apiKey !== validApiKey) {
    logSecurity('Invalid API key attempt', {
      providedKey: apiKey ? 'provided' : 'missing',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  logger.info('API key validated', {
    ip: req.ip,
    path: req.path,
    method: req.method,
  });

  next();
};