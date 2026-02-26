/**
 * Error Monitoring and Alerting Service
 * 
 * Provides comprehensive error tracking, performance monitoring, and alerting capabilities
 */

import { EventEmitter } from 'events';
import { prisma } from '../lib/prisma';
import { logger, logError, logPerformance, logSecurity } from '../utils/logger';
import redisClient from '../lib/redis';
import { notificationService } from './notificationService';

export interface ErrorEvent {
  id: string;
  timestamp: Date;
  level: 'low' | 'medium' | 'high' | 'critical';
  type: 'application_error' | 'performance_issue' | 'security_incident' | 'system_failure';
  message: string;
  stack?: string;
  context: {
    userId?: string;
    requestId?: string;
    operation?: string;
    metadata?: Record<string, any>;
  };
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface PerformanceAlert {
  id: string;
  timestamp: Date;
  metric: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
  context: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  type: 'error_rate' | 'response_time' | 'error_count' | 'security_events';
  condition: string;
  threshold: number;
  timeWindow: number; // minutes
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  actions: AlertAction[];
}

export interface AlertAction {
  type: 'email' | 'webhook' | 'log' | 'slack';
  config: Record<string, any>;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: {
    database: 'connected' | 'disconnected' | 'slow';
    redis: 'connected' | 'disconnected' | 'slow';
    external_apis: 'available' | 'degraded' | 'unavailable';
  };
  metrics: {
    errorRate: number;
    avgResponseTime: number;
    activeConnections: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  alerts: {
    active: number;
    critical: number;
    resolved: number;
  };
}

export class ErrorMonitoringService extends EventEmitter {
  private static instance: ErrorMonitoringService;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, ErrorEvent> = new Map();
  private performanceMetrics: Map<string, number[]> = new Map();
  private healthCheckInterval?: NodeJS.Timeout | undefined;

  constructor() {
    super();
    this.initializeDefaultRules();
    this.startHealthChecks();
  }

  static getInstance(): ErrorMonitoringService {
    if (!ErrorMonitoringService.instance) {
      ErrorMonitoringService.instance = new ErrorMonitoringService();
    }
    return ErrorMonitoringService.instance;
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        type: 'error_rate',
        condition: 'error_rate > threshold',
        threshold: 0.05, // 5% error rate
        timeWindow: 5, // 5 minutes
        severity: 'high',
        enabled: true,
        actions: [
          { type: 'log', config: { level: 'error' } },
          { type: 'email', config: { recipients: ['admin@meetbuddy.ai'] } },
        ],
      },
      {
        id: 'slow_response_time',
        name: 'Slow Response Time',
        type: 'response_time',
        condition: 'avg_response_time > threshold',
        threshold: 2000, // 2 seconds
        timeWindow: 10, // 10 minutes
        severity: 'medium',
        enabled: true,
        actions: [
          { type: 'log', config: { level: 'warn' } },
        ],
      },
      {
        id: 'critical_errors',
        name: 'Critical Errors',
        type: 'error_count',
        condition: 'critical_errors > threshold',
        threshold: 5, // 5 critical errors
        timeWindow: 1, // 1 minute
        severity: 'critical',
        enabled: true,
        actions: [
          { type: 'log', config: { level: 'error' } },
          { type: 'email', config: { recipients: ['admin@meetbuddy.ai'], urgent: true } },
        ],
      },
      {
        id: 'security_incidents',
        name: 'Security Incidents',
        type: 'security_events',
        condition: 'security_events > threshold',
        threshold: 10, // 10 security events
        timeWindow: 5, // 5 minutes
        severity: 'high',
        enabled: true,
        actions: [
          { type: 'log', config: { level: 'error' } },
          { type: 'email', config: { recipients: ['security@meetbuddy.ai'] } },
        ],
      },
    ];

    defaultRules.forEach(rule => {
      this.alertRules.set(rule.id, rule);
    });
  }

  /**
   * Track an error event
   */
  async trackError(error: Error, context: ErrorEvent['context'] = {}): Promise<string> {
    const errorEvent: ErrorEvent = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level: this.determineErrorLevel(error, context),
      type: 'application_error',
      message: error.message,
      stack: error.stack || '',
      context,
      resolved: false,
    };

    // Store in active alerts if critical
    if (errorEvent.level === 'critical' || errorEvent.level === 'high') {
      this.activeAlerts.set(errorEvent.id, errorEvent);
    }

    // Log the error
    logError(error, {
      requestId: context.requestId || '',
      userId: context.userId || '',
      operation: context.operation || '',
      metadata: {
        errorId: errorEvent.id,
        level: errorEvent.level,
        type: errorEvent.type,
        ...context.metadata,
      },
    });

    // Store in database for persistence
    try {
      await prisma.systemLog.create({
        data: {
          level: 'ERROR',
          message: `Error Event: ${error.message}`,
          meta: JSON.stringify({
            errorId: errorEvent.id,
            level: errorEvent.level,
            type: errorEvent.type,
            stack: error.stack,
            context,
            timestamp: errorEvent.timestamp,
          }),
        },
      });
    } catch (dbError) {
      logger.error('Failed to store error event in database', { error: dbError });
    }

    // Check alert rules
    await this.checkAlertRules('error_count', 1);
    await this.checkAlertRules('error_rate', await this.calculateErrorRate());

    // Emit event for real-time monitoring
    this.emit('error', errorEvent);

    return errorEvent.id;
  }

  /**
   * Track performance metrics
   */
  async trackPerformance(metric: string, value: number, context: Record<string, any> = {}): Promise<void> {
    // Store metric value
    if (!this.performanceMetrics.has(metric)) {
      this.performanceMetrics.set(metric, []);
    }
    
    const values = this.performanceMetrics.get(metric)!;
    values.push(value);
    
    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }

    // Log performance metric
    logPerformance({
      operation: metric,
      duration: value,
      success: true,
      metadata: context,
    });

    // Check performance alert rules
    if (metric === 'response_time') {
      const avgResponseTime = this.calculateAverage(values);
      await this.checkAlertRules('response_time', avgResponseTime);
    }

    // Store in Redis for real-time access
    try {
      const key = `performance:${metric}`;
      await redisClient.lPush(key, JSON.stringify({ value, timestamp: Date.now(), context }));
      await redisClient.lTrim(key, 0, 999); // Keep last 1000 entries
      await redisClient.expire(key, 3600); // Expire after 1 hour
    } catch (redisError) {
      logger.warn('Failed to store performance metric in Redis', { error: redisError });
    }

    // Emit event for real-time monitoring
    this.emit('performance', { metric, value, context, timestamp: new Date() });
  }

  /**
   * Track security events
   */
  async trackSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', context: Record<string, any> = {}): Promise<void> {
    const securityEvent = {
      id: `security_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      event,
      severity,
      context,
    };

    // Log security event
    logSecurity({
      event,
      severity,
      userId: context.userId,
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      details: context,
    });

    // Check security alert rules
    await this.checkAlertRules('security_events', 1);

    // Emit event for real-time monitoring
    this.emit('security', securityEvent);
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const [dbHealth, redisHealth, metrics] = await Promise.all([
      this.checkDatabaseHealth(),
      this.checkRedisHealth(),
      this.getSystemMetrics(),
    ]);

    const services = {
      database: dbHealth,
      redis: redisHealth,
      external_apis: 'available' as const, // TODO: Implement external API health checks
    };

    const overallStatus = this.determineOverallHealth(services, metrics);

    return {
      status: overallStatus,
      timestamp: new Date(),
      services,
      metrics,
      alerts: {
        active: this.activeAlerts.size,
        critical: Array.from(this.activeAlerts.values()).filter(a => a.level === 'critical').length,
        resolved: 0, // TODO: Track resolved alerts
      },
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): ErrorEvent[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, resolvedBy: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();
    alert.resolvedBy = resolvedBy;

    this.activeAlerts.delete(alertId);

    // Log resolution
    logger.info('Alert resolved', {
      alertId,
      resolvedBy,
      resolvedAt: alert.resolvedAt,
      originalLevel: alert.level,
    });

    this.emit('alertResolved', alert);
    return true;
  }

  /**
   * Add or update alert rule
   */
  setAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    logger.info('Alert rule updated', { ruleId: rule.id, ruleName: rule.name });
  }

  /**
   * Get alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getSystemHealth();
        
        // Emit health status
        this.emit('healthCheck', health);
        
        // Log health status if not healthy
        if (health.status !== 'healthy') {
          logger.warn('System health check failed', { health });
        }
      } catch (error) {
        logger.error('Health check failed', { error });
      }
    }, 60000); // Every minute
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Check alert rules
   */
  private async checkAlertRules(type: AlertRule['type'], value: number): Promise<void> {
    const relevantRules = Array.from(this.alertRules.values()).filter(
      rule => rule.enabled && rule.type === type
    );

    for (const rule of relevantRules) {
      if (this.evaluateRule(rule, value)) {
        await this.triggerAlert(rule, value);
      }
    }
  }

  /**
   * Evaluate alert rule
   */
  private evaluateRule(rule: AlertRule, value: number): boolean {
    switch (rule.condition) {
      case 'error_rate > threshold':
      case 'avg_response_time > threshold':
      case 'critical_errors > threshold':
      case 'security_events > threshold':
        return value > rule.threshold;
      default:
        return false;
    }
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(rule: AlertRule, value: number): Promise<void> {
    const alertId = `alert_${rule.id}_${Date.now()}`;
    
    logger.warn('Alert triggered', {
      alertId,
      ruleName: rule.name,
      ruleType: rule.type,
      threshold: rule.threshold,
      actualValue: value,
      severity: rule.severity,
    });

    // Execute alert actions
    for (const action of rule.actions) {
      await this.executeAlertAction(action, rule, value);
    }

    this.emit('alert', { alertId, rule, value });
  }

  /**
   * Execute alert action
   */
  private async executeAlertAction(action: AlertAction, rule: AlertRule, value: number): Promise<void> {
    try {
      switch (action.type) {
        case 'log':
          logger.log(action.config.level || 'warn', `Alert: ${rule.name}`, {
            rule: rule.name,
            threshold: rule.threshold,
            actualValue: value,
            severity: rule.severity,
          });
          break;
        
        case 'email':
          await notificationService.sendNotification({
            title: `Alert: ${rule.name}`,
            message: `Alert rule "${rule.name}" has been triggered. Current value: ${value}, Threshold: ${rule.threshold}`,
            severity: rule.severity,
            timestamp: new Date(),
            metadata: {
              rule: rule.name,
              ruleType: rule.type,
              threshold: rule.threshold,
              actualValue: value,
              condition: rule.condition,
            },
          }, ['admin_email']);
          break;
        
        case 'webhook':
          await notificationService.sendNotification({
            title: `Alert: ${rule.name}`,
            message: `Alert rule "${rule.name}" has been triggered. Current value: ${value}, Threshold: ${rule.threshold}`,
            severity: rule.severity,
            timestamp: new Date(),
            metadata: {
              rule: rule.name,
              ruleType: rule.type,
              threshold: rule.threshold,
              actualValue: value,
              condition: rule.condition,
              webhookUrl: action.config.url,
            },
          }, ['monitoring_webhook']);
          break;
        
        case 'slack':
          await notificationService.sendNotification({
            title: `Alert: ${rule.name}`,
            message: `Alert rule "${rule.name}" has been triggered. Current value: ${value}, Threshold: ${rule.threshold}`,
            severity: rule.severity,
            timestamp: new Date(),
            metadata: {
              rule: rule.name,
              ruleType: rule.type,
              threshold: rule.threshold,
              actualValue: value,
              condition: rule.condition,
              channel: action.config.channel,
            },
          }, ['slack_alerts']);
          break;
      }
    } catch (error) {
      logger.error('Failed to execute alert action', { error, action, rule });
    }
  }

  /**
   * Determine error level based on error and context
   */
  private determineErrorLevel(error: Error, context: ErrorEvent['context']): ErrorEvent['level'] {
    // Critical errors
    if (error.name === 'DatabaseError' || error.message.includes('ECONNREFUSED')) {
      return 'critical';
    }
    
    // High priority errors
    if (error.name === 'AuthenticationError' || error.name === 'AuthorizationError') {
      return 'high';
    }
    
    // Medium priority errors
    if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
      return 'medium';
    }
    
    // Default to low
    return 'low';
  }

  /**
   * Calculate error rate
   */
  private async calculateErrorRate(): Promise<number> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const [totalRequests, errorRequests] = await Promise.all([
        prisma.systemLog.count({
          where: {
            createdAt: { gte: fiveMinutesAgo },
            message: 'HTTP Request Completed',
          },
        }),
        prisma.systemLog.count({
          where: {
            createdAt: { gte: fiveMinutesAgo },
            level: 'ERROR',
          },
        }),
      ]);
      
      return totalRequests > 0 ? errorRequests / totalRequests : 0;
    } catch (error) {
      logger.error('Failed to calculate error rate', { error });
      return 0;
    }
  }

  /**
   * Calculate average of array
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<SystemHealth['services']['database']> {
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const duration = Date.now() - start;
      
      if (duration > 1000) return 'slow';
      return 'connected';
    } catch (error) {
      return 'disconnected';
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<SystemHealth['services']['redis']> {
    try {
      const start = Date.now();
      await redisClient.ping();
      const duration = Date.now() - start;
      
      if (duration > 500) return 'slow';
      return 'connected';
    } catch (error) {
      return 'disconnected';
    }
  }

  /**
   * Get system metrics
   */
  private async getSystemMetrics(): Promise<SystemHealth['metrics']> {
    const errorRate = await this.calculateErrorRate();
    const responseTimeValues = this.performanceMetrics.get('response_time') || [];
    const avgResponseTime = this.calculateAverage(responseTimeValues);
    
    return {
      errorRate,
      avgResponseTime,
      activeConnections: 0, // TODO: Implement connection tracking
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      cpuUsage: 0, // TODO: Implement CPU usage tracking
    };
  }

  /**
   * Determine overall system health
   */
  private determineOverallHealth(
    services: SystemHealth['services'],
    metrics: SystemHealth['metrics']
  ): SystemHealth['status'] {
    // Critical if database is down
    if (services.database === 'disconnected') {
      return 'unhealthy';
    }
    
    // Degraded if any service is slow or Redis is down
    if (services.database === 'slow' || services.redis === 'disconnected' || services.redis === 'slow') {
      return 'degraded';
    }
    
    // Degraded if error rate is high
    if (metrics.errorRate > 0.1) { // 10% error rate
      return 'degraded';
    }
    
    // Degraded if response time is very slow
    if (metrics.avgResponseTime > 5000) { // 5 seconds
      return 'degraded';
    }
    
    return 'healthy';
  }
}

// Export singleton instance
export const errorMonitoring = ErrorMonitoringService.getInstance();