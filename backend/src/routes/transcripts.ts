import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { TranscriptService } from '../services/transcriptService';
import Joi from 'joi';

const router = Router();
const transcriptService = new TranscriptService();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation schemas
const createTranscriptSchema = Joi.object({
  meetingId: Joi.string().required(),
  speaker: Joi.string().min(1).max(100).required(),
  text: Joi.string().min(1).max(5000).required(),
  timestamp: Joi.date().iso().required(),
  confidence: Joi.number().min(0).max(1).required(),
  isFinal: Joi.boolean().default(false),
});

const updateTranscriptSchema = Joi.object({
  speaker: Joi.string().min(1).max(100).optional(),
  text: Joi.string().min(1).max(5000).optional(),
  confidence: Joi.number().min(0).max(1).optional(),
  isFinal: Joi.boolean().optional(),
});

const getTranscriptsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(1000).default(100),
  speaker: Joi.string().max(100).optional(),
  search: Joi.string().max(200).optional(),
  startTime: Joi.date().iso().optional(),
  endTime: Joi.date().iso().optional(),
  minConfidence: Joi.number().min(0).max(1).optional(),
  isFinal: Joi.boolean().optional(),
  sortBy: Joi.string().valid('timestamp', 'speaker', 'confidence').default('timestamp'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

// GET /api/transcripts/meeting/:meetingId
router.get('/meeting/:meetingId', asyncHandler(async (req, res) => {
  const { error, value } = getTranscriptsSchema.validate(req.query);
  if (error) {
    return res.status(400).json({ error: error.details?.[0]?.message || "Validation error" });
  }

  const {
    page,
    limit,
    speaker,
    search,
    startTime,
    endTime,
    minConfidence,
    isFinal,
    sortBy,
    sortOrder,
  } = value;

  const filters = {
    ...(speaker && { speaker }),
    ...(search && { search }),
    ...(startTime && { startTime: new Date(startTime) }),
    ...(endTime && { endTime: new Date(endTime) }),
    ...(minConfidence !== undefined && { minConfidence }),
    ...(isFinal !== undefined && { isFinal }),
  };

  const pagination = {
    page,
    limit,
    sortBy,
    sortOrder,
  };

  const result = await transcriptService.getTranscriptsForMeeting(
    req.params.meetingId,
    req.user!.userId,
    filters,
    pagination
  );

  res.json(result);
}));

// POST /api/transcripts
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createTranscriptSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details?.[0]?.message || "Validation error" });
  }

  const transcript = await transcriptService.createTranscriptEntry(req.user!.userId, {
    ...value,
    timestamp: new Date(value.timestamp),
  });

  res.status(201).json(transcript);
}));

// PUT /api/transcripts/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { error, value } = updateTranscriptSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details?.[0]?.message || "Validation error" });
  }

  const transcript = await transcriptService.updateTranscriptEntry(
    req.params.id,
    req.user!.userId,
    value
  );

  res.json(transcript);
}));

// DELETE /api/transcripts/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await transcriptService.deleteTranscriptEntry(
    req.params.id,
    req.user!.userId
  );

  res.json(result);
}));

// GET /api/transcripts/search
router.get('/search', asyncHandler(async (req, res) => {
  const { q: query, page = 1, limit = 50 } = req.query;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const result = await transcriptService.searchTranscripts(
    req.user!.userId,
    query,
    {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    }
  );

  res.json(result);
}));

// GET /api/transcripts/meeting/:meetingId/stats
router.get('/meeting/:meetingId/stats', asyncHandler(async (req, res) => {
  const stats = await transcriptService.getTranscriptStats(
    req.params.meetingId,
    req.user!.userId
  );

  res.json(stats);
}));

// GET /api/transcripts/meeting/:meetingId/timeline
router.get('/meeting/:meetingId/timeline', asyncHandler(async (req, res) => {
  const timeline = await transcriptService.getTranscriptTimeline(
    req.params.meetingId,
    req.user!.userId
  );

  res.json(timeline);
}));

// GET /api/transcripts/meeting/:meetingId/export
router.get('/meeting/:meetingId/export', asyncHandler(async (req, res) => {
  const { format = 'json' } = req.query;
  
  if (!['json', 'txt', 'srt', 'vtt'].includes(format as string)) {
    return res.status(400).json({ 
      error: 'Invalid export format. Supported: json, txt, srt, vtt' 
    });
  }

  const content = await transcriptService.exportTranscripts(
    req.params.meetingId,
    req.user!.userId,
    format as 'json' | 'txt' | 'srt' | 'vtt'
  );

  // Set appropriate headers
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `transcript-${req.params.meetingId}-${timestamp}.${format}`;
  
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  switch (format) {
    case 'json':
      res.setHeader('Content-Type', 'application/json');
      break;
    case 'txt':
      res.setHeader('Content-Type', 'text/plain');
      break;
    case 'srt':
      res.setHeader('Content-Type', 'text/plain');
      break;
    case 'vtt':
      res.setHeader('Content-Type', 'text/vtt');
      break;
  }
  
  res.send(content);
}));

export { router as transcriptRoutes };