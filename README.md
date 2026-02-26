# MeetBuddy AI

The intelligent assistant for your video conferencing sessions.

MeetBuddy AI is a comprehensive full-stack web application designed to streamline your meeting workflow. By seamlessly integrating with multiple video conferencing platforms (Google Meet, Zoom, Teams, etc.), it captures real-time transcripts, generates AI-powered summaries, and provides powerful insights to help you stay organized and productive.

## Features

### 🤖 AI-Powered Summaries
Automatically generates concise and accurate summaries of your meetings, saving you time and ensuring you never miss a key decision or action item.

### 🎙️ Live Transcription
Get real-time, accurate transcriptions of your meetings with speaker identification and confidence scoring.

### 📊 Meeting Management Dashboard
A central hub to view, manage, and access all your meeting transcripts and summaries with advanced search and filtering.

### 🔗 Multi-Platform Integration
Support for Google Meet, Zoom, Microsoft Teams, Webex, Discord, and Skype.

### 👥 Admin Panel
Comprehensive administrative interface for user management, analytics, and system monitoring.

### 🔒 Enterprise Security
JWT-based authentication, encrypted data storage, and comprehensive audit logging.

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **React Router** for navigation
- **React Query** for API state management
- **Socket.io Client** for real-time features

### Backend
- **Node.js** with Express.js
- **TypeScript** for type safety
- **PostgreSQL** with Prisma ORM
- **Redis** for caching and sessions
- **Socket.io** for real-time communication
- **JWT** for authentication

### AI & Integrations
- **OpenAI API** for meeting summaries
- **Google Cloud Speech-to-Text** for transcription
- **OAuth 2.0** for platform integrations

## Getting Started

### Prerequisites
- Node.js (v18.x or higher)
- PostgreSQL (v14 or higher)
- Redis (v6 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/G1r1dhar/MEETBUDDY-AI-FYP-2026.git
cd MEETBUDDY-AI-FYP-2026
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Set up the database**
```bash
# Install and start PostgreSQL
# Install and start Redis
# Update DATABASE_URL in .env
```

5. **Run the development server**
```bash
# Frontend (Vite dev server)
npm run dev

# Backend (when implemented)
npm run dev:server
```

### Environment Configuration

Copy `.env.example` to `.env` and configure the following:

- **Database**: PostgreSQL connection string
- **Redis**: Redis connection URL
- **JWT**: Secret key for token signing
- **OpenAI**: API key for AI summaries
- **Google Cloud**: API keys for speech recognition
- **OAuth**: Client IDs and secrets for platform integrations

## Development Scripts

```bash
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run test         # Run tests with Vitest
npm run test:ui      # Run tests with UI
```

## Project Structure

```
meetbuddyai/
├── src/
│   ├── components/     # Reusable UI components
│   ├── contexts/       # React contexts
│   ├── pages/          # Page components
│   ├── services/       # API and external services
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility functions
│   ├── test/           # Test utilities and setup
│   └── types/          # TypeScript type definitions
├── backend/            # Backend API server (to be implemented)
├── public/             # Static assets
├── .env.example        # Environment variables template
└── vite.config.ts      # Vite configuration
```

## Testing

The project uses Vitest for testing with property-based testing using fast-check:

```bash
npm run test           # Run all tests
npm run test:ui        # Run tests with UI
npm run test:coverage  # Run tests with coverage
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

**Author:** Bhaikar Giridhar  
**Email:** giridhar2k20@gmail.com  
**GitHub:** [G1r1dhar](https://github.com/G1r1dhar)
