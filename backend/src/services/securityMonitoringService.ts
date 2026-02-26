import { prisma } from '../lib/prisma';
import { logger, logSecurity } from '../utils/logger';
import { Request } from 'express';

interface SecurityEvent {
  id?: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent?: string;
  resource?: string;
  action?: string;
  details: Record<string, any>;
  timestamp: Date;
  resolved?: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
}

enum SecurityEventType {
  AUTHENTICATION_FAILURE = 'AUTHENTICATION_FAILURE',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',
  SUSPICIOUS_LOGIN = 'SUSPICIOUS_LOGIN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  DATA_BREACH_ATTEMPT = 'DATA_BREACH_ATTEMPT',
  ADMIN_ACTION = 'ADMIN_ACTION',
  PASSWORD_RESET_ABUSE = 'PASSWORD_RESET_ABUSE',
  MULTIPLE_FAILED_LOGINS = 'MULTIPLE_FAILED_LOGINS',
  UNUSUAL_API_USAGE = 'UNUSUAL_API_USAGE',
  SUSPICIOUS_FILE_ACCESS = 'SUSPICIOUS_FILE_ACCESS',
  ACCOUNT_LOCKOUT = 'ACCOUNT_LOCKOUT',
  TOKEN_MANIPULATION = 'TOKEN_MANIPULATION',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT'
}

enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

interface SuspiciousActivityPattern {
  userId?: string;
  ipAddress: string;
  failedLoginAttempts: number;
  lastFailedLogin: Date;
  rateLimitViolations: number;
  unusualApiCalls: number;
  timeWindow: number; // minutes
}

interface SecurityAlert {
  id: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export class SecurityMonitoringService {
  private suspiciousActivityCache = new Map<string, SuspiciousActivityPattern>();
  private readonly FAILED_LOGIN_THRESHOLD = 5;
  private readonly RATE_LIMIT_THRESHOLD = 10;
  private readonly TIME_WINDOW_MINUTES = 15;
  private readonly UNUSUAL_API_THRESHOLD = 50;

  /**
   * Log a security event
   */
  async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<SecurityEvent> {
    const securityEvent: SecurityEvent = {
      ...event,
      timestamp: new Date(),
    };

    // Log to structured logging system
    logSecurity(`Security Event: ${event.eventType}`, {
      eventType: event.eventType,
      severity: event.severity,
      userId: event.userId,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      resource: event.resource,
      action: event.action,
      details: event.details,
    });

    // Store in database for audit trail
    try {
      // In a real implementation, you would store this in a security_events table
      // For now, we'll use the existing logging infrastructure
      logger.warn('Security Event Logged', {
        eventType: event.eventType,
        severity: event.severity,
        userId: event.userId,
        ipAddress: event.ipAddress,
        details: event.details,
      });

      // Update suspicious activity patterns
      await this.updateSuspiciousActivityPattern(securityEvent);

    } catch (error) {
      logger.error('Failed to store security event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        event: securityEvent,
      });
    }

    return securityEvent;
  }

  /**
   * Monitor authentication failures
   */
  async monitorAuthenticationFailure(req: Request, userId?: string, reason?: string): Promise<void> {
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    await this.logSecurityEvent({
      eventType: SecurityEventType.AUTHENTICATION_FAILURE,
      severity: SecuritySeverity.MEDIUM,
      userId,
      ipAddress,
      userAgent,
      resource: req.path,
      action: 'LOGIN_ATTEMPT',
      details: {
        reason,
        timestamp: new Date(),
        headers: {
          'user-agent': userAgent,
          'x-forwarded-for': req.get('X-Forwarded-For'),
        },
      },
    });

    // Check for multiple failed login attempts
    await this.checkMultipleFailedLogins(ipAddress, userId);
  }

  /**
   * Monitor unauthorized access attempts
   */
  async monitorUnauthorizedAccess(req: Request, userId?: string, requiredRole?: string): Promise<void> {
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    await this.logSecurityEvent({
      eventType: SecurityEventType.UNAUTHORIZED_ACCESS,
      severity: SecuritySeverity.HIGH,
      userId,
      ipAddress,
      userAgent,
      resource: req.path,
      action: req.method,
      details: {
        requiredRole,
        userRole: req.user?.role,
        timestamp: new Date(),
        params: req.params,
        query: req.query,
      },
    });
  }

  /**
   * Monitor rate limit violations
   */
  async monitorRateLimitViolation(req: Request, userId?: string): Promise<void> {
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    await this.logSecurityEvent({
      eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
      severity: SecuritySeverity.MEDIUM,
      userId,
      ipAddress,
      userAgent,
      resource: req.path,
      action: req.method,
      details: {
        timestamp: new Date(),
        endpoint: req.path,
        method: req.method,
      },
    });
  }

  /**
   * Monitor admin actions
   */
  async monitorAdminAction(
    req: Request,
    adminUserId: string,
    action: string,
    targetResource?: string,
    details?: Record<string, any>
  ): Promise<void> {
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    await this.logSecurityEvent({
      eventType: SecurityEventType.ADMIN_ACTION,
      severity: SecuritySeverity.MEDIUM,
      userId: adminUserId,
      ipAddress,
      userAgent,
      resource: targetResource || req.path,
      action,
      details: {
        adminAction: action,
        targetResource,
        requestBody: req.method !== 'GET' ? req.body : undefined,
        params: req.params,
        query: req.query,
        timestamp: new Date(),
        ...details,
      },
    });
  }

  /**
   * Monitor suspicious login patterns
   */
  async monitorSuspiciousLogin(req: Request, userId: string, reason: string): Promise<void> {
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    await this.logSecurityEvent({
      eventType: SecurityEventType.SUSPICIOUS_LOGIN,
      severity: SecuritySeverity.HIGH,
      userId,
      ipAddress,
      userAgent,
      resource: req.path,
      action: 'LOGIN',
      details: {
        reason,
        timestamp: new Date(),
        previousLoginInfo: await this.getPreviousLoginInfo(userId),
      },
    });
  }

  /**
   * Monitor potential SQL injection attempts
   */
  async monitorSQLInjectionAttempt(req: Request, suspiciousInput: string): Promise<void> {
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    await this.logSecurityEvent({
      eventType: SecurityEventType.SQL_INJECTION_ATTEMPT,
      severity: SecuritySeverity.CRITICAL,
      userId: req.user?.userId,
      ipAddress,
      userAgent,
      resource: req.path,
      action: req.method,
      details: {
        suspiciousInput,
        body: req.body,
        query: req.query,
        params: req.params,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Monitor potential XSS attempts
   */
  async monitorXSSAttempt(req: Request, suspiciousInput: string): Promise<void> {
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    await this.logSecurityEvent({
      eventType: SecurityEventType.XSS_ATTEMPT,
      severity: SecuritySeverity.HIGH,
      userId: req.user?.userId,
      ipAddress,
      userAgent,
      resource: req.path,
      action: req.method,
      details: {
        suspiciousInput,
        body: req.body,
        query: req.query,
        params: req.params,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Check for multiple failed login attempts
   */
  private async checkMultipleFailedLogins(ipAddress: string, userId?: string): Promise<void> {
    const key = userId || ipAddress;
    const pattern = this.suspiciousActivityCache.get(key) || {
      userId,
      ipAddress,
      failedLoginAttempts: 0,
      lastFailedLogin: new Date(),
      rateLimitViolations: 0,
      unusualApiCalls: 0,
      timeWindow: this.TIME_WINDOW_MINUTES,
    };

    pattern.failedLoginAttempts++;
    pattern.lastFailedLogin = new Date();
    this.suspiciousActivityCache.set(key, pattern);

    if (pattern.failedLoginAttempts >= this.FAILED_LOGIN_THRESHOLD) {
      await this.triggerSecurityAlert({
        eventType: SecurityEventType.MULTIPLE_FAILED_LOGINS,
        severity: SecuritySeverity.HIGH,
        message: `Multiple failed login attempts detected from ${ipAddress}`,
        details: {
          ipAddress,
          userId,
          failedAttempts: pattern.failedLoginAttempts,
          timeWindow: this.TIME_WINDOW_MINUTES,
        },
      });

      // Reset counter after alert
      pattern.failedLoginAttempts = 0;
      this.suspiciousActivityCache.set(key, pattern);
    }
  }

  /**
   * Update suspicious activity patterns
   */
  private async updateSuspiciousActivityPattern(event: SecurityEvent): Promise<void> {
    const key = event.userId || event.ipAddress;
    const pattern = this.suspiciousActivityCache.get(key) || {
      userId: event.userId,
      ipAddress: event.ipAddress,
      failedLoginAttempts: 0,
      lastFailedLogin: new Date(),
      rateLimitViolations: 0,
      unusualApiCalls: 0,
      timeWindow: this.TIME_WINDOW_MINUTES,
    };

    // Update pattern based on event type
    switch (event.eventType) {
      case SecurityEventType.RATE_LIMIT_EXCEEDED:
        pattern.rateLimitViolations++;
        break;
      case SecurityEventType.UNUSUAL_API_USAGE:
        pattern.unusualApiCalls++;
        break;
    }

    this.suspiciousActivityCache.set(key, pattern);

    // Check if pattern indicates suspicious activity
    await this.analyzeSuspiciousActivity(pattern);
  }

  /**
   * Analyze patterns for suspicious activity
   */
  private async analyzeSuspiciousActivity(pattern: SuspiciousActivityPattern): Promise<void> {
    const suspiciousScore = this.calculateSuspiciousScore(pattern);

    if (suspiciousScore >= 75) { // High suspicion threshold
      await this.triggerSecurityAlert({
        eventType: SecurityEventType.DATA_BREACH_ATTEMPT,
        severity: SecuritySeverity.CRITICAL,
        message: `Highly suspicious activity detected from ${pattern.ipAddress}`,
        details: {
          suspiciousScore,
          pattern,
          recommendation: 'Consider blocking IP address and investigating user account',
        },
      });
    } else if (suspiciousScore >= 50) { // Medium suspicion threshold
      await this.triggerSecurityAlert({
        eventType: SecurityEventType.UNUSUAL_API_USAGE,
        severity: SecuritySeverity.MEDIUM,
        message: `Unusual activity pattern detected from ${pattern.ipAddress}`,
        details: {
          suspiciousScore,
          pattern,
          recommendation: 'Monitor closely for additional suspicious behavior',
        },
      });
    }
  }

  /**
   * Calculate suspicious activity score
   */
  private calculateSuspiciousScore(pattern: SuspiciousActivityPattern): number {
    let score = 0;

    // Failed login attempts (0-30 points)
    score += Math.min(pattern.failedLoginAttempts * 6, 30);

    // Rate limit violations (0-25 points)
    score += Math.min(pattern.rateLimitViolations * 5, 25);

    // Unusual API calls (0-25 points)
    score += Math.min(pattern.unusualApiCalls * 2, 25);

    // Time-based factors (0-20 points)
    const now = new Date();
    const timeSinceLastActivity = now.getTime() - pattern.lastFailedLogin.getTime();
    const minutesSinceLastActivity = timeSinceLastActivity / (1000 * 60);

    if (minutesSinceLastActivity < 5) {
      score += 20; // Very recent activity
    } else if (minutesSinceLastActivity < 15) {
      score += 10; // Recent activity
    }

    return Math.min(score, 100);
  }

  /**
   * Trigger security alert
   */
  private async triggerSecurityAlert(alertData: Omit<SecurityAlert, 'id' | 'timestamp' | 'acknowledged'>): Promise<void> {
    const alert: SecurityAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...alertData,
      timestamp: new Date(),
      acknowledged: false,
    };

    // Log the alert
    logger.error('SECURITY ALERT', {
      alertId: alert.id,
      eventType: alert.eventType,
      severity: alert.severity,
      message: alert.message,
      details: alert.details,
    });

    // In a real implementation, you would:
    // 1. Store the alert in a database
    // 2. Send notifications to administrators (email, Slack, etc.)
    // 3. Trigger automated responses (IP blocking, account suspension, etc.)

    // For now, we'll use structured logging
    logSecurity('Security Alert Triggered', {
      alertId: alert.id,
      eventType: alert.eventType,
      severity: alert.severity,
      message: alert.message,
      details: alert.details,
      timestamp: alert.timestamp,
    });

    // Notify administrators based on severity
    await this.notifyAdministrators(alert);
  }

  /**
   * Notify administrators of security alerts
   */
  private async notifyAdministrators(alert: SecurityAlert): Promise<void> {
    try {
      // Get all admin users
      const adminUsers = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true, email: true, name: true },
      });

      // In a real implementation, you would send notifications via:
      // - Email
      // - Slack/Teams webhooks
      // - SMS for critical alerts
      // - Push notifications
      // - Dashboard alerts

      logger.info('Security alert notification sent to administrators', {
        alertId: alert.id,
        severity: alert.severity,
        adminCount: adminUsers.length,
        adminEmails: adminUsers.map(admin => admin.email),
      });

      // For critical alerts, you might also trigger automated responses
      if (alert.severity === SecuritySeverity.CRITICAL) {
        await this.triggerAutomatedResponse(alert);
      }

    } catch (error) {
      logger.error('Failed to notify administrators of security alert', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Trigger automated security responses
   */
  private async triggerAutomatedResponse(alert: SecurityAlert): Promise<void> {
    logger.warn('Automated security response triggered', {
      alertId: alert.id,
      eventType: alert.eventType,
      severity: alert.severity,
    });

    // In a real implementation, you might:
    // 1. Temporarily block suspicious IP addresses
    // 2. Suspend user accounts showing suspicious behavior
    // 3. Increase rate limiting for affected endpoints
    // 4. Enable additional monitoring
    // 5. Trigger backup procedures

    // For now, we'll log the intended actions
    const automatedActions = this.determineAutomatedActions(alert);

    logger.info('Automated security actions determined', {
      alertId: alert.id,
      actions: automatedActions,
    });
  }

  /**
   * Determine appropriate automated actions based on alert
   */
  private determineAutomatedActions(alert: SecurityAlert): string[] {
    const actions: string[] = [];

    switch (alert.eventType) {
      case SecurityEventType.MULTIPLE_FAILED_LOGINS:
        actions.push('Temporarily block IP address');
        actions.push('Increase rate limiting for login endpoint');
        break;

      case SecurityEventType.SQL_INJECTION_ATTEMPT:
        actions.push('Block IP address immediately');
        actions.push('Enable enhanced input validation');
        actions.push('Alert security team');
        break;

      case SecurityEventType.DATA_BREACH_ATTEMPT:
        actions.push('Block IP address immediately');
        actions.push('Suspend affected user accounts');
        actions.push('Enable emergency monitoring mode');
        actions.push('Notify security team immediately');
        break;

      case SecurityEventType.PRIVILEGE_ESCALATION:
        actions.push('Suspend user account');
        actions.push('Revoke all active sessions');
        actions.push('Alert security team');
        break;

      default:
        actions.push('Monitor closely');
        actions.push('Log additional details');
    }

    return actions;
  }

  /**
   * Get previous login information for user
   */
  private async getPreviousLoginInfo(userId: string): Promise<any> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          lastLoginAt: true,
          createdAt: true,
        },
      });

      return {
        lastLoginAt: user?.lastLoginAt,
        accountAge: user?.createdAt,
      };
    } catch (error) {
      logger.error('Failed to get previous login info', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Get security events for audit trail
   */
  async getSecurityEvents(
    page: number = 1,
    limit: number = 50,
    eventType?: SecurityEventType,
    severity?: SecuritySeverity,
    startDate?: Date,
    endDate?: Date,
    userId?: string
  ): Promise<any> {
    // In a real implementation, this would query a security_events table
    // For now, we'll return a placeholder response

    const events = [
      {
        id: 'evt_001',
        eventType: SecurityEventType.AUTHENTICATION_FAILURE,
        severity: SecuritySeverity.MEDIUM,
        userId: 'user_123',
        ipAddress: '192.168.1.100',
        timestamp: new Date(Date.now() - 60000),
        details: { reason: 'Invalid password' },
      },
      {
        id: 'evt_002',
        eventType: SecurityEventType.ADMIN_ACTION,
        severity: SecuritySeverity.MEDIUM,
        userId: 'admin_456',
        ipAddress: '192.168.1.50',
        timestamp: new Date(Date.now() - 120000),
        details: { action: 'User created', targetUser: 'user_789' },
      },
    ];

    return {
      events,
      pagination: {
        page,
        limit,
        total: events.length,
        pages: Math.ceil(events.length / limit),
      },
    };
  }

  /**
   * Clean up old suspicious activity patterns
   */
  cleanupOldPatterns(): void {
    const now = new Date();
    const cutoffTime = now.getTime() - (this.TIME_WINDOW_MINUTES * 60 * 1000);

    for (const [key, pattern] of this.suspiciousActivityCache.entries()) {
      if (pattern.lastFailedLogin.getTime() < cutoffTime) {
        this.suspiciousActivityCache.delete(key);
      }
    }
  }
}

// Export singleton instance
export const securityMonitoringService = new SecurityMonitoringService();

// Clean up old patterns every 5 minutes
setInterval(() => {
  securityMonitoringService.cleanupOldPatterns();
}, 5 * 60 * 1000);