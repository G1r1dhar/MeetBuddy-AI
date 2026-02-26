/**
 * Demo Server - Simplified version for demonstration without external dependencies
 */
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 5000;

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Demo data
const demoUsers = [
  { id: '1', email: 'demo@meetbuddy.ai', name: 'Demo User', role: 'USER' },
  { id: '2', email: 'admin@meetbuddy.ai', name: 'Admin User', role: 'ADMIN' }
];

const demoMeetings = [
  {
    id: '1',
    title: 'Weekly Team Standup',
    description: 'Weekly team sync meeting',
    userId: '1',
    platform: 'GOOGLE_MEET',
    status: 'COMPLETED',
    scheduledTime: new Date('2024-12-17T10:00:00Z'),
    startTime: new Date('2024-12-17T10:02:00Z'),
    endTime: new Date('2024-12-17T10:45:00Z'),
    participants: ['John Doe', 'Jane Smith', 'Mike Johnson'],
    createdAt: new Date('2024-12-16T15:00:00Z')
  },
  {
    id: '2',
    title: 'Product Planning Session',
    description: 'Q1 2025 product roadmap discussion',
    userId: '1',
    platform: 'ZOOM',
    status: 'SCHEDULED',
    scheduledTime: new Date('2024-12-18T14:00:00Z'),
    participants: ['Product Team'],
    createdAt: new Date('2024-12-17T09:00:00Z')
  }
];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0-demo',
    services: {
      database: 'demo-mode',
      redis: 'demo-mode',
      ai: 'demo-mode'
    }
  });
});

// Demo API endpoints
app.get('/api/auth/me', (req, res) => {
  res.json({
    success: true,
    user: demoUsers[0]
  });
});

app.get('/api/meetings', (req, res) => {
  res.json({
    success: true,
    meetings: demoMeetings,
    total: demoMeetings.length,
    page: 1,
    limit: 20
  });
});

app.get('/api/meetings/:id', (req, res) => {
  const meeting = demoMeetings.find(m => m.id === req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }
  return res.json({ success: true, meeting });
});

app.get('/api/meetings/:id/transcript', (req, res) => {
  const demoTranscript = [
    {
      id: '1',
      speaker: 'John Doe',
      text: 'Good morning everyone, let\'s start with our weekly standup.',
      timestamp: new Date('2024-12-17T10:02:00Z'),
      confidence: 0.95
    },
    {
      id: '2',
      speaker: 'Jane Smith',
      text: 'I completed the user authentication feature and started working on the meeting dashboard.',
      timestamp: new Date('2024-12-17T10:03:00Z'),
      confidence: 0.92
    },
    {
      id: '3',
      speaker: 'Mike Johnson',
      text: 'The backend API is ready for testing. I\'ve implemented all the CRUD operations for meetings.',
      timestamp: new Date('2024-12-17T10:04:00Z'),
      confidence: 0.88
    }
  ];

  res.json({
    success: true,
    transcript: demoTranscript,
    total: demoTranscript.length
  });
});

app.get('/api/meetings/:id/summary', (req, res) => {
  const demoSummary = {
    id: '1',
    meetingId: req.params.id,
    overallSummary: 'Weekly team standup covering progress on user authentication, meeting dashboard, and backend API development.',
    keyPoints: [
      'User authentication feature completed',
      'Meeting dashboard development in progress',
      'Backend API ready for testing',
      'All CRUD operations implemented'
    ],
    actionItems: [
      'Jane to continue work on meeting dashboard',
      'Mike to coordinate API testing with QA team',
      'Schedule code review session for authentication feature'
    ],
    nextSteps: [
      'Begin integration testing',
      'Prepare demo for stakeholders',
      'Plan next sprint priorities'
    ],
    topics: ['Development Progress', 'API Testing', 'Code Review'],
    generatedAt: new Date('2024-12-17T10:46:00Z')
  };

  res.json({ success: true, summary: demoSummary });
});

// Storage management demo endpoints
app.get('/api/users/:id/storage', (req, res) => {
  const demoStorageStats = {
    totalFiles: 15,
    totalSize: 2147483648, // 2GB in bytes
    quota: 5368709120, // 5GB in bytes
    usagePercentage: 40,
    byCategory: {
      recordings: { count: 8, size: 1610612736 }, // 1.5GB
      avatars: { count: 1, size: 2097152 }, // 2MB
      attachments: { count: 5, size: 524288000 }, // 500MB
      exports: { count: 1, size: 10485760 } // 10MB
    },
    subscription: 'PRO'
  };

  res.json({ success: true, storage: demoStorageStats });
});

app.get('/api/monitoring/dashboard', (req, res) => {
  const demoMetrics = {
    system: {
      uptime: 86400, // 24 hours in seconds
      memoryUsage: 512 * 1024 * 1024, // 512MB
      cpuUsage: 25.5,
      activeConnections: 42
    },
    errors: {
      total24h: 12,
      errorRate: 0.8,
      criticalErrors: 2,
      recentErrors: [
        {
          timestamp: new Date(Date.now() - 3600000),
          message: 'Database connection timeout',
          level: 'error',
          count: 3
        },
        {
          timestamp: new Date(Date.now() - 7200000),
          message: 'Rate limit exceeded',
          level: 'warn',
          count: 8
        }
      ]
    },
    performance: {
      avgResponseTime: 245,
      requestsPerMinute: 150,
      slowQueries: 5,
      cacheHitRate: 85.2
    },
    security: {
      suspiciousActivities: 3,
      blockedRequests: 15,
      failedLogins: 8,
      recentEvents: [
        {
          timestamp: new Date(Date.now() - 1800000),
          type: 'XSS_ATTEMPT',
          severity: 'medium',
          blocked: true
        }
      ]
    }
  };

  res.json({ success: true, metrics: demoMetrics });
});

// Socket.IO demo handlers
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Demo real-time transcript
  socket.on('start-capture', (meetingId) => {
    console.log('Starting capture for meeting:', meetingId);

    // Simulate real-time transcript updates
    const demoTranscriptUpdates = [
      { speaker: 'Demo User', text: 'Hello everyone, can you hear me?', timestamp: new Date() },
      { speaker: 'Participant 1', text: 'Yes, we can hear you clearly.', timestamp: new Date() },
      { speaker: 'Demo User', text: 'Great! Let\'s begin the meeting.', timestamp: new Date() }
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index < demoTranscriptUpdates.length) {
        socket.emit('transcript-update', {
          meetingId,
          entry: demoTranscriptUpdates[index]
        });
        index++;
      } else {
        clearInterval(interval);
        socket.emit('capture-complete', { meetingId });
      }
    }, 3000);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    message: 'This is a demo server. Full functionality requires database setup.'
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 MeetBuddy AI Demo Server running on port ${PORT}`);
  console.log(`📊 Environment: DEMO MODE`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`💡 This is a demonstration server with mock data`);
  console.log(`💡 For full functionality, set up PostgreSQL and Redis`);
});

export { app, server, io };