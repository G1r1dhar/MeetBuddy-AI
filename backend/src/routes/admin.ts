import { Router } from 'express';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { 
  verifyAdminPrivileges, 
  logAdminAction, 
  adminRateLimit,
  validateAdminAction 
} from '../middleware/adminAuth';
import { AdminService } from '../services/adminService';
import { logger } from '../utils/logger';

const router = Router();
const adminService = new AdminService();

// Apply authentication and admin authorization to all routes
router.use(authenticateToken);
router.use(verifyAdminPrivileges);
router.use(adminRateLimit);

// GET /api/admin/users - Get all users with pagination and filtering
router.get('/users', logAdminAction('list_users'), asyncHandler(async (req, res) => {
  const {
    page = '1',
    limit = '20',
    search,
    role,
    subscription
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
    throw new ValidationError('Invalid pagination parameters');
  }

  const result = await adminService.getUsers(
    pageNum,
    limitNum,
    search as string,
    role as string,
    subscription as string
  );

  logger.info('Admin retrieved users list', {
    adminUserId: req.user!.userId,
    page: pageNum,
    limit: limitNum,
    totalUsers: result.pagination.total,
  });

  res.json(result);
}));

// POST /api/admin/users - Create a new user
router.post('/users', logAdminAction('create_user'), asyncHandler(async (req, res) => {
  const {
    email,
    name,
    password,
    role = 'USER',
    subscription = 'FREE',
    sendInvitation = true
  } = req.body;

  if (!email || !name) {
    throw new ValidationError('Email and name are required');
  }

  const newUser = await adminService.createUser(req.user!.userId, {
    email,
    name,
    password,
    role,
    subscription,
    sendInvitation,
  });

  logger.info('Admin created new user', {
    adminUserId: req.user!.userId,
    newUserId: newUser.id,
    newUserEmail: newUser.email,
  });

  res.status(201).json(newUser);
}));

// PUT /api/admin/users/:id - Update user
router.put('/users/:id', validateAdminAction, logAdminAction('update_user'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, role, subscription, isActive } = req.body;

  if (!id) {
    throw new ValidationError('User ID is required');
  }

  const updatedUser = await adminService.updateUser(req.user!.userId, id, {
    name,
    email,
    role,
    subscription,
    isActive,
  });

  logger.info('Admin updated user', {
    adminUserId: req.user!.userId,
    targetUserId: id,
    updatedFields: Object.keys(req.body),
  });

  res.json(updatedUser);
}));

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', validateAdminAction, logAdminAction('delete_user'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('User ID is required');
  }

  await adminService.deleteUser(req.user!.userId, id);

  logger.info('Admin deleted user', {
    adminUserId: req.user!.userId,
    deletedUserId: id,
  });

  res.status(204).send();
}));

// GET /api/admin/analytics - Get system analytics
router.get('/analytics', asyncHandler(async (req, res) => {
  const analytics = await adminService.getSystemAnalytics();

  logger.info('Admin retrieved system analytics', {
    adminUserId: req.user!.userId,
  });

  res.json(analytics);
}));

// GET /api/admin/system-health - Get system health metrics
router.get('/system-health', asyncHandler(async (req, res) => {
  const health = await adminService.getSystemHealth();

  logger.info('Admin retrieved system health', {
    adminUserId: req.user!.userId,
    systemStatus: health.status,
  });

  res.json(health);
}));

// GET /api/admin/logs - Get system logs
router.get('/logs', asyncHandler(async (req, res) => {
  const {
    page = '1',
    limit = '50',
    level,
    startDate,
    endDate
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  if (pageNum < 1 || limitNum < 1 || limitNum > 200) {
    throw new ValidationError('Invalid pagination parameters');
  }

  const logs = await adminService.getSystemLogs(
    pageNum,
    limitNum,
    level as string,
    startDate ? new Date(startDate as string) : undefined,
    endDate ? new Date(endDate as string) : undefined
  );

  logger.info('Admin retrieved system logs', {
    adminUserId: req.user!.userId,
    page: pageNum,
    limit: limitNum,
  });

  res.json(logs);
}));

// GET /api/admin/settings - Get system settings
router.get('/settings', asyncHandler(async (req, res) => {
  const settings = await adminService.getSystemSettings();

  logger.info('Admin retrieved system settings', {
    adminUserId: req.user!.userId,
  });

  res.json(settings);
}));

// PUT /api/admin/settings - Update system settings
router.put('/settings', logAdminAction('update_settings'), asyncHandler(async (req, res) => {
  const settings = req.body;

  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Settings object is required');
  }

  const updatedSettings = await adminService.updateSystemSettings(req.user!.userId, settings);

  logger.info('Admin updated system settings', {
    adminUserId: req.user!.userId,
    updatedSections: Object.keys(settings),
  });

  res.json(updatedSettings);
}));

// GET /api/admin/storage/stats - Get system-wide storage statistics
router.get('/storage/stats', logAdminAction('view_storage_stats'), asyncHandler(async (req, res) => {
  const { StorageManagementService } = await import('../services/storageManagementService');
  const storageService = new StorageManagementService();
  
  const stats = await storageService.getSystemStorageStats();
  
  logger.info('Admin retrieved storage statistics', {
    adminUserId: req.user!.userId,
    totalUsers: stats.totalUsers,
    totalStorage: stats.totalStorage,
  });

  res.status(200).json({
    message: 'Storage statistics retrieved successfully',
    data: { stats },
  });
}));

// POST /api/admin/cleanup/run - Manually trigger cleanup
router.post('/cleanup/run', 
  logAdminAction('trigger_cleanup'),
  asyncHandler(async (req, res) => {
    const { type = 'daily' } = req.body;
    
    if (!['daily', 'weekly', 'monthly'].includes(type)) {
      throw new ValidationError('Invalid cleanup type. Must be daily, weekly, or monthly');
    }

    const { CleanupService } = await import('../services/cleanupService');
    const cleanupService = new CleanupService();
    
    const result = await cleanupService.runManualCleanup(type);
    
    logger.info('Admin triggered manual cleanup', {
      adminUserId: req.user!.userId,
      cleanupType: type,
      duration: result.duration,
      deletedFiles: result.results.orphanedFiles.deleted + result.results.oldMeetings.deleted,
    });

    res.status(200).json({
      message: `${type} cleanup completed successfully`,
      data: { result },
    });
  })
);

// GET /api/admin/cleanup/status - Get cleanup service status
router.get('/cleanup/status', logAdminAction('view_cleanup_status'), asyncHandler(async (req, res) => {
  const { CleanupService } = await import('../services/cleanupService');
  const cleanupService = new CleanupService();
  
  const status = cleanupService.getStatus();
  
  res.status(200).json({
    message: 'Cleanup status retrieved successfully',
    data: { status },
  });
}));

// POST /api/admin/storage/recalculate-all - Recalculate storage for all users
router.post('/storage/recalculate-all',
  logAdminAction('recalculate_all_storage'),
  asyncHandler(async (req, res) => {
    const { StorageManagementService } = await import('../services/storageManagementService');
    const storageService = new StorageManagementService();
    
    // Get all users and recalculate their storage
    const users = await adminService.getAllUsers();
    let recalculatedCount = 0;
    const errors: string[] = [];
    
    for (const user of users) {
      try {
        await storageService.recalculateUserStorage(user.id);
        recalculatedCount++;
      } catch (error) {
        errors.push(`Failed to recalculate storage for user ${user.email}: ${error}`);
      }
    }
    
    logger.info('Admin recalculated storage for all users', {
      adminUserId: req.user!.userId,
      totalUsers: users.length,
      recalculatedCount,
      errors: errors.length,
    });

    res.status(200).json({
      message: 'Storage recalculation completed',
      data: {
        totalUsers: users.length,
        recalculatedCount,
        errors,
      },
    });
  })
);

export { router as adminRoutes };