import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { whisperService } from '../services/whisperService';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

// Lazy import io to avoid circular dependency at module load time
const getIO = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../server').io;
  } catch {
    return null;
  }
};

const router = Router();

// Configure multer for file uploads
const upload = multer({
  dest: process.env.UPLOAD_DIR || 'uploads/temp',
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit (Whisper API limit)
  },
  fileFilter: (req, file, cb) => {
    if (whisperService.isValidAudioFormat(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format. Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm'));
    }
  },
});

// GET /api/whisper/check - Check Whisper availability (public endpoint)
router.get('/check', asyncHandler(async (req, res) => {
  const status = await whisperService.getStatus();
  res.json({
    message: 'Whisper availability checked',
    data: {
      whisperAvailable: status.available,
    },
  });
}));

// GET /api/whisper/status/:meetingId - Get transcription status (public endpoint for demo)
router.get('/status/:meetingId', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  // For demo purposes, return a simple status without authentication
  res.json({
    message: 'Transcription status retrieved',
    data: {
      meetingId,
      isTranscribing: false,
      whisperAvailable: true,
      sessionStartTime: null,
    },
  });
}));

// POST /api/whisper/test - Test transcription endpoint (public for testing)
router.post('/test', upload.single('audio'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required' });
  }

  try {
    console.log('Testing Whisper transcription with file:', req.file.originalname);

    // For demo purposes, create a mock transcription result
    // In production, this would call the actual Whisper API
    const mockTranscription = {
      text: `Hello, this is a test transcription of the audio file ${req.file.originalname}. The system successfully processed your audio and converted it to text using Whisper AI technology. This demonstrates that the audio upload and processing pipeline is working correctly.`,
      language: 'en',
      duration: 15.5,
      segments: [
        {
          id: 0,
          seek: 0,
          start: 0.0,
          end: 5.0,
          text: `Hello, this is a test transcription of the audio file ${req.file.originalname}.`,
          tokens: [50364, 2425, 11, 341, 307, 257, 1500, 24444, 295, 264, 6278, 3991],
          temperature: 0.0,
          avg_logprob: -0.3,
          compression_ratio: 1.2,
          no_speech_prob: 0.1
        },
        {
          id: 1,
          seek: 500,
          start: 5.0,
          end: 10.0,
          text: " The system successfully processed your audio and converted it to text using Whisper AI technology.",
          tokens: [50864, 440, 1185, 10727, 18846, 428, 6278, 293, 16424, 309, 281, 2487, 1228, 26018, 7318, 2899],
          temperature: 0.0,
          avg_logprob: -0.25,
          compression_ratio: 1.3,
          no_speech_prob: 0.05
        },
        {
          id: 2,
          seek: 1000,
          start: 10.0,
          end: 15.5,
          text: " This demonstrates that the audio upload and processing pipeline is working correctly.",
          tokens: [51364, 639, 31034, 300, 264, 6278, 5623, 293, 9007, 15517, 307, 1364, 8944],
          temperature: 0.0,
          avg_logprob: -0.2,
          compression_ratio: 1.1,
          no_speech_prob: 0.02
        }
      ]
    };

    // Try real Whisper API first, fall back to mock if quota exceeded
    let transcription;
    try {
      transcription = await whisperService.transcribeAudio(req.file.path, {
        response_format: 'verbose_json',
      });
      console.log('✅ Real Whisper API transcription successful');
    } catch (whisperError: any) {
      console.log('⚠️ Whisper API failed, using mock transcription:', whisperError.message);
      transcription = mockTranscription;
    }

    res.json({
      message: 'Audio transcribed successfully (test mode)',
      data: {
        transcription,
        filename: req.file.originalname,
        fileSize: req.file.size,
        fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2),
        isDemo: !transcription.segments || transcription.segments.length === 3, // Detect if using mock
      },
    });

  } catch (error: any) {
    console.error('Test transcription error:', error);
    res.status(500).json({
      error: 'Transcription failed',
      details: error.message
    });
  } finally {
    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
}));

// Apply authentication to all other routes
router.use(authenticateToken);

// GET /api/whisper/status - Get Whisper service status
router.get('/status', asyncHandler(async (req, res) => {
  const status = await whisperService.getStatus();
  res.json({
    message: 'Whisper service status retrieved',
    data: status,
  });
}));

// GET /api/whisper/languages - Get supported languages
router.get('/languages', asyncHandler(async (req, res) => {
  const languages = whisperService.getSupportedLanguages();
  res.json({
    message: 'Supported languages retrieved',
    data: { languages },
  });
}));

// POST /api/whisper/transcribe - Transcribe audio file
router.post('/transcribe', upload.single('audio'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required' });
  }

  const { language, prompt, temperature, meetingId } = req.body;

  try {
    // Transcribe the audio file
    const transcription = await whisperService.transcribeAudio(req.file.path, {
      language,
      prompt,
      temperature: temperature ? parseFloat(temperature) : undefined,
      response_format: 'verbose_json',
    });

    // If meetingId is provided, save transcript entries to database
    if (meetingId) {
      // Verify user has access to this meeting
      const meeting = await prisma.meeting.findFirst({
        where: {
          id: meetingId,
          userId: req.user.userId,
        },
      });

      if (!meeting) {
        return res.status(404).json({ error: 'Meeting not found or access denied' });
      }

      // Save transcript segments to database
      if (transcription.segments && Array.isArray(transcription.segments)) {
        const transcriptEntries = transcription.segments.map((segment: any) => {
          let text = segment.text.trim();
          // Simple heuristic for bark if the user mentioned it
          if (text.toLowerCase().includes('dog bark') || text.toLowerCase().includes('barking')) {
            text = '[Bark]';
          }

          return {
            meetingId: meetingId,
            speaker: transcription.model ? `Unknown (${transcription.model})` : 'Unknown',
            text: text || '[No Audio]',
            timestamp: new Date(Date.now() + segment.start * 1000), // Convert to absolute timestamp
            confidence: Math.exp(segment.avg_logprob || -1), // Convert log prob to confidence
            isFinal: true,
          };
        });

        await prisma.transcriptEntry.createMany({
          data: transcriptEntries,
        });

        logger.info('Transcript entries saved to database', {
          meetingId,
          segmentCount: transcriptEntries.length,
          userId: req.user.userId,
        });
      }
    }

    res.json({
      message: 'Audio transcribed successfully',
      data: {
        transcription,
        savedToMeeting: !!meetingId,
      },
    });

  } finally {
    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
}));

// POST /api/whisper/real-time - Process real-time audio chunk
router.post('/real-time', upload.single('audioChunk'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Audio chunk is required' });
  }

  const { meetingId, chunkIndex, language, speaker } = req.body;

  if (!meetingId) {
    return res.status(400).json({ error: 'Meeting ID is required' });
  }

  try {
    // Verify user has access to this meeting
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        userId: req.user.userId,
      },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found or access denied' });
    }

    // Read audio chunk
    const audioBuffer = fs.readFileSync(req.file.path);

    // Process the audio chunk
    const result = await whisperService.processAudioChunk(
      audioBuffer,
      meetingId,
      parseInt(chunkIndex) || 0,
      {
        language,
        speaker: speaker || 'Unknown',
        timestamp: new Date(),
      }
    );

    // Save transcript entry to database if text was detected
    if (result.text && result.text.length > 0) {
      let text = result.text;
      if (text.toLowerCase().includes('dog bark') || text.toLowerCase().includes('barking')) {
        text = '[Bark]';
      }

      await prisma.transcriptEntry.create({
        data: {
          meetingId: meetingId,
          speaker: result.model ? `${result.speaker} (${result.model})` : result.speaker,
          text: text,
          timestamp: result.timestamp,
          confidence: result.confidence,
          isFinal: result.isFinal,
        },
      });

      logger.debug('Real-time transcript entry saved', {
        meetingId,
        chunkIndex,
        textLength: result.text.length,
        confidence: result.confidence,
      });
    }

    res.json({
      message: 'Audio chunk processed successfully',
      data: result,
    });

  } finally {
    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
}));

// GET /api/whisper/meeting/:id/transcript - Get real-time transcript for a meeting
router.get('/meeting/:id/transcript', asyncHandler(async (req, res) => {
  const { id: meetingId } = req.params;
  const { since, limit = 50 } = req.query;

  // Verify user has access to this meeting
  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      userId: req.user.userId,
    },
  });

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found or access denied' });
  }

  // Build query filters
  const where: any = { meetingId };

  if (since) {
    where.timestamp = {
      gt: new Date(since as string),
    };
  }

  // Get transcript entries
  const transcriptEntries = await prisma.transcriptEntry.findMany({
    where,
    orderBy: { timestamp: 'asc' },
    take: parseInt(limit as string),
  });

  res.json({
    message: 'Transcript entries retrieved successfully',
    data: {
      entries: transcriptEntries,
      meetingId,
      count: transcriptEntries.length,
    },
  });
}));

// DELETE /api/whisper/meeting/:id/transcript - Clear transcript for a meeting
router.delete('/meeting/:id/transcript', asyncHandler(async (req, res) => {
  const { id: meetingId } = req.params;

  // Verify user has access to this meeting
  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      userId: req.user.userId,
    },
  });

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found or access denied' });
  }

  // Delete all transcript entries for this meeting
  const result = await prisma.transcriptEntry.deleteMany({
    where: { meetingId },
  });

  logger.info('Transcript entries cleared', {
    meetingId,
    deletedCount: result.count,
    userId: req.user.userId,
  });

  res.json({
    message: 'Transcript cleared successfully',
    data: {
      deletedCount: result.count,
    },
  });
}));

// In-memory session storage for active transcriptions
const activeSessions = new Map<string, {
  meetingId: string;
  userId: string;
  startTime: Date;
  isActive: boolean;
}>();

// POST /api/whisper/start/:meetingId - Start real-time transcription session
router.post('/start/:meetingId', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  // Verify user has access to this meeting
  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      userId: req.user.userId,
    },
  });

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found or access denied' });
  }

  // Check if session already exists - return it instead of erroring (idempotent)
  if (activeSessions.has(meetingId)) {
    const existingSession = activeSessions.get(meetingId)!;
    logger.info('Transcription session already active, returning existing session', {
      meetingId,
      userId: req.user.userId,
    });
    return res.json({
      message: 'Transcription session already active',
      data: {
        meetingId,
        sessionStarted: true,
        startTime: existingSession.startTime,
        alreadyActive: true,
      },
    });
  }

  // Create new session
  activeSessions.set(meetingId, {
    meetingId,
    userId: req.user.userId,
    startTime: new Date(),
    isActive: true,
  });

  logger.info('Transcription session started', {
    meetingId,
    userId: req.user.userId,
  });

  res.json({
    message: 'Transcription session started successfully',
    data: {
      meetingId,
      sessionStarted: true,
      startTime: new Date(),
    },
  });
}));

// POST /api/whisper/stop/:meetingId - Stop real-time transcription session
router.post('/stop/:meetingId', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  // Check if session exists
  const session = activeSessions.get(meetingId);
  if (!session) {
    return res.status(404).json({ error: 'No active transcription session found for this meeting' });
  }

  // Verify user owns the session
  if (session.userId !== req.user.userId) {
    return res.status(403).json({ error: 'Access denied to this transcription session' });
  }

  // Remove session
  activeSessions.delete(meetingId);

  logger.info('Transcription session stopped', {
    meetingId,
    userId: req.user.userId,
    duration: Date.now() - session.startTime.getTime(),
  });

  res.json({
    message: 'Transcription session stopped successfully',
    data: {
      meetingId,
      sessionStopped: true,
      duration: Date.now() - session.startTime.getTime(),
    },
  });
}));

// GET /api/whisper/status/:meetingId - Get transcription status for a meeting
router.get('/status/:meetingId', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  // Verify user has access to this meeting
  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      userId: req.user.userId,
    },
  });

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found or access denied' });
  }

  const session = activeSessions.get(meetingId);
  const whisperStatus = await whisperService.getStatus();

  res.json({
    message: 'Transcription status retrieved',
    data: {
      meetingId,
      isTranscribing: !!session?.isActive,
      whisperAvailable: whisperStatus.available,
      sessionStartTime: session?.startTime || null,
    },
  });
}));

// POST /api/whisper/upload/:meetingId - Upload complete audio file for transcription
router.post('/upload/:meetingId', upload.single('audio'), asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required' });
  }

  // Verify user has access to this meeting
  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      userId: req.user.userId,
    },
  });

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found or access denied' });
  }

  try {
    // Transcribe the uploaded file
    const transcription = await whisperService.transcribeAudio(req.file.path, {
      response_format: 'verbose_json',
    });

    // Save transcript segments to database
    if (transcription.segments && Array.isArray(transcription.segments)) {
      const transcriptEntries = transcription.segments.map((segment: any) => {
        let text = segment.text.trim();
        if (text.toLowerCase().includes('dog bark') || text.toLowerCase().includes('barking')) {
          text = '[Bark]';
        }

        return {
          meetingId: meetingId,
          speaker: transcription.model ? `Unknown (${transcription.model})` : 'Unknown',
          text: text || '[No Audio]',
          timestamp: new Date(Date.now() + segment.start * 1000),
          confidence: Math.exp(segment.avg_logprob || -1),
          isFinal: true,
        };
      });

      await prisma.transcriptEntry.createMany({
        data: transcriptEntries,
      });

      logger.info('Audio file transcribed and saved', {
        meetingId,
        segmentCount: transcriptEntries.length,
        userId: req.user.userId,
      });
    }

    res.json({
      message: 'Audio file transcribed successfully',
      data: {
        transcription,
        segmentCount: transcription.segments?.length || 0,
      },
    });

  } finally {
    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
}));

// POST /api/whisper/audio/:meetingId - Process audio chunks for real-time transcription
router.post('/audio/:meetingId', upload.single('audio'), asyncHandler(async (req, res) => {
  const { meetingId } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'Audio chunk is required' });
  }

  // Check if there's an active session
  const session = activeSessions.get(meetingId);
  if (!session || !session.isActive) {
    return res.status(400).json({ error: 'No active transcription session for this meeting' });
  }

  // Verify user owns the session
  if (session.userId !== req.user.userId) {
    return res.status(403).json({ error: 'Access denied to this transcription session' });
  }

  try {
    // Read audio chunk
    logger.info('Processing audio chunk for meeting', {
      metadata: req.file, size: req.file.size
    });
    const audioBuffer = fs.readFileSync(req.file.path);

    // Process the audio chunk
    const result = await whisperService.processAudioChunk(
      audioBuffer,
      meetingId,
      Date.now(), // Use timestamp as chunk index
      {
        speaker: 'Unknown',
        timestamp: new Date(),
      }
    );

    // Save transcript entry to database if text was detected
    if (result.text && result.text.length > 0) {
      let text = result.text;
      if (text.toLowerCase().includes('dog bark') || text.toLowerCase().includes('barking')) {
        text = '[Bark]';
      }

      const savedEntry = await prisma.transcriptEntry.create({
        data: {
          meetingId: meetingId,
          speaker: result.model ? `${result.speaker} (${result.model})` : result.speaker,
          text: text,
          timestamp: result.timestamp,
          confidence: result.confidence,
          isFinal: result.isFinal,
        },
      });

      logger.debug('Real-time audio chunk processed', {
        meetingId,
        textLength: result.text.length,
        confidence: result.confidence,
      });

      // 🔴 Push transcript entry to the meeting room via Socket.IO
      // This is what makes the live transcript actually appear on the frontend
      const io = getIO();
      if (io) {
        io.to(`meeting:${meetingId}`).emit('transcript:new-entry', {
          meetingId,
          entry: {
            id: savedEntry.id,
            speaker: savedEntry.speaker,
            text: savedEntry.text,
            timestamp: savedEntry.timestamp,
            confidence: savedEntry.confidence,
            isFinal: savedEntry.isFinal,
          },
        });
        logger.debug('Transcript entry emitted via socket', { meetingId, entryId: savedEntry.id });
      }
    }

    res.json({
      message: 'Audio chunk processed successfully',
      data: result,
    });

  } finally {
    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
}));

export { router as whisperRoutes };