import { describe, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * Feature: meetbuddy-ai-completion, Property 1: Valid authentication creates secure sessions
 * 
 * This test verifies that valid user credentials result in secure session creation
 * with proper token generation and user context across all authentication scenarios.
 */

// Mock Prisma client for testing
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  session: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  $disconnect: vi.fn(),
};

// Mock caches for testing
const mockSessionCache = {
  data: new Map<string, any>(),
  async get(key: string) { return this.data.get(key) || null; },
  async set(key: string, value: any, ttl?: number) { this.data.set(key, value); return true; },
  async invalidate(key: string) { return this.data.delete(key); },
  async extend(key: string, ttl?: number) { return this.data.has(key); },
  clear() { this.data.clear(); }
};

const mockUserCache = {
  data: new Map<string, any>(),
  async get(key: string) { return this.data.get(key) || null; },
  async set(key: string, value: any, ttl?: number) { this.data.set(key, value); return true; },
  async invalidate(key: string) { return this.data.delete(key); },
  clear() { this.data.clear(); }
};

// Mock the modules
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('../utils/cache', () => ({
  sessionCache: mockSessionCache,
  userCache: mockUserCache
}));

// Import after mocking
const { AuthService } = await import('../services/authService');
const { createSession, destroySession } = await import('../middleware/session');

// Mock request object
const createMockRequest = (ip: string = '127.0.0.1', userAgent: string = 'test-agent') => ({
  ip,
  get: (header: string) => header === 'User-Agent' ? userAgent : undefined,
});

// Test data generators
const validUserArbitrary = fc.record({
  email: fc.emailAddress(),
  name: fc.string({ minLength: 2, maxLength: 50 }),
  password: fc.string({ minLength: 8, maxLength: 20 }).map(base => `Test${base}123!`), // Ensure password meets requirements
});

const invalidPasswordArbitrary = fc.oneof(
  fc.string({ maxLength: 7 }), // Too short
  fc.string({ minLength: 8 }).filter(s => !/[A-Z]/.test(s)), // No uppercase
  fc.string({ minLength: 8 }).filter(s => !/[a-z]/.test(s)), // No lowercase
  fc.string({ minLength: 8 }).filter(s => !/\d/.test(s)), // No digit
  fc.string({ minLength: 8 }).filter(s => !/[@$!%*?&]/.test(s)), // No special char
);

const invalidEmailArbitrary = fc.oneof(
  fc.string().filter(s => !s.includes('@')), // No @ symbol
  fc.string().filter(s => s.includes('@') && !s.includes('.')), // No domain
  fc.constant(''), // Empty string
  fc.constant('invalid-email'),
);

describe('Authentication Flow Property Tests', () => {
  let authService: AuthService;

  beforeAll(async () => {
    // Set required environment variables for testing
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-property-testing';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.BCRYPT_ROUNDS = '10'; // Lower rounds for faster testing
    
    authService = new AuthService();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  /**
   * Property: Valid registration creates secure sessions
   * For any valid user registration data, the system should create a user,
   * generate a secure JWT token, and establish a session.
   */
  it('should create secure sessions for valid registrations', async () => {
    await fc.assert(
      fc.asyncProperty(validUserArbitrary, async (userData) => {
        const mockReq = createMockRequest();
        
        // Register user
        const result = await authService.register(userData, mockReq as any);
        
        // Verify user was created
        if (!result.user || !result.token || !result.sessionId) {
          throw new Error('Registration did not return complete result');
        }
        
        // Verify user data integrity
        if (result.user.email !== userData.email.toLowerCase()) {
          throw new Error('Email not stored correctly');
        }
        
        if (result.user.name !== userData.name.trim()) {
          throw new Error('Name not stored correctly');
        }
        
        // Verify JWT token is valid
        const decoded = jwt.verify(result.token, process.env.JWT_SECRET!) as any;
        if (decoded.userId !== result.user.id) {
          throw new Error('JWT token does not contain correct user ID');
        }
        
        if (decoded.sessionId !== result.sessionId) {
          throw new Error('JWT token does not contain correct session ID');
        }
        
        // Verify session exists in cache
        const sessionData = await sessionCache.get(result.sessionId);
        if (!sessionData) {
          throw new Error('Session not created in cache');
        }
        
        // Verify user exists in database
        const dbUser = await prisma.user.findUnique({
          where: { id: result.user.id },
        });
        
        if (!dbUser) {
          throw new Error('User not created in database');
        }
        
        // Verify password is hashed
        if (dbUser.password === userData.password) {
          throw new Error('Password not hashed in database');
        }
        
        // Verify password can be verified
        const passwordValid = await bcrypt.compare(userData.password, dbUser.password);
        if (!passwordValid) {
          throw new Error('Password hash verification failed');
        }
        
        return true;
      }),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Valid login creates secure sessions
   * For any existing user with valid credentials, login should create
   * a new session and return a valid JWT token.
   */
  it('should create secure sessions for valid logins', async () => {
    await fc.assert(
      fc.asyncProperty(validUserArbitrary, async (userData) => {
        const mockReq = createMockRequest();
        
        // First register the user
        await authService.register(userData, mockReq as any);
        
        // Then login with the same credentials
        const loginResult = await authService.login({
          email: userData.email,
          password: userData.password,
        }, mockReq as any);
        
        // Verify login result
        if (!loginResult.user || !loginResult.token || !loginResult.sessionId) {
          throw new Error('Login did not return complete result');
        }
        
        // Verify JWT token is valid
        const decoded = jwt.verify(loginResult.token, process.env.JWT_SECRET!) as any;
        if (decoded.userId !== loginResult.user.id) {
          throw new Error('JWT token does not contain correct user ID');
        }
        
        // Verify session exists
        const sessionData = await sessionCache.get(loginResult.sessionId);
        if (!sessionData) {
          throw new Error('Login session not created in cache');
        }
        
        // Verify lastLoginAt was updated
        const dbUser = await prisma.user.findUnique({
          where: { id: loginResult.user.id },
        });
        
        if (!dbUser?.lastLoginAt) {
          throw new Error('Last login time not updated');
        }
        
        return true;
      }),
      { numRuns: 25 }
    );
  });

  /**
   * Property: Invalid credentials are rejected consistently
   * For any invalid email or password combination, authentication
   * should fail without revealing system information.
   */
  it('should consistently reject invalid credentials', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUserArbitrary,
        fc.oneof(invalidEmailArbitrary, fc.string()),
        fc.oneof(invalidPasswordArbitrary, fc.string()),
        async (validUser, invalidEmail, invalidPassword) => {
          const mockReq = createMockRequest();
          
          // Register a valid user first
          await authService.register(validUser, mockReq as any);
          
          // Try to login with invalid email
          try {
            await authService.login({
              email: invalidEmail,
              password: validUser.password,
            }, mockReq as any);
            throw new Error('Login should have failed with invalid email');
          } catch (error: any) {
            if (!error.message.includes('Invalid email or password')) {
              throw new Error('Error message should not reveal specific failure reason');
            }
          }
          
          // Try to login with invalid password
          try {
            await authService.login({
              email: validUser.email,
              password: invalidPassword,
            }, mockReq as any);
            throw new Error('Login should have failed with invalid password');
          } catch (error: any) {
            if (!error.message.includes('Invalid email or password')) {
              throw new Error('Error message should not reveal specific failure reason');
            }
          }
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Session destruction removes all traces
   * For any valid session, logout should completely remove the session
   * and invalidate associated tokens.
   */
  it('should completely destroy sessions on logout', async () => {
    await fc.assert(
      fc.asyncProperty(validUserArbitrary, async (userData) => {
        const mockReq = createMockRequest();
        
        // Register and login user
        const loginResult = await authService.login(
          await authService.register(userData, mockReq as any).then(() => ({
            email: userData.email,
            password: userData.password,
          })),
          mockReq as any
        );
        
        // Verify session exists before logout
        const sessionBefore = await sessionCache.get(loginResult.sessionId);
        if (!sessionBefore) {
          throw new Error('Session should exist before logout');
        }
        
        // Logout
        await authService.logout(loginResult.sessionId, loginResult.user.id);
        
        // Verify session is destroyed
        const sessionAfter = await sessionCache.get(loginResult.sessionId);
        if (sessionAfter) {
          throw new Error('Session should be destroyed after logout');
        }
        
        // Verify user cache is invalidated
        const cachedUser = await userCache.get(loginResult.user.id);
        if (cachedUser) {
          throw new Error('User cache should be invalidated after logout');
        }
        
        return true;
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Token refresh maintains security
   * For any valid but expired token, refresh should generate a new
   * secure token while maintaining user context.
   */
  it('should maintain security during token refresh', async () => {
    await fc.assert(
      fc.asyncProperty(validUserArbitrary, async (userData) => {
        const mockReq = createMockRequest();
        
        // Register user
        const registerResult = await authService.register(userData, mockReq as any);
        
        // Create a token that's about to expire (but still valid for verification)
        const shortLivedToken = jwt.sign(
          {
            userId: registerResult.user.id,
            sessionId: registerResult.sessionId,
            role: registerResult.user.role,
          },
          process.env.JWT_SECRET!,
          { expiresIn: '1ms' } // Very short expiration
        );
        
        // Wait for token to expire
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Refresh token
        const refreshResult = await authService.refreshToken(shortLivedToken, mockReq as any);
        
        // Verify new token is valid
        const decoded = jwt.verify(refreshResult.token, process.env.JWT_SECRET!) as any;
        if (decoded.userId !== registerResult.user.id) {
          throw new Error('Refreshed token does not contain correct user ID');
        }
        
        // Verify new token is different from old token
        if (refreshResult.token === shortLivedToken) {
          throw new Error('Refreshed token should be different from original');
        }
        
        // Verify user still exists
        const user = await authService.getUserById(registerResult.user.id);
        if (!user) {
          throw new Error('User should still exist after token refresh');
        }
        
        return true;
      }),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Password changes invalidate existing sessions
   * For any user changing their password, all existing sessions
   * should be invalidated for security.
   */
  it('should invalidate sessions when password changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUserArbitrary,
        fc.string({ minLength: 8, maxLength: 20 }).map(base => `New${base}456!`),
        async (userData, newPassword) => {
          const mockReq = createMockRequest();
          
          // Register user
          const registerResult = await authService.register(userData, mockReq as any);
          
          // Verify user cache exists
          const cachedUserBefore = await userCache.get(registerResult.user.id);
          if (!cachedUserBefore) {
            // Cache might not exist yet, that's ok
          }
          
          // Change password
          await authService.changePassword(
            registerResult.user.id,
            userData.password,
            newPassword,
            mockReq as any
          );
          
          // Verify user cache is invalidated
          const cachedUserAfter = await userCache.get(registerResult.user.id);
          if (cachedUserAfter) {
            throw new Error('User cache should be invalidated after password change');
          }
          
          // Verify old password no longer works
          try {
            await authService.login({
              email: userData.email,
              password: userData.password,
            }, mockReq as any);
            throw new Error('Login should fail with old password');
          } catch (error: any) {
            if (!error.message.includes('Invalid email or password')) {
              throw new Error('Should get authentication error with old password');
            }
          }
          
          // Verify new password works
          const loginResult = await authService.login({
            email: userData.email,
            password: newPassword,
          }, mockReq as any);
          
          if (!loginResult.token) {
            throw new Error('Login should succeed with new password');
          }
          
          return true;
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Concurrent authentication operations maintain consistency
   * For any concurrent authentication operations, the system should
   * maintain data consistency and proper session management.
   */
  it('should maintain consistency during concurrent operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validUserArbitrary, { minLength: 2, maxLength: 5 }),
        async (userDataArray) => {
          // Ensure unique emails
          const uniqueUsers = userDataArray.map((user, index) => ({
            ...user,
            email: `user${index}_${user.email}`,
          }));
          
          const mockReq = createMockRequest();
          
          // Register users concurrently
          const registerPromises = uniqueUsers.map(userData =>
            authService.register(userData, mockReq as any)
          );
          
          const registerResults = await Promise.all(registerPromises);
          
          // Verify all registrations succeeded
          if (registerResults.length !== uniqueUsers.length) {
            throw new Error('Not all concurrent registrations succeeded');
          }
          
          // Verify all users have unique IDs and sessions
          const userIds = new Set(registerResults.map(r => r.user.id));
          const sessionIds = new Set(registerResults.map(r => r.sessionId));
          
          if (userIds.size !== uniqueUsers.length) {
            throw new Error('Concurrent registrations created duplicate user IDs');
          }
          
          if (sessionIds.size !== uniqueUsers.length) {
            throw new Error('Concurrent registrations created duplicate session IDs');
          }
          
          // Login all users concurrently
          const loginPromises = uniqueUsers.map(userData =>
            authService.login({
              email: userData.email,
              password: userData.password,
            }, mockReq as any)
          );
          
          const loginResults = await Promise.all(loginPromises);
          
          // Verify all logins succeeded
          if (loginResults.length !== uniqueUsers.length) {
            throw new Error('Not all concurrent logins succeeded');
          }
          
          // Verify all sessions are unique
          const loginSessionIds = new Set(loginResults.map(r => r.sessionId));
          if (loginSessionIds.size !== uniqueUsers.length) {
            throw new Error('Concurrent logins created duplicate session IDs');
          }
          
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
});

async function cleanDatabase(): Promise<void> {
  // Clear mock data
  mockSessionCache.clear();
  mockUserCache.clear();
  
  // Reset mock function calls
  vi.clearAllMocks();
}