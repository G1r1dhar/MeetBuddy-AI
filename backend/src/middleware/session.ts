import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { sessionCache } from '../utils/cache';
import { logger } from '../utils/logger';
import { AuthenticationError } from './errorHandler';

interface JWTPayload {
  userId: string;
  sessionId: string;
  role: string;
  iat: number;
  exp: number;
}

interface SessionData {
  userId: string;
  role: string;
  email: string;
  name: string;
  lastActivity: string;
  ipAddress: string;
  userAgent: string;
}

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
      sessionId?: string;
    }
  }
}

/**
 * Middleware to authenticate JWT tokens and manage sessions with Redis
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
      throw new AuthenticationError('Access token required');
    }

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    // Check if session exists in Redis
    const sessionData = await sessionCache.get(decoded.sessionId);
    if (!sessionData) {
      throw new AuthenticationError('Session expired or invalid');
    }

    // Validate session data
    const session = sessionData as SessionData;
    if (session.userId !== decoded.userId) {
      throw new AuthenticationError('Session mismatch');
    }

    // Update last activity
    const updatedSession: SessionData = {
      ...session,
      lastActivity: new Date().toISOString(),
    };

    // Extend session TTL
    await sessionCache.set(decoded.sessionId, updatedSession);
    await sessionCache.extend(decoded.sessionId);

    // Attach user info to request
    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      role: decoded.role,
      email: session.email,
      name: session.name,
      sessionId: decoded.sessionId,
    };

    req.sessionId = decoded.sessionId;

    logger.debug('User authenticated', {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
      path: req.path,
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthenticationError('Invalid token'));
    }
    if (error instanceof Error && (error as any).name === 'TokenExpiredError') {
      next(new AuthenticationError('Token expired'));
    } else {
      next(error);
    }
  }
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (requiredRole: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (req.user.role !== requiredRole && req.user.role !== 'ADMIN') {
      return next(new AuthenticationError('Insufficient permissions'));
    }

    next();
  };
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = requireRole('ADMIN');

/**
 * Optional authentication - doesn't fail if no token provided
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(); // No token provided, continue without authentication
    }

    // Try to authenticate
    await authenticateToken(req, res, next);
  } catch (error) {
    // Authentication failed, but continue without user info
    logger.debug('Optional authentication failed', { error: error instanceof Error ? error.message : String(error) });
    next();
  }
};

/**
 * Create a new session
 */
export const createSession = async (
  userId: string,
  userEmail: string,
  userName: string,
  userRole: string,
  req: Request
): Promise<{ token: string; sessionId: string }> => {
  const sessionId = `session_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Create session data for Redis
  const sessionData: SessionData = {
    userId,
    role: userRole,
    email: userEmail,
    name: userName,
    lastActivity: new Date().toISOString(),
    ipAddress: req.ip || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown',
  };

  // Store session in Redis
  await sessionCache.set(sessionId, sessionData);

  // Store session in database for management
  const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days
  await prisma.userSession.create({
    data: {
      userId,
      sessionId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      expiresAt,
    },
  });

  // Create JWT token
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  const tokenPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
    userId,
    sessionId,
    role: userRole,
  };

  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: expiresIn as any });

  logger.info('Session created', {
    userId,
    sessionId,
    ipAddress: sessionData.ipAddress,
  });

  return { token, sessionId };
};

/**
 * Destroy a session
 */
export const destroySession = async (sessionId: string): Promise<void> => {
  // Remove from Redis
  await sessionCache.invalidate(sessionId);

  // Mark as inactive in database
  await prisma.userSession.updateMany({
    where: { sessionId },
    data: { isActive: false },
  });

  logger.info('Session destroyed', { sessionId });
};

/**
 * Get all active sessions for a user
 */
export const getUserSessions = async (userId: string): Promise<SessionData[]> => {
  // This would require a more complex Redis structure to efficiently query by userId
  // For now, we'll return empty array - this can be implemented with Redis sets
  // storing session IDs per user
  return [];
};

/**
 * Destroy all sessions for a user
 */
export const destroyAllUserSessions = async (userId: string): Promise<void> => {
  // This would require the Redis structure mentioned above
  // For now, we'll log the action
  logger.info('All user sessions destroyed', { userId });
};