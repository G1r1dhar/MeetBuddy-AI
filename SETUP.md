# MeetBuddy AI - Local Development Setup

## Quick Start (Development Mode)

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+

### 1. Database Setup
```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres createdb meetbuddy_ai_dev
sudo -u postgres psql -c "CREATE USER meetbuddy WITH PASSWORD 'password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE meetbuddy_ai_dev TO meetbuddy;"
```

### 2. Redis Setup
```bash
# Install Redis (Ubuntu/Debian)
sudo apt install redis-server

# Start Redis service
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### 3. Backend Setup
```bash
cd meetbuddyai/backend

# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

### 4. Frontend Setup
```bash
cd meetbuddyai

# Install dependencies
npm install

# Start development server
npm run dev
```

## Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Health Check**: http://localhost:5000/health
- **Monitoring Dashboard**: http://localhost:5000/api/monitoring/dashboard

## Features Available

### ✅ Implemented Features
- User authentication and registration
- Meeting creation and management
- Real-time transcription capture
- AI-powered meeting summaries
- File upload and storage
- Platform integrations (OAuth)
- Admin panel
- Security monitoring
- Error tracking and logging
- Performance monitoring

### 🔧 Current Task: Storage Management
Working on Task 13.1: "Implement storage quota management"
- Storage usage tracking per user
- Storage limit enforcement with notifications
- Cleanup utilities for old meeting data

## Development Notes

The project uses:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Express.js + TypeScript + Prisma + PostgreSQL
- **Real-time**: Socket.io
- **Authentication**: JWT + bcrypt
- **File Storage**: Local filesystem with cloud storage support
- **Monitoring**: Winston logging + custom error monitoring
- **Testing**: Vitest + Property-based testing with fast-check

## Environment Variables

Key environment variables needed:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string  
- `JWT_SECRET`: JWT signing secret
- `OPENAI_API_KEY`: For AI summaries (optional for development)