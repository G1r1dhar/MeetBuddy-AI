import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/session';
import { StorageManagementService } from '../services/storageManagementService';
import { logger } from '../utils/logger';
import { validate } from '../utils/validation';
import Joi from 'joi';

const router = Router();
const storageService = new StorageManagementService();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/storage/quota
 * Get user storage quota information
 */
router.get('/quota', asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  const quota = await storageService.getUserStorageQuota(req.user.id);

  res.status(200).json({
    message: 'Storage quota retrieved successfully',
    data: { quota },
  });
}));

/**
 * GET /api/storage/usage
 * Get detailed storage usage breakdown by category
 */
router.get('/usage', asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  const usage = await storageService.getStorageUsageBreakdown(req.user.id);

  res.status(200).json({
    message: 'Storage usage breakdown retrieved successfully',
    data: { usage },
  });
}));

/**
 * POST /api/storage/check-upload
 * Check if user can upload a file of given size
 */
router.post('/check-upload',
  validate(
    Joi.object({
      fileSize: Joi.number().integer().min(1).required(),
    })
  ),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    const { fileSize } = req.body;
    const result = await storageService.canUploadFile(req.user.id, fileSize);

    res.status(200).json({
      message: 'Upload check completed',
      data: result,
    });
  })
);

/**
 * GET /api/storage/suggestions
 * Get cleanup suggestions for user
 */
router.get('/suggestions', asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  const suggestions = await storageService.getCleanupSuggestions(req.user.id);

  res.status(200).json({
    message: 'Cleanup suggestions retrieved successfully',
    data: suggestions,
  });
}));

/**
 * POST /api/storage/cleanup
 * Perform storage cleanup based on options
 */
router.post('/cleanup',
  validate(
    Joi.object({
      categories: Joi.array().items(Joi.string().valid('RECORDING', 'ATTACHMENT', 'EXPORT', 'AVATAR')).optional(),
      olderThanDays: Joi.number().integer().min(1).max(365).default(90),
      maxFilesToDelete: Joi.number().integer().min(1).max(1000).default(100),
      dryRun: Joi.boolean().default(false),
    })
  ),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    const { categories, olderThanDays, maxFilesToDelete, dryRun } = req.body;

    const result = await storageService.performCleanup({
      userId: req.user.id,
      categories,
      olderThanDays,
      maxFilesToDelete,
      dryRun,
    });

    logger.info('Storage cleanup performed', {
      userId: req.user.id,
      dryRun,
      deletedFiles: result.deletedFiles,
      freedSpace: result.freedSpace,
    });

    res.status(200).json({
      message: dryRun ? 'Cleanup simulation completed' : 'Storage cleanup completed',
      data: result,
    });
  })
);

/**
 * POST /api/storage/recalculate
 * Recalculate user storage usage from actual files
 */
router.post('/recalculate', asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  const result = await storageService.recalculateUserStorage(req.user.id);

  logger.info('Storage usage recalculated', {
    userId: req.user.id,
    previousUsage: result.previousUsage,
    currentUsage: result.currentUsage,
    difference: result.difference,
  });

  res.status(200).json({
    message: 'Storage usage recalculated successfully',
    data: result,
  });
}));

/**
 * GET /api/storage/alerts
 * Check storage usage and get current alerts
 */
router.get('/alerts', asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  const alert = await storageService.checkAndSendStorageAlerts(req.user.id);

  res.status(200).json({
    message: 'Storage alerts checked',
    data: { alert },
  });
}));

export { router as storageRoutes };