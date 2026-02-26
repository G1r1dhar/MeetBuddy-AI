#!/bin/bash

# MeetBuddy AI Local Development Startup Script

echo "🚀 Starting MeetBuddy AI Local Development Environment"
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the meetbuddyai directory"
    exit 1
fi

# Setup backend database
echo "📦 Setting up database..."
cd backend
npm run db:generate > /dev/null 2>&1
npm run db:push > /dev/null 2>&1
echo "✅ Database ready"

# Start backend in background
echo "🔧 Starting Backend Server..."
npm run dev &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 5

# Check if backend is running
if ! curl -s http://localhost:5000/health > /dev/null 2>&1; then
    echo "⚠️  Backend may still be starting up..."
fi

# Start frontend
echo "🎨 Starting Frontend..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "🎉 MeetBuddy AI is starting up!"
echo "================================"
echo "📊 Backend:  http://localhost:5000"
echo "🌐 Frontend: http://localhost:3000"
echo "📈 Health:   http://localhost:5000/health"
echo "📊 Database: SQLite (./backend/prisma/test.db)"
echo ""
echo "💡 Tip: Wait a few seconds for both services to fully start"
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

# Set trap for cleanup
trap cleanup INT TERM

# Keep script running and show status
while true; do
    sleep 10
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "❌ Backend process died unexpectedly"
        kill $FRONTEND_PID 2>/dev/null
        exit 1
    fi
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "❌ Frontend process died unexpectedly"
        kill $BACKEND_PID 2>/dev/null
        exit 1
    fi
done