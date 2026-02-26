/**
 * External API Monitoring Service
 * 
 * Monitors the health and performance of external APIs and services
 * that MeetBuddy AI depends on
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { errorMonitoring } from './errorMonitoringService';
import { notificationService } from './notificationService';

export interface ExternalService {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  body?: any;
  timeout: number;
  expectedStatus: number[];
  healthCheckInterval: number; // milliseconds
  enabled: boolean;
  critical: boolean; // Whether this service is critical for system operation
}

export interface ServiceHealthStatus {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheck: Date;
  responseTime?: number;
  error?: string;
  uptime: number; // percentage over last 24 hours
  consecutiveFailures: number;
}

export interface ServiceMetrics {
  id: string;
  timestamp: Date;
  responseTime: number;
  success: boolean;
  statusCode?: number;
  error?: string;
}

export class ExternalApiMonitoringService extends EventEmitter {
  private static instance: ExternalApiMonitoringService;
  private services: Map<string, ExternalService> = new Map();
  private serviceStatus: Map<string, ServiceHealthStatus> = new Map();
  private serviceMetrics: Map<string, ServiceMetrics[]> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  constructor() {
    super();
    this.initializeDefaultServices();
  }

  static getInstance(): ExternalApiMonitoringService {
    if (!ExternalApiMonitoringService.instance) {
      ExternalApiMonitoringService.instance = new ExternalApiMonitoringService();
    }
    return ExternalApiMonitoringService.instance;
  }

  /**
   * Initialize default external services to monitor
   */
  private initializeDefaultServices(): void {
    const defaultServices: ExternalService[] = [
      {
        id: 'openai_api',
        name: 'OpenAI API',
        url: 'https://api.openai.com/v1/models',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        timeout: 10000,
        expectedStatus: [200],
        healthCheckInterval: 300000, // 5 minutes
        enabled: !!process.env.OPENAI_API_KEY,
        critical: true,
      },
      {
        id: 'google_speech_api',
        name: 'Google Speech-to-Text API',
        url: 'https://speech.googleapis.com/v1/speech:recognize',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GOOGLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: {
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 48000,
            languageCode: 'en-US',
          },
          audio: {
            content: '', // Empty for health check
          },
        },
        timeout: 15000,
        expectedStatus: [200, 400], // 400 is expected for empty audio
        healthCheckInterval: 600000, // 10 minutes
        enabled: !!process.env.GOOGLE_API_KEY,
        critical: true,
      },
      {
        id: 'google_oauth',
        name: 'Google OAuth API',
        url: 'https://www.googleapis.com/oauth2/v1/tokeninfo',
        method: 'GET',
        timeout: 5000,
        expectedStatus: [200, 400], // 400 is expected without token
        healthCheckInterval: 300000, // 5 minutes
        enabled: true,
        critical: false,
      },
      {
        id: 'microsoft_oauth',
        name: 'Microsoft OAuth API',
        url: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid_configuration',
        method: 'GET',
        timeout: 5000,
        expectedStatus: [200],
        healthCheckInterval: 300000, // 5 minutes
        enabled: true,
        critical: false,
      },
    ];

    defaultServices.forEach(service => {
      if (service.enabled) {
        this.addService(service);
      }
    });
  }

  /**
   * Add a service to monitor
   */
  addService(service: ExternalService): void {
    this.services.set(service.id, service);
    
    // Initialize status
    this.serviceStatus.set(service.id, {
      id: service.id,
      name: service.name,
      status: 'unknown',
      lastCheck: new Date(),
      uptime: 100,
      consecutiveFailures: 0,
    });

    // Initialize metrics array
    this.serviceMetrics.set(service.id, []);

    logger.info('External service added for monitoring', {
      serviceId: service.id,
      serviceName: service.name,
      url: service.url,
      critical: service.critical,
    });

    // Start monitoring if service is running
    if (this.isRunning && service.enabled) {
      this.startServiceMonitoring(service.id);
    }
  }

  /**
   * Remove a service from monitoring
   */
  removeService(serviceId: string): boolean {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    // Stop monitoring
    this.stopServiceMonitoring(serviceId);

    // Remove from maps
    this.services.delete(serviceId);
    this.serviceStatus.delete(serviceId);
    this.serviceMetrics.delete(serviceId);

    logger.info('External service removed from monitoring', { serviceId });
    return true;
  }

  /**
   * Start monitoring all services
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    logger.info('Starting external API monitoring service');

    // Start monitoring each enabled service
    for (const [serviceId, service] of this.services.entries()) {
      if (service.enabled) {
        this.startServiceMonitoring(serviceId);
      }
    }

    // Emit start event
    this.emit('started');
  }

  /**
   * Stop monitoring all services
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('Stopping external API monitoring service');

    // Stop all service monitoring
    for (const serviceId of this.services.keys()) {
      this.stopServiceMonitoring(serviceId);
    }

    // Emit stop event
    this.emit('stopped');
  }

  /**
   * Start monitoring a specific service
   */
  private startServiceMonitoring(serviceId: string): void {
    const service = this.services.get(serviceId);
    if (!service || !service.enabled) {
      return;
    }

    // Clear existing interval if any
    this.stopServiceMonitoring(serviceId);

    // Perform initial check
    this.checkServiceHealth(serviceId);

    // Set up recurring checks
    const interval = setInterval(() => {
      this.checkServiceHealth(serviceId);
    }, service.healthCheckInterval);

    this.checkIntervals.set(serviceId, interval);

    logger.debug('Started monitoring external service', {
      serviceId,
      serviceName: service.name,
      interval: service.healthCheckInterval,
    });
  }

  /**
   * Stop monitoring a specific service
   */
  private stopServiceMonitoring(serviceId: string): void {
    const interval = this.checkIntervals.get(serviceId);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(serviceId);
      logger.debug('Stopped monitoring external service', { serviceId });
    }
  }

  /**
   * Check the health of a specific service
   */
  private async checkServiceHealth(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId);
    const currentStatus = this.serviceStatus.get(serviceId);
    
    if (!service || !currentStatus) {
      return;
    }

    const startTime = Date.now();
    let success = false;
    let statusCode: number | undefined;
    let error: string | undefined;

    try {
      logger.debug('Checking external service health', {
        serviceId,
        serviceName: service.name,
        url: service.url,
      });

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), service.timeout);

      // Make the request
      const response = await fetch(service.url, {
        method: service.method,
        headers: service.headers,
        body: service.body ? JSON.stringify(service.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      statusCode = response.status;

      // Check if status code is expected
      success = service.expectedStatus.includes(response.status);

      if (!success) {
        error = `Unexpected status code: ${response.status}`;
      }

    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      
      // Handle specific error types
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          error = `Request timeout after ${service.timeout}ms`;
        } else if (err.message.includes('fetch')) {
          error = 'Network error or service unavailable';
        }
      }
    }

    const responseTime = Date.now() - startTime;
    const now = new Date();

    // Create metrics entry
    const metric: ServiceMetrics = {
      id: serviceId,
      timestamp: now,
      responseTime,
      success,
      statusCode,
      error,
    };

    // Store metric
    const metrics = this.serviceMetrics.get(serviceId)!;
    metrics.push(metric);

    // Keep only last 1000 metrics
    if (metrics.length > 1000) {
      metrics.shift();
    }

    // Update service status
    const previousStatus = currentStatus.status;
    const newStatus: ServiceHealthStatus = {
      ...currentStatus,
      lastCheck: now,
      responseTime: success ? responseTime : undefined,
      error: success ? undefined : error,
      consecutiveFailures: success ? 0 : currentStatus.consecutiveFailures + 1,
    };

    // Determine health status
    if (success) {
      if (responseTime > 10000) { // 10 seconds
        newStatus.status = 'degraded';
      } else {
        newStatus.status = 'healthy';
      }
    } else {
      if (newStatus.consecutiveFailures >= 3) {
        newStatus.status = 'unhealthy';
      } else {
        newStatus.status = 'degraded';
      }
    }

    // Calculate uptime (last 24 hours)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentMetrics = metrics.filter(m => m.timestamp >= oneDayAgo);
    if (recentMetrics.length > 0) {
      const successfulChecks = recentMetrics.filter(m => m.success).length;
      newStatus.uptime = (successfulChecks / recentMetrics.length) * 100;
    }

    this.serviceStatus.set(serviceId, newStatus);

    // Log status change
    if (previousStatus !== newStatus.status) {
      const logLevel = newStatus.status === 'unhealthy' ? 'error' : 
                     newStatus.status === 'degraded' ? 'warn' : 'info';
      
      logger.log(logLevel, 'External service status changed', {
        serviceId,
        serviceName: service.name,
        previousStatus,
        newStatus: newStatus.status,
        responseTime,
        error,
        consecutiveFailures: newStatus.consecutiveFailures,
      });

      // Track in error monitoring
      if (newStatus.status === 'unhealthy' || newStatus.status === 'degraded') {
        await errorMonitoring.trackError(new Error(`External service ${service.name} is ${newStatus.status}`), {
          operation: 'external_service_check',
          metadata: {
            serviceId,
            serviceName: service.name,
            status: newStatus.status,
            responseTime,
            error,
            consecutiveFailures: newStatus.consecutiveFailures,
            critical: service.critical,
          },
        });
      }

      // Send notifications for critical services
      if (service.critical && (newStatus.status === 'unhealthy' || 
          (previousStatus === 'healthy' && newStatus.status === 'degraded'))) {
        
        await notificationService.sendNotification({
          title: `Critical Service Alert: ${service.name}`,
          message: `External service ${service.name} is ${newStatus.status}. ${error || 'Service may be experiencing issues.'}`,
          severity: newStatus.status === 'unhealthy' ? 'critical' : 'high',
          timestamp: now,
          metadata: {
            serviceId,
            serviceName: service.name,
            url: service.url,
            status: newStatus.status,
            responseTime,
            error,
            consecutiveFailures: newStatus.consecutiveFailures,
          },
        });
      }
    }

    // Emit health check event
    this.emit('healthCheck', {
      serviceId,
      service,
      status: newStatus,
      metric,
      statusChanged: previousStatus !== newStatus.status,
    });

    // Log performance metric
    await errorMonitoring.trackPerformance(`external_api_${serviceId}`, responseTime, {
      serviceId,
      serviceName: service.name,
      success,
      statusCode,
      error,
    });
  }

  /**
   * Get status of all services
   */
  getAllServiceStatus(): ServiceHealthStatus[] {
    return Array.from(this.serviceStatus.values());
  }

  /**
   * Get status of a specific service
   */
  getServiceStatus(serviceId: string): ServiceHealthStatus | undefined {
    return this.serviceStatus.get(serviceId);
  }

  /**
   * Get metrics for a service
   */
  getServiceMetrics(serviceId: string, limit = 100): ServiceMetrics[] {
    const metrics = this.serviceMetrics.get(serviceId) || [];
    return metrics.slice(-limit);
  }

  /**
   * Get overall external services health
   */
  getOverallHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    totalServices: number;
    healthyServices: number;
    degradedServices: number;
    unhealthyServices: number;
    criticalServicesDown: number;
  } {
    const statuses = Array.from(this.serviceStatus.values());
    const services = Array.from(this.services.values());
    
    const healthyServices = statuses.filter(s => s.status === 'healthy').length;
    const degradedServices = statuses.filter(s => s.status === 'degraded').length;
    const unhealthyServices = statuses.filter(s => s.status === 'unhealthy').length;
    
    // Count critical services that are down
    const criticalServicesDown = statuses.filter(status => {
      const service = services.find(s => s.id === status.id);
      return service?.critical && (status.status === 'unhealthy' || status.status === 'degraded');
    }).length;

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (criticalServicesDown > 0) {
      overallStatus = 'unhealthy';
    } else if (unhealthyServices > 0 || degradedServices > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      totalServices: statuses.length,
      healthyServices,
      degradedServices,
      unhealthyServices,
      criticalServicesDown,
    };
  }

  /**
   * Force check all services
   */
  async checkAllServices(): Promise<void> {
    logger.info('Performing manual health check for all external services');
    
    const promises = Array.from(this.services.keys()).map(serviceId => 
      this.checkServiceHealth(serviceId)
    );
    
    await Promise.allSettled(promises);
  }

  /**
   * Get service configuration
   */
  getServices(): ExternalService[] {
    return Array.from(this.services.values());
  }

  /**
   * Update service configuration
   */
  updateService(serviceId: string, updates: Partial<ExternalService>): boolean {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    const updatedService = { ...service, ...updates };
    this.services.set(serviceId, updatedService);

    // Restart monitoring if enabled status changed
    if (updates.enabled !== undefined) {
      if (updatedService.enabled && this.isRunning) {
        this.startServiceMonitoring(serviceId);
      } else {
        this.stopServiceMonitoring(serviceId);
      }
    }

    logger.info('External service configuration updated', {
      serviceId,
      updates: Object.keys(updates),
    });

    return true;
  }
}

// Export singleton instance
export const externalApiMonitoring = ExternalApiMonitoringService.getInstance();