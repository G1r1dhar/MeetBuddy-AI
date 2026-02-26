import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../services/authService';
import { validateEmail, validatePassword } from '../utils/validation';

/**
 * Feature: meetbuddy-ai-completion, Property 3: Registration validation enforces security requirements
 * 
 * This test verifies that registration validation enforces email format and password strength
 * requirements according to defined security policies across all registration attempts.
 */

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/meetbuddy_test',
    },
  },
});

// Mock request object
const createMockRequest = (ip: string = '127.0.0.1', userAgent: string = 'test-agent') => ({
  ip,
  get: (header: string) => header === 'User-Agent' ? userAgent : undefined,
});

// Test data generators for valid inputs
const validEmailArbitrary = fc.emailAddress();

const validPasswordArbitrary = fc.string({ minLength: 4, maxLength: 16 }).map(base => {
  // Ensure password meets all requirements
  return `Test${base}123!`;
});

const validNameArbitrary = fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length >= 2);

// Test data generators for invalid inputs
const invalidEmailArbitrary = fc.oneof(
  fc.constant(''), // Empty string
  fc.constant('invalid-email'), // No @ or domain
  fc.constant('test@'), // No domain
  fc.constant('@domain.com'), // No local part
  fc.constant('test..test@domain.com'), // Double dots
  fc.constant('test@domain'), // No TLD
  fc.string().filter(s => !s.includes('@')), // No @ symbol
  fc.string().filter(s => s.includes('@') && !s.includes('.')), // @ but no domain
);

const invalidPasswordArbitrary = fc.oneof(
  fc.constant(''), // Empty
  fc.constant('short'), // Too short
  fc.constant('nouppercase123!'), // No uppercase
  fc.constant('NOLOWERCASE123!'), // No lowercase
  fc.constant('NoNumbers!'), // No numbers
  fc.constant('NoSpecialChar123'), // No special characters
  fc.string({ maxLength: 7 }), // Too short
  fc.string({ minLength: 8 }).filter(s => !/[A-Z]/.test(s)), // No uppercase
  fc.string({ minLength: 8 }).filter(s => !/[a-z]/.test(s)), // No lowercase
  fc.string({ minLength: 8 }).filter(s => !/\d/.test(s)), // No digit
  fc.string({ minLength: 8 }).filter(s => !/[@$!%*?&]/.test(s)), // No special char
);

const invalidNameArbitrary = fc.oneof(
  fc.constant(''), // Empty
  fc.constant(' '), // Only whitespace
  fc.constant('a'), // Too short
  fc.string({ maxLength: 1 }), // Too short
  fc.string({ minLength: 101 }), // Too long
);

describe('Registration Validation Property Tests', () => {
  let authService: AuthService;

  beforeAll(async () => {
    // Set required environment variables for testing
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-registration-testing';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.BCRYPT_ROUNDS = '10'; // Lower rounds for faster testing
    
    authService = new AuthService();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  /**
   * Property: Valid registration data is accepted
   * For any valid email, password, and name combination,
   * registration should succeed and create a user account.
   */
  it('should accept valid registration data', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArbitrary,
        validPasswordArbitrary,
        validNameArbitrary,
        async (email, password, name) => {
          const mockReq = createMockRequest();
          
          // Attempt registration
          const result = await authService.register({
            email,
            password,
            name,
          }, mockReq as any);
          
          // Verify registration succeeded
          if (!result.user || !result.token || !result.sessionId) {
            throw new Error('Valid registration should succeed');
          }
          
          // Verify user data is correct
          if (result.user.email !== email.toLowerCase()) {
            throw new Error('Email should be stored in lowercase');
          }
          
          if (result.user.name !== name.trim()) {
            throw new Error('Name should be trimmed and stored correctly');
          }
          
          // Verify user exists in database
          const dbUser = await prisma.user.findUnique({
            where: { id: result.user.id },
          });
          
          if (!dbUser) {
            throw new Error('User should be created in database');
          }
          
          // Verify email validation function agrees
          if (!validateEmail(email)) {
            throw new Error('Email validation function should accept this email');
          }
          
          // Verify password validation function agrees
          if (!validatePassword(password)) {
            throw new Error('Password validation function should accept this password');
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Invalid emails are consistently rejected
   * For any invalid email format, registration should fail
   * with appropriate validation error messages.
   */
  it('should consistently reject invalid emails', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidEmailArbitrary,
        validPasswordArbitrary,
        validNameArbitrary,
        async (invalidEmail, password, name) => {
          const mockReq = createMockRequest();
          
          // Verify validation function rejects this email
          if (validateEmail(invalidEmail)) {
            // Skip this test case if validation function accepts it
            // (might be a valid email that our generator didn't catch)
            return true;
          }
          
          // Attempt registration with invalid email
          try {
            await authService.register({
              email: invalidEmail,
              password,
              name,
            }, mockReq as any);
            
            throw new Error('Registration should fail with invalid email');
          } catch (error: any) {
            // Verify error is about email validation
            if (!error.message.includes('email') && !error.message.includes('Invalid')) {
              throw new Error('Error should indicate email validation failure');
            }
          }
          
          // Verify no user was created
          const userCount = await prisma.user.count();
          if (userCount > 0) {
            throw new Error('No user should be created with invalid email');
          }
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Invalid passwords are consistently rejected
   * For any password that doesn't meet security requirements,
   * registration should fail with appropriate validation errors.
   */
  it('should consistently reject invalid passwords', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArbitrary,
        invalidPasswordArbitrary,
        validNameArbitrary,
        async (email, invalidPassword, name) => {
          const mockReq = createMockRequest();
          
          // Verify validation function rejects this password
          if (validatePassword(invalidPassword)) {
            // Skip this test case if validation function accepts it
            return true;
          }
          
          // Attempt registration with invalid password
          try {
            await authService.register({
              email,
              password: invalidPassword,
              name,
            }, mockReq as any);
            
            throw new Error('Registration should fail with invalid password');
          } catch (error: any) {
            // Verify error is about password validation
            if (!error.message.includes('Password') && !error.message.includes('password')) {
              throw new Error('Error should indicate password validation failure');
            }
          }
          
          // Verify no user was created
          const userCount = await prisma.user.count();
          if (userCount > 0) {
            throw new Error('No user should be created with invalid password');
          }
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Invalid names are consistently rejected
   * For any name that doesn't meet length requirements,
   * registration should fail with appropriate validation errors.
   */
  it('should consistently reject invalid names', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArbitrary,
        validPasswordArbitrary,
        invalidNameArbitrary,
        async (email, password, invalidName) => {
          const mockReq = createMockRequest();
          
          // Attempt registration with invalid name
          try {
            await authService.register({
              email,
              password,
              name: invalidName,
            }, mockReq as any);
            
            throw new Error('Registration should fail with invalid name');
          } catch (error: any) {
            // Verify error is about name validation
            if (!error.message.includes('Name') && !error.message.includes('name')) {
              throw new Error('Error should indicate name validation failure');
            }
          }
          
          // Verify no user was created
          const userCount = await prisma.user.count();
          if (userCount > 0) {
            throw new Error('No user should be created with invalid name');
          }
          
          return true;
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property: Duplicate email registration is prevented
   * For any email that's already registered, subsequent registration
   * attempts should fail with appropriate conflict errors.
   */
  it('should prevent duplicate email registration', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArbitrary,
        validPasswordArbitrary,
        validPasswordArbitrary,
        validNameArbitrary,
        validNameArbitrary,
        async (email, password1, password2, name1, name2) => {
          const mockReq = createMockRequest();
          
          // First registration should succeed
          const firstResult = await authService.register({
            email,
            password: password1,
            name: name1,
          }, mockReq as any);
          
          if (!firstResult.user) {
            throw new Error('First registration should succeed');
          }
          
          // Second registration with same email should fail
          try {
            await authService.register({
              email,
              password: password2,
              name: name2,
            }, mockReq as any);
            
            throw new Error('Second registration with same email should fail');
          } catch (error: any) {
            // Verify error indicates email conflict
            if (!error.message.includes('exists') && !error.message.includes('already')) {
              throw new Error('Error should indicate email already exists');
            }
          }
          
          // Verify only one user exists
          const userCount = await prisma.user.count({
            where: { email: email.toLowerCase() },
          });
          
          if (userCount !== 1) {
            throw new Error('Only one user should exist with this email');
          }
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Case-insensitive email uniqueness
   * For any email with different case variations,
   * only one registration should be allowed.
   */
  it('should enforce case-insensitive email uniqueness', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArbitrary,
        validPasswordArbitrary,
        validPasswordArbitrary,
        validNameArbitrary,
        validNameArbitrary,
        async (baseEmail, password1, password2, name1, name2) => {
          const mockReq = createMockRequest();
          
          // Create variations of the email with different cases
          const email1 = baseEmail.toLowerCase();
          const email2 = baseEmail.toUpperCase();
          
          // Skip if emails are the same (no case variation possible)
          if (email1 === email2) {
            return true;
          }
          
          // First registration should succeed
          const firstResult = await authService.register({
            email: email1,
            password: password1,
            name: name1,
          }, mockReq as any);
          
          if (!firstResult.user) {
            throw new Error('First registration should succeed');
          }
          
          // Second registration with different case should fail
          try {
            await authService.register({
              email: email2,
              password: password2,
              name: name2,
            }, mockReq as any);
            
            throw new Error('Registration with different case email should fail');
          } catch (error: any) {
            // Verify error indicates email conflict
            if (!error.message.includes('exists') && !error.message.includes('already')) {
              throw new Error('Error should indicate email already exists');
            }
          }
          
          // Verify only one user exists
          const userCount = await prisma.user.count();
          if (userCount !== 1) {
            throw new Error('Only one user should exist regardless of email case');
          }
          
          return true;
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Registration validation is atomic
   * For any registration attempt, either all validation passes
   * and user is created, or validation fails and no user is created.
   */
  it('should ensure atomic registration validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(validEmailArbitrary, invalidEmailArbitrary),
        fc.oneof(validPasswordArbitrary, invalidPasswordArbitrary),
        fc.oneof(validNameArbitrary, invalidNameArbitrary),
        async (email, password, name) => {
          const mockReq = createMockRequest();
          
          const initialUserCount = await prisma.user.count();
          
          try {
            const result = await authService.register({
              email,
              password,
              name,
            }, mockReq as any);
            
            // If registration succeeded, verify user was created
            const finalUserCount = await prisma.user.count();
            if (finalUserCount !== initialUserCount + 1) {
              throw new Error('User count should increase by 1 on successful registration');
            }
            
            // Verify all validation functions agree this should succeed
            if (!validateEmail(email)) {
              throw new Error('Email validation should have failed');
            }
            if (!validatePassword(password)) {
              throw new Error('Password validation should have failed');
            }
            if (!name || name.trim().length < 2) {
              throw new Error('Name validation should have failed');
            }
            
          } catch (error) {
            // If registration failed, verify no user was created
            const finalUserCount = await prisma.user.count();
            if (finalUserCount !== initialUserCount) {
              throw new Error('User count should not change on failed registration');
            }
            
            // At least one validation should have failed
            const emailValid = validateEmail(email);
            const passwordValid = validatePassword(password);
            const nameValid = name && name.trim().length >= 2;
            
            if (emailValid && passwordValid && nameValid) {
              // Check if it's a duplicate email error
              const existingUser = await prisma.user.findUnique({
                where: { email: email.toLowerCase() },
              });
              
              if (!existingUser) {
                throw new Error('Registration failed but all validations should have passed');
              }
            }
          }
          
          return true;
        }
      ),
      { numRuns: 40 }
    );
  });
});

async function cleanDatabase(): Promise<void> {
  // Clean in correct order to respect foreign key constraints
  await prisma.transcriptEntry.deleteMany();
  await prisma.summary.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.platformIntegration.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemLog.deleteMany();
  await prisma.systemSetting.deleteMany();
}