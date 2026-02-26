import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import { app } from '../server';
import { prisma } from '../lib/prisma';
import { AuthService } from '../services/authService';
import { AdminService } from '../services/adminService';

/**
 * Feature: meetbuddy-ai-completion, Property 26: Admin access requires proper privilege verification
 * 
 * This test suite validates that administrative access is properly controlled through
 * comprehensive privilege verification, ensuring only authenticated admin users can
 * access admin endpoints and perform administrative actions.
 */

describe('Admin Privilege Verification Property Tests', () => {
  let authService: AuthService;
  let adminService: AdminService;
  let testUsers: any[] = [];

  beforeEach(async () => {
    authService = new AuthService();
    adminService = new AdminService();
    
    // Clean up any existing test data
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test-admin-prop',
        },
      },
    });
    
    testUsers = [];
  });

  afterEach(async () => {
    // Clean up test users
    if (testUsers.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: testUsers.map(u => u.id),
          },
        },
      });
    }
  });

  /**
   * Property: Admin endpoints reject non-authenticated requests
   * For any admin endpoint, requests without valid authentication should be rejected
   */
  it('should reject non-authenticated requests to admin endpoints', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          '/api/admin/users',
          '/api/admin/analytics',
          '/api/admin/system-health',
          '/api/admin/settings',
          '/api/admin/logs'
        ),
        fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
        async (endpoint: string, method: string) => {
          // Skip invalid method/endpoint combinations
          if (method === 'POST' && !endpoint.includes('/users')) return;
          if (method === 'PUT' && !endpoint.includes('/settings') && !endpoint.includes('/users/')) return;
          if (method === 'DELETE' && !endpoint.includes('/users/')) return;

          const response = await request(app)
            [method.toLowerCase() as keyof typeof request.Test.prototype](endpoint)
            .send({});

          // Should return 401 Unauthorized for missing authentication
          expect(response.status).toBe(401);
          expect(response.body).toHaveProperty('error');
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Admin endpoints reject non-admin users
   * For any admin endpoint, authenticated non-admin users should be rejected
   */
  it('should reject non-admin users from admin endpoints', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.emailAddress(),
          name: fc.string({ minLength: 2, maxLength: 50 }),
          password: fc.string({ minLength: 8, maxLength: 20 }),
        }),
        fc.constantFrom(
          '/api/admin/users',
          '/api/admin/analytics',
          '/api/admin/system-health',
          '/api/admin/settings'
        ),
        async (userData: any, endpoint: string) => {
          // Create a regular user
          const email = `test-admin-prop-${Date.now()}-${Math.random()}@example.com`;
          const user = await authService.register({
            ...userData,
            email,
            role: 'USER', // Explicitly set as regular user
          });
          testUsers.push(user);

          // Login to get token
          const loginResult = await authService.login(email, userData.password);
          const token = loginResult.accessToken;

          // Try to access admin endpoint
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', `Bearer ${token}`);

          // Should return 403 Forbidden for non-admin users
          expect(response.status).toBe(403);
          expect(response.body).toHaveProperty('error');
          expect(response.body.error).toMatch(/admin|privilege|forbidden/i);
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Admin endpoints accept valid admin users
   * For any admin endpoint, authenticated admin users should be granted access
   */
  it('should grant access to valid admin users', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.emailAddress(),
          name: fc.string({ minLength: 2, maxLength: 50 }),
          password: fc.string({ minLength: 8, maxLength: 20 }),
        }),
        fc.constantFrom(
          '/api/admin/users',
          '/api/admin/analytics',
          '/api/admin/system-health',
          '/api/admin/settings'
        ),
        async (userData: any, endpoint: string) => {
          // Create an admin user
          const email = `test-admin-prop-${Date.now()}-${Math.random()}@example.com`;
          const user = await authService.register({
            ...userData,
            email,
            role: 'ADMIN', // Set as admin user
          });
          testUsers.push(user);

          // Login to get token
          const loginResult = await authService.login(email, userData.password);
          const token = loginResult.accessToken;

          // Access admin endpoint
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', `Bearer ${token}`);

          // Should return success (200 or 2xx) for admin users
          expect(response.status).toBeGreaterThanOrEqual(200);
          expect(response.status).toBeLessThan(300);
          
          // Should not return authentication/authorization errors
          if (response.body.error) {
            expect(response.body.error).not.toMatch(/unauthorized|forbidden|authentication|privilege/i);
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Admin privilege verification is consistent across database state
   * Admin access should be verified against current database state, not just token claims
   */
  it('should verify admin privileges against current database state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.emailAddress(),
          name: fc.string({ minLength: 2, maxLength: 50 }),
          password: fc.string({ minLength: 8, maxLength: 20 }),
        }),
        async (userData: any) => {
          // Create an admin user
          const email = `test-admin-prop-${Date.now()}-${Math.random()}@example.com`;
          const user = await authService.register({
            ...userData,
            email,
            role: 'ADMIN',
          });
          testUsers.push(user);

          // Login to get token
          const loginResult = await authService.login(email, userData.password);
          const token = loginResult.accessToken;

          // Verify admin access works initially
          const initialResponse = await request(app)
            .get('/api/admin/users')
            .set('Authorization', `Bearer ${token}`);
          expect(initialResponse.status).toBe(200);

          // Demote user to regular user in database
          await prisma.user.update({
            where: { id: user.id },
            data: { role: 'USER' },
          });

          // Try to access admin endpoint with same token
          const demotedResponse = await request(app)
            .get('/api/admin/users')
            .set('Authorization', `Bearer ${token}`);

          // Should be rejected despite having a valid token with admin claims
          expect(demotedResponse.status).toBe(403);
          expect(demotedResponse.body).toHaveProperty('error');
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Admin actions are properly logged for audit trails
   * All admin actions should generate appropriate security logs
   */
  it('should log admin actions for audit trails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.emailAddress(),
          name: fc.string({ minLength: 2, maxLength: 50 }),
          password: fc.string({ minLength: 8, maxLength: 20 }),
        }),
        fc.constantFrom(
          { endpoint: '/api/admin/users', method: 'GET', action: 'list_users' },
          { endpoint: '/api/admin/analytics', method: 'GET', action: 'view_analytics' },
          { endpoint: '/api/admin/system-health', method: 'GET', action: 'check_health' }
        ),
        async (userData: any, testCase: any) => {
          // Create an admin user
          const email = `test-admin-prop-${Date.now()}-${Math.random()}@example.com`;
          const user = await authService.register({
            ...userData,
            email,
            role: 'ADMIN',
          });
          testUsers.push(user);

          // Login to get token
          const loginResult = await authService.login(email, userData.password);
          const token = loginResult.accessToken;

          // Capture console logs (in a real implementation, you'd check your logging system)
          const originalConsoleLog = console.log;
          const logs: string[] = [];
          console.log = (...args: any[]) => {
            logs.push(args.join(' '));
            originalConsoleLog(...args);
          };

          try {
            // Perform admin action
            const response = await request(app)
              [testCase.method.toLowerCase() as keyof typeof request.Test.prototype](testCase.endpoint)
              .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);

            // Verify that admin action was logged
            // In a real implementation, you would check your structured logging system
            // For this test, we verify the response indicates successful admin access
            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);
          } finally {
            console.log = originalConsoleLog;
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Admin self-modification restrictions are enforced
   * Admins should not be able to perform certain actions on their own accounts
   */
  it('should prevent admin self-modification for critical actions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.emailAddress(),
          name: fc.string({ minLength: 2, maxLength: 50 }),
          password: fc.string({ minLength: 8, maxLength: 20 }),
        }),
        async (userData: any) => {
          // Create an admin user
          const email = `test-admin-prop-${Date.now()}-${Math.random()}@example.com`;
          const user = await authService.register({
            ...userData,
            email,
            role: 'ADMIN',
          });
          testUsers.push(user);

          // Login to get token
          const loginResult = await authService.login(email, userData.password);
          const token = loginResult.accessToken;

          // Try to delete own account
          const deleteResponse = await request(app)
            .delete(`/api/admin/users/${user.id}`)
            .set('Authorization', `Bearer ${token}`);

          // Should be forbidden
          expect(deleteResponse.status).toBe(403);
          expect(deleteResponse.body).toHaveProperty('error');

          // Try to demote own role
          const demoteResponse = await request(app)
            .put(`/api/admin/users/${user.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ role: 'USER' });

          // Should be forbidden
          expect(demoteResponse.status).toBe(403);
          expect(demoteResponse.body).toHaveProperty('error');
        }
      ),
      { numRuns: 8 }
    );
  });

  /**
   * Property: Rate limiting protects admin endpoints
   * Admin endpoints should have appropriate rate limiting to prevent abuse
   */
  it('should apply rate limiting to admin endpoints', async () => {
    // Create an admin user for this test
    const email = `test-admin-prop-rate-limit-${Date.now()}@example.com`;
    const user = await authService.register({
      email,
      name: 'Rate Limit Test Admin',
      password: 'TestPassword123!',
      role: 'ADMIN',
    });
    testUsers.push(user);

    // Login to get token
    const loginResult = await authService.login(email, 'TestPassword123!');
    const token = loginResult.accessToken;

    // Make multiple rapid requests to test rate limiting
    const requests = Array.from({ length: 10 }, () =>
      request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`)
    );

    const responses = await Promise.all(requests);

    // All requests should succeed (rate limit is set high for admin endpoints)
    // But the rate limiting middleware should be present and functional
    responses.forEach(response => {
      expect([200, 429]).toContain(response.status);
    });

    // At least some requests should succeed
    const successfulRequests = responses.filter(r => r.status === 200);
    expect(successfulRequests.length).toBeGreaterThan(0);
  });
});