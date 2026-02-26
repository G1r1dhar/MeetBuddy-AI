import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { MeetingService } from '../services/meetingService';
import { validate } from '../utils/validation';
import Joi from 'joi';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure multer for recording uploads
const diskStorage = multer.diskStorage({
  destination: (req, res, cb) => {
    const dir = process.env.UPLOAD_DIR ? path.join(process.env.UPLOAD_DIR, 'recordings') : 'uploads/recordings';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `meeting-${req.params.id}-${Date.now()}${path.extname(file.originalname) || '.webm'}`);
  }
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
});

const router = Router();
const meetingService = new MeetingService();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation schemas
const createMeetingSchema = Joi.object({
  title: Joi.string().min(1).max(200).required(),
  description: Joi.string().max(1000).allow('').optional(),
  platform: Joi.string().valid('GOOGLE_MEET', 'ZOOM', 'MICROSOFT_TEAMS', 'WEBEX', 'DISCORD', 'SKYPE').required(),
  meetingUrl: Joi.string().uri().optional(),
  scheduledTime: Joi.date().iso().min('now').required(),
  participants: Joi.array().items(Joi.string().email()).optional(),
});

const updateMeetingSchema = Joi.object({
  title: Joi.string().min(1).max(200).optional(),
  description: Joi.string().max(1000).optional(),
  scheduledTime: Joi.date().iso().min('now').optional(),
  participants: Joi.array().items(Joi.string().email()).optional(),
  status: Joi.string().valid('SCHEDULED', 'RECORDING', 'COMPLETED', 'CANCELLED').optional(),
  recordingUrl: Joi.string().optional(),
});

const getMeetingsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('SCHEDULED', 'RECORDING', 'COMPLETED', 'CANCELLED').optional(),
  platform: Joi.string().valid('GOOGLE_MEET', 'ZOOM', 'MICROSOFT_TEAMS', 'WEBEX', 'DISCORD', 'SKYPE').optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  search: Joi.string().max(100).optional(),
  sortBy: Joi.string().valid('createdAt', 'scheduledTime', 'title').default('scheduledTime'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

// GET /api/meetings
router.get('/', asyncHandler(async (req, res) => {
  const { error, value } = getMeetingsSchema.validate(req.query);
  if (error) {
    return res.status(400).json({ error: error.details?.[0]?.message || "Validation error" });
  }

  const {
    page,
    limit,
    status,
    platform,
    startDate,
    endDate,
    search,
    sortBy,
    sortOrder,
  } = value;

  const filters = {
    ...(status && { status }),
    ...(platform && { platform }),
    ...(startDate && { startDate: new Date(startDate) }),
    ...(endDate && { endDate: new Date(endDate) }),
    ...(search && { search }),
  };

  const pagination = {
    page,
    limit,
    sortBy,
    sortOrder,
  };

  const result = await meetingService.getMeetings(req.user!.userId, filters, pagination);
  res.json({
    message: 'Meetings retrieved successfully',
    data: result,
  });
}));

// POST /api/meetings
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createMeetingSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details?.[0]?.message || "Validation error" });
  }

  const meeting = await meetingService.createMeeting(req.user!.userId, {
    ...value,
    scheduledTime: new Date(value.scheduledTime),
  });

  res.status(201).json({
    message: 'Meeting created successfully',
    data: { meeting },
  });
}));

// GET /api/meetings/search
router.get('/search', asyncHandler(async (req, res) => {
  const { q: query, page = 1, limit = 20 } = req.query;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const result = await meetingService.searchMeetings(
    req.user!.userId,
    query,
    {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    }
  );

  res.json(result);
}));

// GET /api/meetings/stats
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await meetingService.getMeetingStats(req.user!.userId);
  res.json(stats);
}));

// GET /api/meetings/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const meeting = await meetingService.getMeetingById(
    req.params.id,
    req.user!.userId,
    req.user!.role === 'admin'
  );
  res.json(meeting);
}));

// PUT /api/meetings/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { error, value } = updateMeetingSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details?.[0]?.message || "Validation error" });
  }

  const updateData = {
    ...value,
    ...(value.scheduledTime && { scheduledTime: new Date(value.scheduledTime) }),
  };

  const meeting = await meetingService.updateMeeting(
    req.params.id,
    req.user!.userId,
    updateData
  );

  res.json(meeting);
}));

// DELETE /api/meetings/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await meetingService.deleteMeeting(
    req.params.id,
    req.user!.userId,
    req.user!.role === 'admin'
  );
  res.json(result);
}));

// POST /api/meetings/:id/start
router.post('/:id/start', asyncHandler(async (req, res) => {
  const meeting = await meetingService.startMeeting(req.params.id, req.user!.userId);
  res.json(meeting);
}));

// POST /api/meetings/:id/end
router.post('/:id/end', asyncHandler(async (req, res) => {
  const meeting = await meetingService.endMeeting(req.params.id, req.user!.userId);
  res.json(meeting);
}));

// POST /api/meetings/:id/recording
router.post('/:id/recording', upload.single('video'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Video file is required' });
  }

  const recordingUrl = `/files/recordings/${req.file.filename}`;

  // Update meeting with the recording URL
  const meeting = await meetingService.updateMeeting(
    req.params.id,
    req.user!.userId,
    { recordingUrl }
  );

  res.json({
    message: 'Recording uploaded successfully',
    data: { meeting, recordingUrl }
  });
}));

// GET /api/meetings/:id/export
router.get('/:id/export', asyncHandler(async (req, res) => {
  const { format = 'json' } = req.query;

  if (!['json', 'pdf', 'csv'].includes(format as string)) {
    return res.status(400).json({ error: 'Invalid export format. Supported: json, pdf, csv' });
  }

  // Use the service method for export
  const exportData = await meetingService.exportMeeting(
    req.params.id,
    req.user!.userId,
    format as 'json' | 'pdf' | 'csv'
  );

  // Set appropriate headers
  res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
  res.setHeader('Content-Type', exportData.contentType);

  res.send(exportData.content);
}));

export { router as meetingRoutes };