import { PrismaClient } from '@prisma/client';
import { Platform, IntegrationStatus } from '../lib/types';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';



// OAuth configuration for different platforms
interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
  authUrl: string;
  tokenUrl: string;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}

interface PlatformIntegrationData {
  id: string;
  userId: string;
  platform: Platform;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  status: IntegrationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class PlatformService {
  private readonly encryptionKey: string;
  private readonly oauthConfigs: Map<Platform, OAuthConfig>;

  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
    this.oauthConfigs = new Map();
    this.initializeOAuthConfigs();
  }

  private initializeOAuthConfigs(): void {
    // Google Meet OAuth configuration
    this.oauthConfigs.set(Platform.GOOGLE_MEET, {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL}/api/platforms/callback/google`,
      scope: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/meetings.space.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/chat.spaces',
        'openid',
        'email',
        'profile'
      ],
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    });

    // Microsoft Teams OAuth configuration
    this.oauthConfigs.set(Platform.MICROSOFT_TEAMS, {
      clientId: process.env.MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      redirectUri: process.env.MICROSOFT_REDIRECT_URI || `${process.env.BASE_URL}/api/platforms/callback/microsoft`,
      scope: [
        'https://graph.microsoft.com/Calendars.Read',
        'https://graph.microsoft.com/OnlineMeetings.Read',
        'openid',
        'email',
        'profile'
      ],
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    });

    // Zoom OAuth configuration
    this.oauthConfigs.set(Platform.ZOOM, {
      clientId: process.env.ZOOM_CLIENT_ID || '',
      clientSecret: process.env.ZOOM_CLIENT_SECRET || '',
      redirectUri: process.env.ZOOM_REDIRECT_URI || `${process.env.BASE_URL}/api/platforms/callback/zoom`,
      scope: [
        'meeting:read',
        'user:read',
        'recording:read'
      ],
      authUrl: 'https://zoom.us/oauth/authorize',
      tokenUrl: 'https://zoom.us/oauth/token',
    });
  }

  /**
   * Generate OAuth authorization URL for platform connection
   */
  async generateAuthUrl(platform: Platform, userId: string): Promise<string> {
    const config = this.oauthConfigs.get(platform);
    if (!config) {
      throw new Error(`OAuth configuration not found for platform: ${platform}`);
    }

    if (!config.clientId || !config.clientSecret) {
      throw new Error(`OAuth credentials not configured for platform: ${platform}`);
    }

    // Generate state parameter for security
    const state = this.generateSecureState(userId, platform);

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scope.join(' '),
      response_type: 'code',
      state: state,
      access_type: 'offline', // For refresh tokens
      prompt: 'consent', // Force consent to get refresh token
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleOAuthCallback(
    platform: Platform,
    code: string,
    state: string
  ): Promise<PlatformIntegrationData> {
    const config = this.oauthConfigs.get(platform);
    if (!config) {
      throw new Error(`OAuth configuration not found for platform: ${platform}`);
    }

    // Verify state parameter
    const { userId } = this.verifyState(state, platform);

    // Exchange authorization code for tokens
    const tokenResponse = await this.exchangeCodeForTokens(config, code);

    // Calculate expiration time
    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000)
      : undefined;

    // Encrypt tokens before storing
    const encryptedAccessToken = this.encryptToken(tokenResponse.access_token);
    const encryptedRefreshToken = tokenResponse.refresh_token
      ? this.encryptToken(tokenResponse.refresh_token)
      : undefined;

    // Store or update platform integration
    const integration = await prisma.platformIntegration.upsert({
      where: {
        userId_platform: {
          userId,
          platform,
        },
      },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        status: IntegrationStatus.CONNECTED,
        updatedAt: new Date(),
      },
      create: {
        userId,
        platform,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        status: IntegrationStatus.CONNECTED,
      },
    });

    return {
      ...integration,
      platform: integration.platform as Platform,
      status: integration.status as IntegrationStatus,
      accessToken: tokenResponse.access_token, // Return decrypted for immediate use
      refreshToken: tokenResponse.refresh_token,
      expiresAt: integration.expiresAt ?? undefined,
    };
  }

  /**
   * Get user's platform integrations
   */
  async getUserIntegrations(userId: string): Promise<PlatformIntegrationData[]> {
    const integrations = await prisma.platformIntegration.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return integrations.map(integration => ({
      ...integration,
      platform: integration.platform as Platform,
      status: integration.status as IntegrationStatus,
      accessToken: this.decryptToken(integration.accessToken),
      refreshToken: integration.refreshToken ? this.decryptToken(integration.refreshToken) : undefined,
      expiresAt: integration.expiresAt ?? undefined,
    }));
  }

  /**
   * Get specific platform integration
   */
  async getPlatformIntegration(userId: string, platform: Platform): Promise<PlatformIntegrationData | null> {
    const integration = await prisma.platformIntegration.findUnique({
      where: {
        userId_platform: {
          userId,
          platform,
        },
      },
    });

    if (!integration) {
      return null;
    }

    return {
      ...integration,
      platform: integration.platform as Platform,
      status: integration.status as IntegrationStatus,
      accessToken: this.decryptToken(integration.accessToken),
      refreshToken: integration.refreshToken ? this.decryptToken(integration.refreshToken) : undefined,
      expiresAt: integration.expiresAt ?? undefined,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(userId: string, platform: Platform): Promise<PlatformIntegrationData> {
    const integration = await this.getPlatformIntegration(userId, platform);
    if (!integration || !integration.refreshToken) {
      throw new Error('No refresh token available for platform integration');
    }

    const config = this.oauthConfigs.get(platform);
    if (!config) {
      throw new Error(`OAuth configuration not found for platform: ${platform}`);
    }

    try {
      // Request new access token
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: integration.refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const tokenResponse = await response.json() as OAuthTokenResponse;

      // Calculate new expiration time
      const expiresAt = tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : undefined;

      // Encrypt new tokens
      const encryptedAccessToken = this.encryptToken(tokenResponse.access_token);
      const encryptedRefreshToken = tokenResponse.refresh_token
        ? this.encryptToken(tokenResponse.refresh_token)
        : integration.refreshToken; // Keep existing if not provided

      // Update integration
      const updatedIntegration = await prisma.platformIntegration.update({
        where: {
          userId_platform: {
            userId,
            platform,
          },
        },
        data: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt,
          status: IntegrationStatus.CONNECTED,
          updatedAt: new Date(),
        },
      });

      return {
        ...updatedIntegration,
        platform: updatedIntegration.platform as Platform,
        status: updatedIntegration.status as IntegrationStatus,
        expiresAt: updatedIntegration.expiresAt ?? undefined,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || integration.refreshToken,
      };
    } catch (error: any) {
      // Mark integration as error state
      await prisma.platformIntegration.update({
        where: {
          userId_platform: {
            userId,
            platform,
          },
        },
        data: {
          status: IntegrationStatus.ERROR,
          updatedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Disconnect platform integration
   */
  async disconnectPlatform(userId: string, platform: Platform): Promise<void> {
    const integration = await this.getPlatformIntegration(userId, platform);
    if (!integration) {
      throw new Error('Platform integration not found');
    }

    // Revoke tokens with the platform (best effort)
    try {
      await this.revokeTokens(platform, integration.accessToken);
    } catch (error: any) {
      console.warn(`Failed to revoke tokens for ${platform}:`, error);
    }

    // Delete integration from database
    await prisma.platformIntegration.delete({
      where: {
        userId_platform: {
          userId,
          platform,
        },
      },
    });
  }

  /**
   * Check if access token needs refresh and refresh if necessary
   */
  async ensureValidToken(userId: string, platform: Platform): Promise<string> {
    const integration = await this.getPlatformIntegration(userId, platform);
    if (!integration) {
      throw new Error('Platform integration not found');
    }

    // Check if token is expired or will expire soon (5 minutes buffer)
    const now = new Date();
    const expirationBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (integration.expiresAt && integration.expiresAt.getTime() - now.getTime() < expirationBuffer) {
      // Token is expired or will expire soon, refresh it
      const refreshedIntegration = await this.refreshAccessToken(userId, platform);
      return refreshedIntegration.accessToken;
    }

    return integration.accessToken;
  }

  // Private helper methods

  private generateSecureState(userId: string, platform: Platform): string {
    const data = JSON.stringify({
      userId,
      platform,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
    });

    const hmac = crypto.createHmac('sha256', this.encryptionKey);
    hmac.update(data);
    const signature = hmac.digest('hex');

    return Buffer.from(JSON.stringify({ data, signature })).toString('base64url');
  }

  private verifyState(state: string, expectedPlatform: Platform): { userId: string; platform: Platform } {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      const { data, signature } = decoded;

      // Verify signature
      const hmac = crypto.createHmac('sha256', this.encryptionKey);
      hmac.update(data);
      const expectedSignature = hmac.digest('hex');

      if (signature !== expectedSignature) {
        throw new Error('Invalid state signature');
      }

      const stateData = JSON.parse(data);

      // Verify platform matches
      if (stateData.platform !== expectedPlatform) {
        throw new Error('Platform mismatch in state');
      }

      // Verify timestamp (state should not be older than 10 minutes)
      const maxAge = 10 * 60 * 1000; // 10 minutes
      if (Date.now() - stateData.timestamp > maxAge) {
        throw new Error('State has expired');
      }

      return {
        userId: stateData.userId,
        platform: stateData.platform,
      };
    } catch (error: any) {
      throw new Error(`Invalid state parameter: ${error.message}`);
    }
  }

  private async exchangeCodeForTokens(config: OAuthConfig, code: string): Promise<OAuthTokenResponse> {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.statusText} - ${errorText}`);
    }

    const tokenResponse = await response.json() as OAuthTokenResponse;
    return tokenResponse;
  }

  private async revokeTokens(platform: Platform, accessToken: string): Promise<void> {
    const config = this.oauthConfigs.get(platform);
    if (!config) return;

    let revokeUrl: string;

    switch (platform) {
      case Platform.GOOGLE_MEET:
        revokeUrl = `https://oauth2.googleapis.com/revoke?token=${accessToken}`;
        break;
      case Platform.MICROSOFT_TEAMS:
        // Microsoft doesn't have a simple revoke endpoint, tokens expire naturally
        return;
      case Platform.ZOOM:
        revokeUrl = `https://zoom.us/oauth/revoke?token=${accessToken}`;
        break;
      default:
        return;
    }

    try {
      await fetch(revokeUrl, { method: 'POST' });
    } catch (error: any) {
      // Ignore revocation errors as they're not critical
      console.warn(`Token revocation failed for ${platform}:`, error);
    }
  }

  private encryptToken(token: string): string {
    const algorithm = 'aes-256-cbc';
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  private decryptToken(encryptedToken: string): string {
    const parts = encryptedToken.split(':');

    if (parts.length !== 2) {
      throw new Error('Invalid encrypted token format');
    }

    const iv = Buffer.from(parts[0] || '', 'hex');
    const encrypted = parts[1] || '';

    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}