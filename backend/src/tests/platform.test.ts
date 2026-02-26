import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from '../services/platformService';
import { Platform } from '../lib/types';

describe('Platform Service Unit Tests', () => {
  let platformService: PlatformService;

  beforeEach(() => {
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

  describe('OAuth URL Generation', () => {
    it('should generate valid Google OAuth URL', async () => {
      const userId = 'test-user-id';
      const authUrl = await platformService.generateAuthUrl(Platform.GOOGLE_MEET, userId);
      const url = new URL(authUrl);

      expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe('test-google-client-id');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/platforms/callback/google');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('scope')).toBeTruthy();
    });

    it('should generate valid Microsoft OAuth URL', async () => {
      const userId = 'test-user-id';
      const authUrl = await platformService.generateAuthUrl(Platform.MICROSOFT_TEAMS, userId);
      const url = new URL(authUrl);

      expect(authUrl).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      expect(url.searchParams.get('client_id')).toBe('test-microsoft-client-id');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/platforms/callback/microsoft');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('state')).toBeTruthy();
    });

    it('should generate valid Zoom OAuth URL', async () => {
      const userId = 'test-user-id';
      const authUrl = await platformService.generateAuthUrl(Platform.ZOOM, userId);
      const url = new URL(authUrl);

      expect(authUrl).toContain('https://zoom.us/oauth/authorize');
      expect(url.searchParams.get('client_id')).toBe('test-zoom-client-id');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/platforms/callback/zoom');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('state')).toBeTruthy();
    });

    it('should throw error for unsupported platform', async () => {
      const userId = 'test-user-id';
      
      await expect(
        platformService.generateAuthUrl(Platform.DISCORD, userId)
      ).rejects.toThrow('OAuth configuration not found for platform: DISCORD');
    });

    it('should throw error when OAuth credentials are missing', async () => {
      // Clear environment variables
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      
      // Create new service instance to pick up the changes
      const serviceWithoutCreds = new PlatformService();
      const userId = 'test-user-id';
      
      await expect(
        serviceWithoutCreds.generateAuthUrl(Platform.GOOGLE_MEET, userId)
      ).rejects.toThrow('OAuth credentials not configured for platform: GOOGLE_MEET');
    });
  });

  describe('State Parameter Security', () => {
    it('should generate different state parameters for different users', async () => {
      const userId1 = 'user-1';
      const userId2 = 'user-2';
      
      const authUrl1 = await platformService.generateAuthUrl(Platform.GOOGLE_MEET, userId1);
      const authUrl2 = await platformService.generateAuthUrl(Platform.GOOGLE_MEET, userId2);
      
      const state1 = new URL(authUrl1).searchParams.get('state');
      const state2 = new URL(authUrl2).searchParams.get('state');
      
      expect(state1).not.toBe(state2);
      expect(state1).toBeTruthy();
      expect(state2).toBeTruthy();
    });

    it('should generate different state parameters for same user on different calls', async () => {
      const userId = 'test-user-id';
      
      const authUrl1 = await platformService.generateAuthUrl(Platform.GOOGLE_MEET, userId);
      const authUrl2 = await platformService.generateAuthUrl(Platform.GOOGLE_MEET, userId);
      
      const state1 = new URL(authUrl1).searchParams.get('state');
      const state2 = new URL(authUrl2).searchParams.get('state');
      
      expect(state1).not.toBe(state2);
    });
  });

  describe('Token Encryption/Decryption', () => {
    it('should encrypt and decrypt tokens correctly', () => {
      const originalToken = 'test-access-token-12345';
      
      // Use reflection to access private methods for testing
      const service = platformService as any;
      const encryptedToken = service.encryptToken(originalToken);
      const decryptedToken = service.decryptToken(encryptedToken);
      
      expect(decryptedToken).toBe(originalToken);
      expect(encryptedToken).not.toBe(originalToken);
      expect(encryptedToken).toContain(':'); // Should contain IV separator
    });

    it('should produce different encrypted values for same token', () => {
      const token = 'test-token';
      
      const service = platformService as any;
      const encrypted1 = service.encryptToken(token);
      const encrypted2 = service.encryptToken(token);
      
      expect(encrypted1).not.toBe(encrypted2); // Different due to random IV
      expect(service.decryptToken(encrypted1)).toBe(token);
      expect(service.decryptToken(encrypted2)).toBe(token);
    });

    it('should throw error for invalid encrypted token format', () => {
      const service = platformService as any;
      
      expect(() => {
        service.decryptToken('invalid-format');
      }).toThrow('Invalid encrypted token format');
    });
  });

  describe('OAuth Configuration', () => {
    it('should have correct scopes for Google Meet', async () => {
      const userId = 'test-user-id';
      const authUrl = await platformService.generateAuthUrl(Platform.GOOGLE_MEET, userId);
      const url = new URL(authUrl);
      const scope = url.searchParams.get('scope');
      
      expect(scope).toContain('https://www.googleapis.com/auth/calendar.readonly');
      expect(scope).toContain('https://www.googleapis.com/auth/meetings.space.readonly');
      expect(scope).toContain('openid');
      expect(scope).toContain('email');
      expect(scope).toContain('profile');
    });

    it('should have correct scopes for Microsoft Teams', async () => {
      const userId = 'test-user-id';
      const authUrl = await platformService.generateAuthUrl(Platform.MICROSOFT_TEAMS, userId);
      const url = new URL(authUrl);
      const scope = url.searchParams.get('scope');
      
      expect(scope).toContain('https://graph.microsoft.com/Calendars.Read');
      expect(scope).toContain('https://graph.microsoft.com/OnlineMeetings.Read');
      expect(scope).toContain('openid');
      expect(scope).toContain('email');
      expect(scope).toContain('profile');
    });

    it('should have correct scopes for Zoom', async () => {
      const userId = 'test-user-id';
      const authUrl = await platformService.generateAuthUrl(Platform.ZOOM, userId);
      const url = new URL(authUrl);
      const scope = url.searchParams.get('scope');
      
      expect(scope).toContain('meeting:read');
      expect(scope).toContain('user:read');
      expect(scope).toContain('recording:read');
    });

    it('should include required OAuth parameters', async () => {
      const userId = 'test-user-id';
      const authUrl = await platformService.generateAuthUrl(Platform.GOOGLE_MEET, userId);
      const url = new URL(authUrl);
      
      expect(url.searchParams.get('client_id')).toBe('test-google-client-id');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(url.searchParams.get('prompt')).toBe('consent');
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/platforms/callback/google');
    });
  });
});