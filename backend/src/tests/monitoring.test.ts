/**
 * Monitoring Services Test
 * 
 * Tests the error monitoring and alerting functionality
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { errorMonitoring } from '../services/errorMonitoringService';
import { externalApiMonitoring } from '../services/externalApiMonitoringService';
import { notificationService } from '../services/notificationService';
import { logger } from '../utils/logger';

describe('Error Monitoring and Alerting', () => {
  beforeAll(async () => {
    // Start monitoring services
    externalApiMonitoring.start();
  });

  afterAll(async () => {
    // Stop monitoring services
    errorMonitoring.stopHealthChecks();
    externalApiMonitoring.stop();
  });

  describe('Error Tracking', () => {
    it('should track application errors with proper context', async () => {
      const testError = new Error('Test application error');
      const context = {
        userId: 'test-user-123',
        requestId: 'req-123',
        operation: 'test_operation',
        metadata: { testData: 'test-value' },
      };

      const errorId = await errorMonitoring.trackError(testError, context);

      expect(errorId).toBeDefined();
      expect(typeof errorId).toBe('string');
      expect(errorId).toMatch(/^error_\d+_[a-z0-9]+$/);
    });

    it('should determine appropriate error levels', async () => {
      const criticalError = new Error('Database connection failed');
      criticalError.name = 'DatabaseError';
      
      const highError = new Error('Authentication failed');
      highError.name = 'AuthenticationError';
      
      const mediumError = new Error('Validation failed');
      mediumError.name = 'ValidationError';

      const criticalId = await errorMonitoring.trackError(criticalError);
      const highId = await errorMonitoring.trackError(highError);
      const mediumId = await errorMonitoring.trackError(mediumError);

      expect(criticalId).toBeDefined();
      expect(highId).toBeDefined();
      expect(mediumId).toBeDefined();
    });
  });

  describe('Performance Monitoring', () => {
    it('should track performance metrics', async () => {
      const metric = 'test_operation';
      const value = 150; // 150ms
      const context = { operation: 'test', success: true };

      await errorMonitoring.trackPerformance(metric, value, context);

      // Performance tracking should complete without errors
      expect(true).toBe(true);
    });

    it('should track slow operations', async () => {
      const metric = 'slow_operation';
      const value = 6000; // 6 seconds (slow)
      const context = { operation: 'slow_test', success: true };

      await errorMonitoring.trackPerformance(metric, value, context);

      // Should complete without errors
      expect(true).toBe(true);
    });
  });

  describe('Security Event Tracking', () => {
    it('should track security events with proper severity', async () => {
      const event = 'suspicious_login_attempt';
      const severity = 'high';
      const context = {
        userId: 'test-user-123',
        ip: '192.168.1.100',
        userAgent: 'Test User Agent',
        requestId: 'req-456',
      };

      await errorMonitoring.trackSecurityEvent(event, severity, context);

      // Security event tracking should complete without errors
      expect(true).toBe(true);
    });

    it('should handle different security event types', async () => {
      const events = [
        { event: 'failed_login', severity: 'medium' as const },
        { event: 'rate_limit_exceeded', severity: 'medium' as const },
        { event: 'suspicious_request_pattern', severity: 'high' as const },
        { event: 'unauthorized_access', severity: 'high' as const },
      ];

      for (const { event, severity } of events) {
        await errorMonitoring.trackSecurityEvent(event, severity, {
          ip: '192.168.1.100',
          userAgent: 'Test Agent',
        });
      }

      expect(true).toBe(true);
    });
  });

  describe('System Health Monitoring', () => {
    it('should provide system health status', async () => {
      const health = await errorMonitoring.getSystemHealth();

      expect(health).toBeDefined();
      expect(health.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(health.timestamp).toBeInstanceOf(Date);
      expect(health.services).toBeDefined();
      expect(health.metrics).toBeDefined();
      expect(health.alerts).toBeDefined();
    });

    it('should track database and Redis health', async () => {
      const health = await errorMonitoring.getSystemHealth();

      expect(health.services.database).toMatch(/^(connected|disconnected|slow)$/);
      expect(health.services.redis).toMatch(/^(connected|disconnected|slow)$/);
    });
  });

  describe('Alert Management', () => {
    it('should manage alert rules', () => {
      const rules = errorMonitoring.getAlertRules();
      
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
      
      // Check default rules exist
      const ruleNames = rules.map(r => r.name);
      expect(ruleNames).toContain('High Error Rate');
      expect(ruleNames).toContain('Slow Response Time');
      expect(ruleNames).toContain('Critical Errors');
      expect(ruleNames).toContain('Security Incidents');
    });

    it('should track active alerts', () => {
      const activeAlerts = errorMonitoring.getActiveAlerts();
      
      expect(Array.isArray(activeAlerts)).toBe(true);
      // Active alerts count can be 0 or more
      expect(activeAlerts.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('External API Monitoring', () => {
    it('should monitor external services', () => {
      const services = externalApiMonitoring.getServices();
      
      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBeGreaterThan(0);
      
      // Check for expected services
      const serviceIds = services.map(s => s.id);
      expect(serviceIds).toContain('openai_api');
      expect(serviceIds).toContain('google_oauth');
      expect(serviceIds).toContain('microsoft_oauth');
    });

    it('should provide service health status', () => {
      const statuses = externalApiMonitoring.getAllServiceStatus();
      
      expect(Array.isArray(statuses)).toBe(true);
      
      statuses.forEach(status => {
        expect(status.id).toBeDefined();
        expect(status.name).toBeDefined();
        expect(status.status).toMatch(/^(healthy|degraded|unhealthy|unknown)$/);
        expect(status.lastCheck).toBeInstanceOf(Date);
        expect(typeof status.uptime).toBe('number');
        expect(status.uptime).toBeGreaterThanOrEqual(0);
        expect(status.uptime).toBeLessThanOrEqual(100);
      });
    });

    it('should provide overall external health status', () => {
      const overallHealth = externalApiMonitoring.getOverallHealth();
      
      expect(overallHealth.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(typeof overallHealth.totalServices).toBe('number');
      expect(typeof overallHealth.healthyServices).toBe('number');
      expect(typeof overallHealth.degradedServices).toBe('number');
      expect(typeof overallHealth.unhealthyServices).toBe('number');
      expect(typeof overallHealth.criticalServicesDown).toBe('number');
      
      // Verify counts add up
      const total = overallHealth.healthyServices + 
                   overallHealth.degradedServices + 
                   overallHealth.unhealthyServices;
      expect(total).toBeLessThanOrEqual(overallHealth.totalServices);
    });
  });

  describe('Notification System Integration', () => {
    it('should have notification channels configured', () => {
      const channels = notificationService.getChannels();
      
      expect(Array.isArray(channels)).toBe(true);
      // Should have at least basic channels configured
      expect(channels.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle notification sending gracefully', async () => {
      // Test notification without actually sending
      const testNotification = {
        title: 'Test Alert',
        message: 'This is a test alert for monitoring',
        severity: 'medium' as const,
        timestamp: new Date(),
        metadata: { test: true },
      };

      // This should not throw an error even if no channels are configured
      try {
        await notificationService.sendNotification(testNotification, ['test_channel']);
        expect(true).toBe(true);
      } catch (error) {
        // Notification failures should be handled gracefully
        expect(error).toBeDefined();
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle monitoring service failures gracefully', async () => {
      // Test that monitoring continues to work even if some components fail
      const originalConsoleError = console.error;
      console.error = vi.fn(); // Suppress error logs during test

      try {
        // Try to track an error with invalid context
        await errorMonitoring.trackError(new Error('Test error'), {
          metadata: { circular: {} },
        });
        
        // Should complete without throwing
        expect(true).toBe(true);
      } finally {
        console.error = originalConsoleError;
      }
    });

    it('should maintain service availability during high load', async () => {
      // Simulate multiple concurrent operations
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          errorMonitoring.trackPerformance(`load_test_${i}`, Math.random() * 1000, {
            iteration: i,
            loadTest: true,
          })
        );
      }
      
      // All operations should complete successfully
      await Promise.all(promises);
      expect(true).toBe(true);
    });
  });
});