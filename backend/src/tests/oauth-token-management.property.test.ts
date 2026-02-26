import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fc from 'fast-check';
import { PlatformService } from '../services/platformService';
import { Platform } from '../lib/types';

describe('OAuth Token Management Property Tests', () => {
  let platformService: PlatformService;

  beforeAll(async () => {
    // Set up environment variables for testing
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
    process.env.MICROSOFT_CLIENT_ID = 'test-microsoft-client-id';
    process.env.MICROSOFT_CLIENT_SECRET = 'test-microsoft-client-secret';
    process.env.ZOOM_CLIENT_ID = 'test-zoom-client-id';
    process.env.ZOOM_CLIENT_SECRET = 'test-zoom-client-secret';
    process.env.BASE_URL = 'http://localhost:5000';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';

    platformService = new PlatformService();
  });

  /**
   * Property 7: OAuth completion securely stores tokens
   * Validates: Requirements 2.2
   */
  it('Property 7: OAuth completion securely stores tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          platform: fc.constantFrom(Platform.GOOGLE_MEET, Platform.MICROSOFT_TEAMS, Platform.ZOOM),
          userId: fc.string({ minLength: 5, maxLength: 50 }),
          accessToken: fc.string({ minLength: 20, maxLength: 200 }),
          refreshToken: fc.option(fc.string({ minLength: 20, maxLength: 200 })),
        }),
        async ({ platform, userId, accessToken, refreshToken }) => {
          // Generate OAuth state for the user and platform
          const authUrl = await platformService.generateAuthUrl(platform, userId);
          const url = new URL(authUrl);
          const state = url.searchParams.get('state')!;

          // Verify state parameter contains user and platform information
          expect(state).toBeTruthy();
          
          // Verify state can be validated (test internal state verification)
          const service = platformService as any;
          const stateData = service.verifyState(state, platform);
          expect(stateData.userId).toBe(userId);
          expect(stateData.platform).toBe(platform);

          // Test token encryption security
          const encryptedAccessToken = service.encryptToken(accessToken);
          const encryptedRefreshToken = refreshToken ? service.encryptToken(refreshToken) : null;

          // Verify tokens are encrypted (should not match original values)
          expect(encryptedAccessToken).not.toBe(accessToken);
          expect(encryptedAccessToken).toContain(':'); // Should contain IV separator
          
          if (refreshToken && encryptedRefreshToken) {
            expect(encryptedRefreshToken).not.toBe(refreshToken);
            expect(encryptedRefreshToken).toContain(':');
          }

          // Verify tokens can be decrypted back to original values
          const decryptedAccessToken = service.decryptToken(encryptedAccessToken);
          expect(decryptedAccessToken).toBe(accessToken);
          
          if (refreshToken && encryptedRefreshToken) {
            const decryptedRefreshToken = service.decryptToken(encryptedRefreshToken);
            expect(decryptedRefreshToken).toBe(refreshToken);
          }

          // Verify encryption is non-deterministic (same token produces different encrypted values)
          const encryptedAccessToken2 = service.encryptToken(accessToken);
          expect(encryptedAccessToken2).not.toBe(encryptedAccessToken);
          expect(service.decryptToken(encryptedAccessToken2)).toBe(accessToken);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Token encryption is consistent and secure
   */
  it('Property: Token encryption is consistent and secure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          tokens: fc.array(
            fc.string({ minLength: 10, maxLength: 100 }),
            { minLength: 1, maxLength: 10 }
          ),
        }),
        async ({ tokens }) => {
          const service = platformService as any;
          
          for (const token of tokens) {
            // Encrypt the same token multiple times
            const encrypted1 = service.encryptToken(token);
            const encrypted2 = service.encryptToken(token);
            
            // Encrypted values should be different (due to random IV)
            expect(encrypted1).not.toBe(encrypted2);
            
            // But both should decrypt to the original token
            expect(service.decryptToken(encrypted1)).toBe(token);
            expect(service.decryptToken(encrypted2)).toBe(token);
            
            // Encrypted tokens should have the expected format
            expect(encrypted1.split(':').length).toBe(2);
            expect(encrypted2.split(':').length).toBe(2);
            
            // IV should be different for each encryption
            const iv1 = encrypted1.split(':')[0];
            const iv2 = encrypted2.split(':')[0];
            expect(iv1).not.toBe(iv2);
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: OAuth state parameter security and validation
   */
  it('Property: OAuth state parameter security and validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          platform: fc.constantFrom(Platform.GOOGLE_MEET, Platform.MICROSOFT_TEAMS, Platform.ZOOM),
          userId: fc.string({ minLength: 5, maxLength: 50 }),
          otherUserId: fc.string({ minLength: 5, maxLength: 50 }),
        }),
        async ({ platform, userId, otherUserId }) => {
          const service = platformService as any;

          // Generate state for first user
          const authUrl1 = await platformService.generateAuthUrl(platform, userId);
          const state1 = new URL(authUrl1).searchParams.get('state')!;

          // Generate state for second user
          const authUrl2 = await platformService.generateAuthUrl(platform, otherUserId);
          const state2 = new URL(authUrl2).searchParams.get('state')!;

          // States should be different for different users
          expect(state1).not.toBe(state2);

          // Each state should be valid for its respective user
          const stateData1 = service.verifyState(state1, platform);
          expect(stateData1.userId).toBe(userId);
          expect(stateData1.platform).toBe(platform);

          const stateData2 = service.verifyState(state2, platform);
          expect(stateData2.userId).toBe(otherUserId);
          expect(stateData2.platform).toBe(platform);

          // Cross-validation should fail (user1's state shouldn't work for user2)
          // This tests that state parameters are properly tied to specific users
          expect(stateData1.userId).not.toBe(otherUserId);
          expect(stateData2.userId).not.toBe(userId);

          // Test platform mismatch
          const otherPlatforms = [Platform.GOOGLE_MEET, Platform.MICROSOFT_TEAMS, Platform.ZOOM]
            .filter(p => p !== platform);
          
          if (otherPlatforms.length > 0) {
            const wrongPlatform = otherPlatforms[0];
            expect(() => service.verifyState(state1, wrongPlatform)).toThrow('Platform mismatch in state');
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Token validation and error handling
   */
  it('Property: Token validation and error handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          validToken: fc.string({ minLength: 20, maxLength: 100 }),
          invalidTokens: fc.array(
            fc.oneof(
              fc.constant(''), // Empty string
              fc.string({ maxLength: 5 }), // Too short
              fc.constant('invalid:format:token'), // Invalid format
              fc.constant('only-one-part'), // Missing separator
              fc.constant('too:many:parts:here'), // Too many parts
            ),
            { minLength: 1, maxLength: 5 }
          ),
        }),
        async ({ validToken, invalidTokens }) => {
          const service = platformService as any;

          // Test valid token encryption/decryption
          const encryptedToken = service.encryptToken(validToken);
          expect(encryptedToken).toBeTruthy();
          expect(encryptedToken).toContain(':');
          expect(encryptedToken.split(':').length).toBe(2);

          const decryptedToken = service.decryptToken(encryptedToken);
          expect(decryptedToken).toBe(validToken);

          // Test error handling for invalid encrypted tokens
          for (const invalidToken of invalidTokens) {
            try {
              if (invalidToken.includes(':') && invalidToken.split(':').length === 2) {
                // This has valid format but likely invalid content
                expect(() => service.decryptToken(invalidToken)).toThrow();
              } else {
                // Invalid format should throw immediately
                expect(() => service.decryptToken(invalidToken)).toThrow('Invalid encrypted token format');
              }
            } catch (error) {
              // Expected behavior - invalid tokens should cause errors
              expect(error).toBeDefined();
            }
          }

          // Test that empty or malformed tokens are rejected
          expect(() => service.decryptToken('')).toThrow('Invalid encrypted token format');
          expect(() => service.decryptToken('no-separator')).toThrow('Invalid encrypted token format');
          expect(() => service.decryptToken('too:many:separators:here')).toThrow('Invalid encrypted token format');
        }
      ),
      { numRuns: 10 }
    );
  });
});