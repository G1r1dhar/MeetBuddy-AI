import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/session';
import { UserService } from '../services/userService';
import { validate } from '../utils/validation';
import { userSchemas } from '../utils/validation';

const router = Router();
const userService = new UserService();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed'));
    }
  },
});

// All user routes require authentication
router.use(authenticateToken);

// GET /api/users/profile
router.get('/profile', asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        message: 'Authentication required',
        statusCode: 401,
      },
    });
  }

  const profile = await userService.getUserProfile(req.user.id);
  
  res.status(200).json({
    message: 'Profile retrieved successfully',
    data: { user: profile },
  });
}));

// PUT /api/users/profile
router.put('/profile',
  validate(userSchemas.updateProfile),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    const updatedUser = await userService.updateProfile(req.user.id, req.body);
    
    res.status(200).json({
      message: 'Profile updated successfully',
      data: { user: updatedUser },
    });
  })
);

// POST /api/users/avatar
router.post('/avatar',
  upload.single('avatar'),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: {
          message: 'No file provided',
          statusCode: 400,
        },
      });
    }

    const avatarUrl = await userService.uploadAvatar(req.user.id, req.file);
    
    res.status(200).json({
      message: 'Avatar uploaded successfully',
      data: { avatarUrl },
    });
  })
);

// PUT /api/users/preferences
router.put('/preferences',
  validate(userSchemas.updatePreferences),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    const updatedUser = await userService.updatePreferences(req.user.id, req.body);
    
    res.status(200).json({
      message: 'Preferences updated successfully',
      data: { user: updatedUser },
    });
  })
);

// GET /api/users/stats
router.get('/stats', asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        message: 'Authentication required',
        statusCode: 401,
      },
    });
  }

  const stats = await userService.getUserStats(req.user.id);
  
  res.status(200).json({
    message: 'User statistics retrieved successfully',
    data: { stats },
  });
}));

// GET /api/users/activity
router.get('/activity', asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        message: 'Authentication required',
        statusCode: 401,
      },
    });
  }

  const days = req.query.days ? parseInt(req.query.days as string) : 30;
  const activity = await userService.getUserActivity(req.user.id, days);
  
  res.status(200).json({
    message: 'User activity retrieved successfully',
    data: { activity },
  });
}));

// GET /api/users/storage
router.get('/storage', asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        message: 'Authentication required',
        statusCode: 401,
      },
    });
  }

  const storage = await userService.checkStorageLimit(req.user.id);
  
  res.status(200).json({
    message: 'Storage information retrieved successfully',
    data: { storage },
  });
}));

// DELETE /api/users/account
router.delete('/account', asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        message: 'Authentication required',
        statusCode: 401,
      },
    });
  }

  await userService.deleteAccount(req.user.id);
  
  res.status(200).json({
    message: 'Account deleted successfully',
  });
}));

export { router as userRoutes };