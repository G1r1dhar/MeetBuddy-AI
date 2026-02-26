import { Request, Response, NextFunction } from 'express';
import { auditTrailService } from '../services/auditTrailService';
import { logger } from '../utils/logger';

/**
 * Middleware to automatically log audit trail entries for API requests
 */
export const auditTrailMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Store original res.json to intercept response
  const originalJson = res.json;
  const originalStatus = res.status;
  let statusCode = 200;

  // Intercept status calls
  res.status = function(code: number) {
    statusCode = code;
    return originalStatus.call(this, code);
  };

  // Intercept json responses
  res.json = function(body: any) {
    // Log audit entry after response is sent
    setImmediate(async () => {
      try {
        await logAuditEntry(req, statusCode, body);
      } catch (error) {
        logger.error('Failed to log audit trail entry', {
          error: error instanceof Error ? error.message : 'Unknown error',
          path: req.path,
          method: req.method,
        });
      }
    });

    return originalJson.call(this, body);
  };

  next();
};

/**
 * Log audit entry based on request details
 */
async function logAuditEntry(req: Request, statusCode: number, responseBody: any): Promise<void> {
  const success = statusCode >= 200 && statusCode < 400;
  const errorMessage = !success && responseBody?.error ? 
    (typeof responseBody.error === 'string' ? responseBody.error : responseBody.error.message) : 
    undefined;

  // Determine action and resource from request
  const { action, resource, resourceId } = parseRequestDetails(req);

  // Skip logging for certain endpoints to avoid noise
  if (shouldSkipLogging(req.path, req.method)) {
    return;
  }

  // Log appropriate audit entry based on the endpoint
  if (req.path.startsWith('/api/auth/')) {
    await auditTrailService.logAuthenticationEvent(
      req,
      action as any,
      req.user?.userId,
      success,
      errorMessage,
      { statusCode }
    );
  } else if (req.path.startsWith('/api/admin/users')) {
    await auditTrailService.logUserManagementEvent(
      req,
      action as any,
      resourceId || req.params.id || 'unknown',
      undefined, // oldValues would need to be captured before the operation
      req.method !== 'GET' ? req.body : undefined,
      success,
      errorMessage
    );
  } else if (req.path.startsWith('/api/meetings')) {
    await auditTrailService.logMeetingEvent(
      req,
      action as any,
      resourceId || req.params.id || 'unknown',
      undefined, // oldValues would need to be captured before the operation
      req.method !== 'GET' ? req.body : undefined,
      success,
      errorMessage
    );
  } else if (req.path.startsWith('/api/admin/')) {
    await auditTrailService.logAdminAction(
      req,
      action,
      resource,
      resourceId,
      undefined, // oldValues would need to be captured before the operation
      req.method !== 'GET' ? req.body : undefined,
      success,
      errorMessage
    );
  } else {
    // Generic audit entry for other endpoints
    await auditTrailService.logAuditEntry({
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
      action: `${req.method}_${action}`,
      resource,
      resourceId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent'),
      success,
      errorMessage,
      metadata: {
        endpoint: req.path,
        method: req.method,
        statusCode,
        userEmail: req.user?.email,
      },
    });
  }
}

/**
 * Parse request details to determine action and resource
 */
function parseRequestDetails(req: Request): {
  action: string;
  resource: string;
  resourceId?: string;
} {
  const method = req.method;
  const path = req.path;
  const pathParts = path.split('/').filter(Boolean);

  let action = method.toLowerCase();
  let resource = 'unknown';
  let resourceId: string | undefined;

  // Map HTTP methods to actions
  switch (method) {
    case 'GET':
      action = path.includes('/export') ? 'export' : 'view';
      break;
    case 'POST':
      action = 'create';
      break;
    case 'PUT':
    case 'PATCH':
      action = 'update';
      break;
    case 'DELETE':
      action = 'delete';
      break;
  }

  // Determine resource from path
  if (path.startsWith('/api/auth/')) {
    resource = 'authentication';
    if (path.includes('/login')) action = 'login';
    else if (path.includes('/logout')) action = 'logout';
    else if (path.includes('/register')) action = 'register';
    else if (path.includes('/reset-password')) action = 'password_reset';
  } else if (path.startsWith('/api/users/')) {
    resource = 'user';
    resourceId = req.params.id || req.params.userId;
  } else if (path.startsWith('/api/meetings/')) {
    resource = 'meeting';
    resourceId = req.params.id || req.params.meetingId;
    if (path.includes('/capture')) {
      action = path.includes('/start') ? 'start_capture' : 'stop_capture';
    }
  } else if (path.startsWith('/api/transcripts/')) {
    resource = 'transcript';
    resourceId = req.params.id || req.params.transcriptId;
  } else if (path.startsWith('/api/summaries/')) {
    resource = 'summary';
    resourceId = req.params.id || req.params.summaryId;
  } else if (path.startsWith('/api/platforms/')) {
    resource = 'platform_integration';
    resourceId = req.params.id || req.params.platformId;
  } else if (path.startsWith('/api/admin/')) {
    if (path.includes('/users')) {
      resource = 'user_management';
      resourceId = req.params.id;
    } else if (path.includes('/analytics')) {
      resource = 'system_analytics';
      action = 'view';
    } else if (path.includes('/system-health')) {
      resource = 'system_health';
      action = 'view';
    } else if (path.includes('/settings')) {
      resource = 'system_settings';
      action = method === 'GET' ? 'view' : 'update';
    } else if (path.includes('/logs')) {
      resource = 'system_logs';
      action = 'view';
    } else {
      resource = 'admin_panel';
    }
  }

  return { action, resource, resourceId };
}

/**
 * Determine if logging should be skipped for certain endpoints
 */
function shouldSkipLogging(path: string, method: string): boolean {
  const skipPatterns = [
    '/health',
    '/api/health',
    '/favicon.ico',
    '/robots.txt',
  ];

  // Skip health checks and static files
  if (skipPatterns.some(pattern => path.includes(pattern))) {
    return true;
  }

  // Skip frequent polling endpoints
  if (method === 'GET' && path.includes('/status')) {
    return true;
  }

  return false;
}

/**
 * Middleware specifically for authentication events
 */
export const authAuditMiddleware = {
  /**
   * Log successful login
   */
  logLoginSuccess: async (req: Request, userId: string): Promise<void> => {
    await auditTrailService.logAuthenticationEvent(
      req,
      'LOGIN',
      userId,
      true,
      undefined,
      { loginMethod: 'password' }
    );
  },

  /**
   * Log failed login
   */
  logLoginFailure: async (req: Request, email?: string, reason?: string): Promise<void> => {
    await auditTrailService.logAuthenticationEvent(
      req,
      'LOGIN_FAILED',
      undefined,
      false,
      reason,
      { attemptedEmail: email }
    );
  },

  /**
   * Log logout
   */
  logLogout: async (req: Request, userId: string): Promise<void> => {
    await auditTrailService.logAuthenticationEvent(
      req,
      'LOGOUT',
      userId,
      true
    );
  },

  /**
   * Log registration
   */
  logRegistration: async (req: Request, userId: string, success: boolean, errorMessage?: string): Promise<void> => {
    await auditTrailService.logAuthenticationEvent(
      req,
      'REGISTER',
      userId,
      success,
      errorMessage,
      { email: req.body.email }
    );
  },

  /**
   * Log password reset
   */
  logPasswordReset: async (req: Request, userId?: string, success: boolean = true, errorMessage?: string): Promise<void> => {
    await auditTrailService.logAuthenticationEvent(
      req,
      'PASSWORD_RESET',
      userId,
      success,
      errorMessage,
      { email: req.body.email }
    );
  },
};

/**
 * Middleware for admin action auditing
 */
export const adminAuditMiddleware = {
  /**
   * Log admin user management action
   */
  logUserManagement: async (
    req: Request,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW',
    targetUserId: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> => {
    await auditTrailService.logUserManagementEvent(
      req,
      action,
      targetUserId,
      oldValues,
      newValues,
      success,
      errorMessage
    );
  },

  /**
   * Log system configuration change
   */
  logConfigurationChange: async (
    req: Request,
    configSection: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> => {
    await auditTrailService.logSystemConfigurationEvent(
      req,
      'UPDATE',
      configSection,
      oldValues,
      newValues,
      success,
      errorMessage
    );
  },
};

/**
 * Middleware for data access auditing
 */
export const dataAccessAuditMiddleware = {
  /**
   * Log data export
   */
  logDataExport: async (
    req: Request,
    resource: string,
    resourceId?: string,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> => {
    await auditTrailService.logDataAccessEvent(
      req,
      'export',
      resource,
      resourceId,
      success,
      errorMessage,
      { exportFormat: req.query.format || 'unknown' }
    );
  },

  /**
   * Log file download
   */
  logFileDownload: async (
    req: Request,
    fileName: string,
    fileSize?: number,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> => {
    await auditTrailService.logFileOperation(
      req,
      'DOWNLOAD',
      fileName,
      fileSize,
      success,
      errorMessage
    );
  },

  /**
   * Log file upload
   */
  logFileUpload: async (
    req: Request,
    fileName: string,
    fileSize?: number,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> => {
    await auditTrailService.logFileOperation(
      req,
      'UPLOAD',
      fileName,
      fileSize,
      success,
      errorMessage
    );
  },
};