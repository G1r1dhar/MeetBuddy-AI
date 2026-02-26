# MeetBuddy AI - Quick Start Guide

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn

## One-Command Startup

To start both frontend and backend with a single command:

```bash
cd meetbuddyai
npm run start:all
```

This will:
1. Set up the SQLite database automatically
2. Start the backend server on `http://localhost:5000`
3. Start the frontend on `http://localhost:3000`
4. Show you real-time status updates

## Alternative: Manual Startup

If you prefer to start services separately:

### Backend
```bash
cd meetbuddyai/backend
npm run dev
```

### Frontend (in a new terminal)
```bash
cd meetbuddyai
npm run dev
```

## Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Health Check**: http://localhost:5000/health (should show "healthy" status)
- **Database**: SQLite file at `./backend/prisma/test.db`

## System Status

✅ **All systems operational:**
- Database: Connected (SQLite)
- Redis: Connected (optional cache)
- Backend API: Running on port 5000
- Frontend: Running on port 3000
- Health monitoring: Active
- Meeting auto-completion: Working
- Error monitoring: Active

## Default Test Credentials

The system will create a default admin user on first run:
- **Email**: admin@meetbuddy.ai
- **Password**: admin123

## Features

- Real-time meeting transcription with OpenAI Whisper
- AI-powered meeting summaries using OpenAI GPT
- Meeting management and history
- Platform integrations (Google Meet, Zoom, Teams)
- User management and authentication
- Admin panel with system monitoring
- Real-time WebSocket communication
- File upload and storage
- Comprehensive logging and error tracking

## Troubleshooting

### Backend won't start
- Make sure port 5000 is not in use: `lsof -i :5000`
- Check that the database file has write permissions
- Redis is optional in development mode

### Frontend won't start
- Make sure port 3000 is not in use: `lsof -i :3000`
- Clear browser cache if you see old data
- Check for any TypeScript compilation errors

### Database issues
```bash
cd meetbuddyai/backend
npm run db:push
npm run db:generate
```

### Health check fails
Visit http://localhost:5000/health - should show:
```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "redis": "connected",
    "external_apis": "healthy"
  }
}
```

## Development Notes

- The backend uses SQLite for easy development (no external database needed)
- Redis is optional in development mode (won't fail if not available)
- TypeScript compilation errors are bypassed in dev mode using `tsx`
- All logs are stored in `./backend/logs/`
- Meeting auto-completion runs every 5 minutes
- Health checks run every minute
- Error monitoring and alerting is active

## Next Steps

1. Log in with the default credentials at http://localhost:3000
2. Create a new meeting
3. Start a meeting capture session
4. View AI-generated summaries
5. Explore the admin panel for system monitoring

## API Documentation

Key endpoints:
- `GET /health` - System health check
- `POST /api/auth/login` - User authentication
- `GET /api/meetings` - List meetings
- `POST /api/meetings` - Create meeting
- `POST /api/whisper/start-transcription` - Start live transcription
- `GET /api/admin/analytics` - System analytics (admin only)

For more detailed documentation, see the main README.md file.
