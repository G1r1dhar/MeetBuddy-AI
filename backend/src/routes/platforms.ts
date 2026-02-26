import { Router } from 'express';
import { Platform } from '../lib/types';
import { asyncHandler } from '../middleware/errorHandler';
import { PlatformService } from '../services/platformService';

const router = Router();
const platformService = new PlatformService();

// GET /api/platforms
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const integrations = await platformService.getUserIntegrations(userId);
  
  // Don't return sensitive token data in the response
  const safeIntegrations = integrations.map(integration => ({
    id: integration.id,
    platform: integration.platform,
    status: integration.status,
    expiresAt: integration.expiresAt,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  }));

  res.json({ integrations: safeIntegrations });
}));

// POST /api/platforms/connect
router.post('/connect', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { platform } = req.body;
  
  if (!platform || !['GOOGLE_MEET', 'ZOOM', 'MICROSOFT_TEAMS', 'WEBEX', 'DISCORD', 'SKYPE'].includes(platform)) {
    return res.status(400).json({ error: 'Valid platform is required' });
  }

  try {
    const authUrl = await platformService.generateAuthUrl(platform, userId);
    res.json({ authUrl });
  } catch (error: any) {
    console.error('Platform connection error:', error);
    res.status(500).json({ 
      error: 'Failed to generate authorization URL',
      details: error.message 
    });
  }
}));

// GET /api/platforms/callback/:platform
router.get('/callback/:platform', asyncHandler(async (req, res) => {
  const { platform } = req.params;
  const { code, state, error } = req.query;

  if (!['GOOGLE_MEET', 'ZOOM', 'MICROSOFT_TEAMS', 'WEBEX', 'DISCORD', 'SKYPE'].includes(platform as Platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  if (error) {
    return res.status(400).json({ 
      error: 'OAuth authorization failed',
      details: error 
    });
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing authorization code or state' });
  }

  try {
    const integration = await platformService.handleOAuthCallback(
      platform as Platform,
      code as string,
      state as string
    );

    // Redirect to frontend with success
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/dashboard?platform=${platform}&status=connected`);
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    
    // Redirect to frontend with error
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/dashboard?platform=${platform}&status=error&message=${encodeURIComponent(error.message)}`);
  }
}));

// DELETE /api/platforms/:platform
router.delete('/:platform', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { platform } = req.params;
  
  if (!['GOOGLE_MEET', 'ZOOM', 'MICROSOFT_TEAMS', 'WEBEX', 'DISCORD', 'SKYPE'].includes(platform as Platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  try {
    await platformService.disconnectPlatform(userId, platform as Platform);
    res.json({ message: 'Platform disconnected successfully' });
  } catch (error: any) {
    console.error('Platform disconnection error:', error);
    res.status(500).json({ 
      error: 'Failed to disconnect platform',
      details: error.message 
    });
  }
}));

// POST /api/platforms/:platform/refresh
router.post('/:platform/refresh', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { platform } = req.params;
  
  if (!['GOOGLE_MEET', 'ZOOM', 'MICROSOFT_TEAMS', 'WEBEX', 'DISCORD', 'SKYPE'].includes(platform as Platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  try {
    const integration = await platformService.refreshAccessToken(userId, platform as Platform);
    
    // Return safe integration data (no tokens)
    res.json({
      integration: {
        id: integration.id,
        platform: integration.platform,
        status: integration.status,
        expiresAt: integration.expiresAt,
        updatedAt: integration.updatedAt,
      }
    });
  } catch (error: any) {
    console.error('Token refresh error:', error);
    res.status(500).json({ 
      error: 'Failed to refresh access token',
      details: error.message 
    });
  }
}));

export { router as platformRoutes };