import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { SummaryService } from '../services/summaryService';
import Joi from 'joi';

const router = Router();
const summaryService = new SummaryService();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation schemas
const createSummarySchema = Joi.object({
  meetingId: Joi.string().required(),
  overallSummary: Joi.string().max(5000).optional(),
  keyPoints: Joi.array().items(Joi.string().max(500)).optional(),
  actionItems: Joi.array().items(Joi.string().max(500)).optional(),
  nextSteps: Joi.array().items(Joi.string().max(500)).optional(),
  topics: Joi.array().items(Joi.string().max(200)).optional(),
});

const updateSummarySchema = Joi.object({
  overallSummary: Joi.string().max(5000).optional(),
  keyPoints: Joi.array().items(Joi.string().max(500)).optional(),
  actionItems: Joi.array().items(Joi.string().max(500)).optional(),
  nextSteps: Joi.array().items(Joi.string().max(500)).optional(),
  topics: Joi.array().items(Joi.string().max(200)).optional(),
});

const generateSummarySchema = Joi.object({
  meetingId: Joi.string().required(),
});

// GET /api/summaries/meeting/:meetingId
router.get('/meeting/:meetingId', asyncHandler(async (req, res) => {
  const summary = await summaryService.getSummaryForMeeting(
    req.params.meetingId,
    req.user!.userId
  );
  res.json(summary);
}));

// POST /api/summaries/generate
router.post('/generate', asyncHandler(async (req, res) => {
  const { error, value } = generateSummarySchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details?.[0]?.message || "Validation error" });
  }

  const summary = await summaryService.generateSummaryForMeeting(
    value.meetingId,
    req.user!.userId
  );

  res.status(201).json(summary);
}));

// POST /api/summaries
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createSummarySchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details?.[0]?.message || "Validation error" });
  }

  const summary = await summaryService.createSummary(req.user!.userId, value);
  res.status(201).json(summary);
}));

// GET /api/summaries
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  
  const result = await summaryService.getUserSummaries(req.user!.userId, {
    page: parseInt(page as string),
    limit: parseInt(limit as string),
  });

  res.json(result);
}));

// PUT /api/summaries/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { error, value } = updateSummarySchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details?.[0]?.message || "Validation error" });
  }

  const summary = await summaryService.updateSummary(
    req.params.id,
    req.user!.userId,
    value
  );

  res.json(summary);
}));

// DELETE /api/summaries/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await summaryService.deleteSummary(req.params.id, req.user!.userId);
  res.json(result);
}));

// POST /api/summaries/:id/regenerate
router.post('/:id/regenerate', asyncHandler(async (req, res) => {
  const summary = await summaryService.regenerateSummary(req.params.id, req.user!.userId);
  res.json(summary);
}));

// GET /api/summaries/health
router.get('/health', asyncHandler(async (req, res) => {
  const isHealthy = await summaryService.checkAIServiceHealth();
  const config = summaryService.getAIServiceConfig();
  
  res.json({
    aiServiceHealthy: isHealthy,
    config,
    timestamp: new Date().toISOString(),
  });
}));

export { router as summaryRoutes };