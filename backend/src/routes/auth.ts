import { Router } from 'express';
import Joi from 'joi';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/session';
import { AuthService } from '../services/authService';
import { validate } from '../utils/validation';
import { authSchemas } from '../utils/validation';
import { rateLimitCache } from '../utils/cache';
import { logger } from '../utils/logger';

const router = Router();
const authService = new AuthService();

// Rate limiting for auth endpoints
const authRateLimit = async (req: any, res: any, next: any) => {
  const identifier = req.ip;
  const result = await rateLimitCache.increment(identifier, 15 * 60 * 1000, 10); // 10 requests per 15 minutes
  
  if (!result.allowed) {
    return res.status(429).json({
      error: {
        message: 'Too many authentication attempts. Please try again later.',
        statusCode: 429,
        resetTime: result.resetTime,
      },
    });
  }
  
  next();
};

// POST /api/auth/register
router.post('/register', 
  authRateLimit,
  validate(authSchemas.register),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body, req);
    
    res.status(201).json({
      message: 'User registered successfully',
      data: result,
    });
  })
);

// POST /api/auth/login
router.post('/login',
  authRateLimit,
  validate(authSchemas.login),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, req);
    
    res.status(200).json({
      message: 'Login successful',
      data: result,
    });
  })
);

// POST /api/auth/logout
router.post('/logout',
  authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.sessionId) {
      return res.status(400).json({
        error: {
          message: 'No active session found',
          statusCode: 400,
        },
      });
    }

    await authService.logout(req.sessionId, req.user.id);
    
    res.status(200).json({
      message: 'Logout successful',
    });
  })
);

// POST /api/auth/refresh
router.post('/refresh',
  validate(authSchemas.refreshToken),
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    const result = await authService.refreshToken(token, req);
    
    res.status(200).json({
      message: 'Token refreshed successfully',
      data: result,
    });
  })
);

// POST /api/auth/forgot-password
router.post('/forgot-password',
  authRateLimit,
  validate(authSchemas.forgotPassword),
  asyncHandler(async (req, res) => {
    await authService.requestPasswordReset(req.body, req);
    
    // Always return success to prevent email enumeration
    res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  })
);

// POST /api/auth/reset-password
router.post('/reset-password',
  authRateLimit,
  validate(authSchemas.resetPassword),
  asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body, req);
    
    res.status(200).json({
      message: 'Password reset successfully. Please log in with your new password.',
    });
  })
);

// POST /api/auth/change-password
router.post('/change-password',
  authenticateToken,
  validate(authSchemas.changePassword),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword, req);
    
    res.status(200).json({
      message: 'Password changed successfully',
    });
  })
);

// GET /api/auth/me
router.get('/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    const user = await authService.getUserById(req.user.id);
    
    res.status(200).json({
      message: 'User profile retrieved successfully',
      data: { user },
    });
  })
);

// POST /api/auth/verify-token
router.post('/verify-token',
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(400).json({
        error: {
          message: 'Token is required',
          statusCode: 400,
        },
      });
    }

    try {
      const decoded = await authService.verifyToken(token);
      const user = await authService.getUserById(decoded.userId);
      
      res.status(200).json({
        message: 'Token is valid',
        data: {
          valid: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
      });
    } catch (error) {
      res.status(401).json({
        error: {
          message: 'Invalid or expired token',
          statusCode: 401,
        },
        data: {
          valid: false,
        },
      });
    }
  })
);

// POST /api/auth/setup-mfa
router.post('/setup-mfa',
  authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    const result = await authService.setupMfa(req.user.id);
    
    res.status(200).json({
      message: 'MFA setup initiated successfully',
      data: result,
    });
  })
);

// POST /api/auth/enable-mfa
router.post('/enable-mfa',
  authenticateToken,
  validate(Joi.object({
    token: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      'string.length': 'MFA token must be 6 digits',
      'string.pattern.base': 'MFA token must contain only numbers',
      'any.required': 'MFA token is required',
    }),
  })),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    const { token } = req.body;
    await authService.enableMfa(req.user.id, token);
    
    res.status(200).json({
      message: 'MFA enabled successfully',
    });
  })
);

// POST /api/auth/disable-mfa
router.post('/disable-mfa',
  authenticateToken,
  validate(Joi.object({
    password: Joi.string().required().messages({
      'any.required': 'Current password is required',
    }),
    mfaToken: Joi.string().required().messages({
      'any.required': 'MFA token is required',
    }),
  })),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    const { password, mfaToken } = req.body;
    await authService.disableMfa(req.user.id, password, mfaToken);
    
    res.status(200).json({
      message: 'MFA disabled successfully',
    });
  })
);

// GET /api/auth/sessions
router.get('/sessions',
  authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    const sessions = await authService.getUserSessions(req.user.id);
    
    res.status(200).json({
      message: 'Sessions retrieved successfully',
      data: { sessions },
    });
  })
);

// DELETE /api/auth/sessions/:sessionId
router.delete('/sessions/:sessionId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    const { sessionId } = req.params;
    await authService.revokeSession(req.user.id, sessionId);
    
    res.status(200).json({
      message: 'Session revoked successfully',
    });
  })
);

// DELETE /api/auth/sessions
router.delete('/sessions',
  authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.sessionId) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    await authService.revokeAllSessions(req.user.id, req.sessionId);
    
    res.status(200).json({
      message: 'All sessions revoked successfully',
    });
  })
);

export { router as authRoutes };