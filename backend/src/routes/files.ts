/**
 * File Upload Routes
 * 
 * Handles file uploads for avatars, meeting recordings, and attachments
 */

import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/session';
import { FileStorageService } from '../services/fileStorageService';
import { validate } from '../utils/validation';
import Joi from 'joi';
import { logger } from '../utils/logger';

const router = Router();
const fileStorageService = new FileStorageService();

// Configure multer for different file types
const createMulterConfig = (maxSize: number, allowedTypes?: string[]) => {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxSize,
      files: 1,
    },
    fileFilter: (req, file, cb) => {
      if (allowedTypes && !allowedTypes.includes(file.mimetype)) {
        return cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`));
      }
      cb(null, true);
    },
  });
};

// Different upload configurations
const avatarUpload = createMulterConfig(
  5 * 1024 * 1024, // 5MB
  ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
);

const recordingUpload = createMulterConfig(
  500 * 1024 * 1024, // 500MB
  ['video/mp4', 'video/webm', 'audio/mp3', 'audio/wav', 'audio/webm']
);

const attachmentUpload = createMulterConfig(
  25 * 1024 * 1024, // 25MB
  [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/jpeg',
    'image/png',
  ]
);

// Validation schemas
const uploadRecordingSchema = Joi.object({
  meetingId: Joi.string().optional(),
});

const listFilesSchema = Joi.object({
  category: Joi.string().valid('avatar', 'recording', 'attachment', 'export').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// Apply authentication to all routes
router.use(authenticateToken);

// POST /api/files/avatar - Upload user avatar
router.post('/avatar',
  avatarUpload.single('avatar'),
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

    try {
      const storedFile = await fileStorageService.uploadAvatar(req.user.id, req.file);
      
      res.status(200).json({
        message: 'Avatar uploaded successfully',
        data: {
          file: storedFile,
          avatarUrl: storedFile.publicUrl,
        },
      });
    } catch (error) {
      logger.error('Avatar upload failed', {
        userId: req.user.id,
        fileName: req.file.originalname,
        error,
      });
      throw error;
    }
  })
);

// POST /api/files/recording - Upload meeting recording
router.post('/recording',
  recordingUpload.single('recording'),
  validate(uploadRecordingSchema),
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

    try {
      const { meetingId } = req.body;
      const storedFile = await fileStorageService.uploadRecording(
        req.user.id, 
        req.file, 
        meetingId
      );
      
      res.status(200).json({
        message: 'Recording uploaded successfully',
        data: {
          file: storedFile,
        },
      });
    } catch (error) {
      logger.error('Recording upload failed', {
        userId: req.user.id,
        fileName: req.file.originalname,
        meetingId: req.body.meetingId,
        error,
      });
      throw error;
    }
  })
);

// POST /api/files/attachment - Upload meeting attachment
router.post('/attachment',
  attachmentUpload.single('attachment'),
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

    try {
      const storedFile = await fileStorageService.uploadAttachment(req.user.id, req.file);
      
      res.status(200).json({
        message: 'Attachment uploaded successfully',
        data: {
          file: storedFile,
        },
      });
    } catch (error) {
      logger.error('Attachment upload failed', {
        userId: req.user.id,
        fileName: req.file.originalname,
        error,
      });
      throw error;
    }
  })
);

// GET /api/files - List user files
router.get('/',
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    const { error, value } = listFilesSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: {
          message: error.details?.[0]?.message || "Validation error",
          statusCode: 400,
        },
      });
    }

    const { category, page, limit } = value;

    try {
      const result = await fileStorageService.listUserFiles(
        req.user.id,
        category,
        page,
        limit
      );
      
      res.status(200).json({
        message: 'Files retrieved successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Failed to list user files', {
        userId: req.user.id,
        category,
        error,
      });
      throw error;
    }
  })
);

// GET /api/files/stats - Get user storage statistics
router.get('/stats',
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    try {
      const stats = await fileStorageService.getUserStorageStats(req.user.id);
      
      res.status(200).json({
        message: 'Storage statistics retrieved successfully',
        data: { stats },
      });
    } catch (error) {
      logger.error('Failed to get storage stats', {
        userId: req.user.id,
        error,
      });
      throw error;
    }
  })
);

// GET /api/files/:id - Get file details
router.get('/:id',
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    try {
      const file = await fileStorageService.getFile(req.params.id, req.user.id);
      
      if (!file) {
        return res.status(404).json({
          error: {
            message: 'File not found',
            statusCode: 404,
          },
        });
      }
      
      res.status(200).json({
        message: 'File retrieved successfully',
        data: { file },
      });
    } catch (error) {
      logger.error('Failed to get file', {
        userId: req.user.id,
        fileId: req.params.id,
        error,
      });
      throw error;
    }
  })
);

// DELETE /api/files/:id - Delete file
router.delete('/:id',
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          statusCode: 401,
        },
      });
    }

    try {
      await fileStorageService.deleteFile(req.params.id, req.user.id);
      
      res.status(200).json({
        message: 'File deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete file', {
        userId: req.user.id,
        fileId: req.params.id,
        error,
      });
      throw error;
    }
  })
);

// Error handling middleware for multer
router.use((error: any, req: any, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: {
          message: 'File size too large',
          statusCode: 400,
        },
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: {
          message: 'Too many files',
          statusCode: 400,
        },
      });
    }
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: {
        message: error.message,
        statusCode: 400,
      },
    });
  }
  
  next(error);
});

export { router as fileRoutes };