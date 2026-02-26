import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Socket.io authentication middleware
 * Verifies JWT token from socket handshake auth or query parameters
 */
export const socketAuthMiddleware = (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
  try {
    // Get token from auth header or query parameters
    const token = socket.handshake.auth?.token || 
                  socket.handshake.query?.token as string;

    if (!token) {
      logger.warn('Socket connection attempted without token', {
        socketId: socket.id,
        ip: socket.handshake.address,
      });
      return next(new Error('Authentication token required'));
    }

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return next(new Error('Server configuration error'));
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    
    // Attach user information to socket
    socket.userId = decoded.userId;
    socket.userEmail = decoded.email;
    socket.userRole = decoded.role;

    logger.info('Socket authenticated successfully', {
      socketId: socket.id,
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    });

    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : '';
    
    logger.warn('Socket authentication failed', {
      socketId: socket.id,
      error: errorMessage,
      ip: socket.handshake.address,
    });

    if (errorName === 'TokenExpiredError') {
      next(new Error('Token expired'));
    } else if (errorName === 'JsonWebTokenError') {
      next(new Error('Invalid token'));
    } else {
      next(new Error('Authentication failed'));
    }
  }
};

/**
 * Middleware to check if user has admin privileges
 */
export const requireAdminSocket = (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
  if (socket.userRole !== 'ADMIN') {
    logger.warn('Non-admin user attempted admin socket operation', {
      socketId: socket.id,
      userId: socket.userId,
      role: socket.userRole,
    });
    return next(new Error('Admin privileges required'));
  }
  next();
};

/**
 * Helper function to extract user info from authenticated socket
 */
export const getSocketUser = (socket: AuthenticatedSocket) => {
  return {
    userId: socket.userId!,
    email: socket.userEmail!,
    role: socket.userRole!,
  };
};