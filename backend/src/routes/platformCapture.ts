import { Router } from 'express';
import { Platform } from '../lib/types';
import { asyncHandler } from '../middleware/errorHandler';
import { PlatformCaptureService } from '../services/platformCaptureService';
import { CaptureService } from '../services/captureService';
import { Server as SocketIOServer } from 'socket.io';

const router = Router();

// Initialize services (in a real app, these would be injected)
const platformCaptureService = new PlatformCaptureService();

// GET /api/platform-capture/supported-platforms
router.get('/supported-platforms', asyncHandler(async (req, res) => {
  const platforms = platformCaptureService.getSupportedPlatforms();
  
  const platformInfo = platforms.map(platform => ({
    platform,
    name: platformCaptureService.getPlatformDisplayName(platform),
    config: platformCaptureService.getPlatformConfig(platform),
  }));

  res.json({ platforms: platformInfo });
}));

// POST /api/platform-capture/detect-platform
router.post('/detect-platform', asyncHandler(async (req, res) => {
  const { meetingUrl } = req.body;

  if (!meetingUrl) {
    return res.status(400).json({ error: 'Meeting URL is required' });
  }

  try {
    const platform = platformCaptureService.detectPlatform(meetingUrl);
    
    if (!platform) {
      return res.status(400).json({ 
        error: 'Unsupported meeting platform',
        meetingUrl 
      });
    }

    const platformInfo = {
      platform,
      name: platformCaptureService.getPlatformDisplayName(platform),
      config: platformCaptureService.getPlatformConfig(platform),
    };

    res.json({ 
      detected: true,
      ...platformInfo 
    });
  } catch (error: any) {
    console.error('Platform detection error:', error);
    res.status(500).json({ 
      error: 'Failed to detect platform',
      details: error.message 
    });
  }
}));

// POST /api/platform-capture/validate-url
router.post('/validate-url', asyncHandler(async (req, res) => {
  const { meetingUrl } = req.body;

  if (!meetingUrl) {
    return res.status(400).json({ error: 'Meeting URL is required' });
  }

  try {
    const validation = platformCaptureService.validateMeetingUrl(meetingUrl);
    
    if (validation.isValid && validation.platform) {
      const meetingInfo = platformCaptureService.parseMeetingUrl(meetingUrl);
      const platformConfig = platformCaptureService.getPlatformConfig(validation.platform);
      
      res.json({
        ...validation,
        meetingInfo,
        platformConfig,
      });
    } else {
      res.status(400).json(validation);
    }
  } catch (error: any) {
    console.error('URL validation error:', error);
    res.status(500).json({ 
      error: 'Failed to validate meeting URL',
      details: error.message 
    });
  }
}));

// POST /api/platform-capture/parse-url
router.post('/parse-url', asyncHandler(async (req, res) => {
  const { meetingUrl } = req.body;

  if (!meetingUrl) {
    return res.status(400).json({ error: 'Meeting URL is required' });
  }

  try {
    const meetingInfo = platformCaptureService.parseMeetingUrl(meetingUrl);
    
    if (!meetingInfo) {
      return res.status(400).json({ 
        error: 'Unable to parse meeting URL',
        meetingUrl 
      });
    }

    res.json({ meetingInfo });
  } catch (error: any) {
    console.error('URL parsing error:', error);
    res.status(500).json({ 
      error: 'Failed to parse meeting URL',
      details: error.message 
    });
  }
}));

// GET /api/platform-capture/platform/:platform/config
router.get('/platform/:platform/config', asyncHandler(async (req, res) => {
  const { platform } = req.params;

  if (!Object.values(Platform).includes(platform as Platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  try {
    const config = platformCaptureService.getPlatformConfig(platform as Platform);
    
    if (!config) {
      return res.status(404).json({ error: 'Platform configuration not found' });
    }

    res.json({ platform, config });
  } catch (error: any) {
    console.error('Platform config error:', error);
    res.status(500).json({ 
      error: 'Failed to get platform configuration',
      details: error.message 
    });
  }
}));

// GET /api/platform-capture/platform/:platform/capture-config
router.get('/platform/:platform/capture-config', asyncHandler(async (req, res) => {
  const { platform } = req.params;
  const customConfig = req.query;

  if (!Object.values(Platform).includes(platform as Platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  try {
    const captureConfig = platformCaptureService.getPlatformCaptureConfig(
      platform as Platform,
      customConfig as any
    );
    
    if (!captureConfig) {
      return res.status(404).json({ error: 'Platform capture configuration not found' });
    }

    const instructions = platformCaptureService.generateCaptureInstructions(platform as Platform);

    res.json({ 
      platform, 
      ...captureConfig,
      instructions 
    });
  } catch (error: any) {
    console.error('Platform capture config error:', error);
    res.status(500).json({ 
      error: 'Failed to get platform capture configuration',
      details: error.message 
    });
  }
}));

// GET /api/platform-capture/platform/:platform/instructions
router.get('/platform/:platform/instructions', asyncHandler(async (req, res) => {
  const { platform } = req.params;

  if (!Object.values(Platform).includes(platform as Platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  try {
    const instructions = platformCaptureService.generateCaptureInstructions(platform as Platform);
    
    res.json({ 
      platform,
      instructions 
    });
  } catch (error: any) {
    console.error('Platform instructions error:', error);
    res.status(500).json({ 
      error: 'Failed to get platform instructions',
      details: error.message 
    });
  }
}));

// POST /api/platform-capture/extract-metadata
router.post('/extract-metadata', asyncHandler(async (req, res) => {
  const { meetingUrl, accessToken, additionalContext } = req.body;

  if (!meetingUrl) {
    return res.status(400).json({ error: 'Meeting URL is required' });
  }

  try {
    const metadata = await platformCaptureService.extractPlatformMetadata(
      meetingUrl,
      accessToken,
      additionalContext
    );
    
    if (!metadata) {
      return res.status(400).json({ 
        error: 'Unable to extract platform metadata',
        meetingUrl 
      });
    }

    res.json({ metadata });
  } catch (error: any) {
    console.error('Metadata extraction error:', error);
    res.status(500).json({ 
      error: 'Failed to extract platform metadata',
      details: error.message 
    });
  }
}));

// GET /api/platform-capture/platform/:platform/features
router.get('/platform/:platform/features', asyncHandler(async (req, res) => {
  const { platform } = req.params;

  if (!Object.values(Platform).includes(platform as Platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  try {
    const config = platformCaptureService.getPlatformConfig(platform as Platform);
    
    if (!config) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    res.json({ 
      platform,
      features: config.supportedFeatures 
    });
  } catch (error: any) {
    console.error('Platform features error:', error);
    res.status(500).json({ 
      error: 'Failed to get platform features',
      details: error.message 
    });
  }
}));

// POST /api/platform-capture/check-feature-support
router.post('/check-feature-support', asyncHandler(async (req, res) => {
  const { platform, feature } = req.body;

  if (!platform || !feature) {
    return res.status(400).json({ error: 'Platform and feature are required' });
  }

  if (!Object.values(Platform).includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  try {
    const isSupported = platformCaptureService.platformSupportsFeature(platform, feature);
    
    res.json({ 
      platform,
      feature,
      supported: isSupported 
    });
  } catch (error: any) {
    console.error('Feature support check error:', error);
    res.status(500).json({ 
      error: 'Failed to check feature support',
      details: error.message 
    });
  }
}));

export { router as platformCaptureRoutes };