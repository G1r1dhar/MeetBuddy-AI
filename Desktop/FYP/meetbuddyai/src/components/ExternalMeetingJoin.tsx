import React, { useState } from 'react';
import { 
  ExternalLink, 
  Play, 
  Video, 
  Mic, 
  Monitor, 
  Brain,
  FileText,
  Download,
  Settings,
  AlertTriangle
} from 'lucide-react';
import { MeetingCaptureService } from '../services/MeetingCapture';
import PlatformIntegration from './PlatformIntegration';
import LiveCapturePanel from './LiveCapturePanel';

interface ExternalMeetingJoinProps {
  onMeetingJoined?: (sessionId: string) => void;
}

export default function ExternalMeetingJoin({ onMeetingJoined }: ExternalMeetingJoinProps) {
  const [meetingUrl, setMeetingUrl] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('google-meet');
  const [isJoining, setIsJoining] = useState(false);
  const [captureStarted, setCaptureStarted] = useState(false);

  const platforms = [
    { id: 'google-meet', name: 'Google Meet', icon: '🎥', color: 'bg-green-500' },
    { id: 'zoom', name: 'Zoom', icon: '📹', color: 'bg-blue-500' },
    { id: 'microsoft-teams', name: 'Microsoft Teams', icon: '💼', color: 'bg-purple-500' },
    { id: 'webex', name: 'Cisco Webex', icon: '🌐', color: 'bg-orange-500' },
    { id: 'discord', name: 'Discord', icon: '🎮', color: 'bg-indigo-500' },
    { id: 'skype', name: 'Skype', icon: '📞', color: 'bg-cyan-500' }
  ];

  const handleJoinMeeting = async () => {
    if (!meetingUrl) return;
    
    setIsJoining(true);
    
    try {
      // Open meeting in new tab
      window.open(meetingUrl, '_blank', 'noopener,noreferrer');
      
      // Wait a moment for user to join
      setTimeout(() => {
        setCaptureStarted(true);
        setIsJoining(false);
      }, 2000);
      
    } catch (error) {
      console.error('Failed to join meeting:', error);
      setIsJoining(false);
    }
  };

  const detectPlatformFromUrl = (url: string) => {
    if (url.includes('meet.google.com')) return 'google-meet';
    if (url.includes('zoom.us')) return 'zoom';
    if (url.includes('teams.microsoft.com')) return 'microsoft-teams';
    if (url.includes('webex.com')) return 'webex';
    if (url.includes('discord.com')) return 'discord';
    if (url.includes('skype.com')) return 'skype';
    return 'google-meet';
  };

  const handleUrlChange = (url: string) => {
    setMeetingUrl(url);
    const detectedPlatform = detectPlatformFromUrl(url);
    setSelectedPlatform(detectedPlatform);
  };

  return (
    <div className="space-y-6">
      {!captureStarted ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-indigo-100 p-2 rounded-lg">
              <ExternalLink className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Join External Meeting</h2>
              <p className="text-sm text-gray-600">Connect to any meeting platform and start recording</p>
            </div>
          </div>

          {/* Platform Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">Select Platform</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {platforms.map(platform => (
                <button
                  key={platform.id}
                  onClick={() => setSelectedPlatform(platform.id)}
                  className={`p-3 border-2 rounded-lg transition-all text-center ${
                    selectedPlatform === platform.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{platform.icon}</div>
                  <div className="text-xs font-medium text-gray-900">{platform.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Meeting URL */}
          <div className="mb-6">
            <label htmlFor="meetingUrl" className="block text-sm font-medium text-gray-700 mb-2">
              Meeting URL
            </label>
            <input
              id="meetingUrl"
              type="url"
              value={meetingUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Features Preview */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 mb-6">
            <h4 className="font-medium text-gray-900 mb-3">What happens when you join:</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center space-x-2 text-indigo-700">
                <Video className="w-4 h-4" />
                <span>HD video recording</span>
              </div>
              <div className="flex items-center space-x-2 text-purple-700">
                <Mic className="w-4 h-4" />
                <span>Real-time transcription</span>
              </div>
              <div className="flex items-center space-x-2 text-green-700">
                <Brain className="w-4 h-4" />
                <span>AI summary generation</span>
              </div>
              <div className="flex items-center space-x-2 text-orange-700">
                <FileText className="w-4 h-4" />
                <span>Topic extraction</span>
              </div>
            </div>
          </div>

          {/* Join Button */}
          <button
            onClick={handleJoinMeeting}
            disabled={!meetingUrl || isJoining}
            className="w-full bg-indigo-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isJoining ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Joining Meeting...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                <span>Join Meeting & Start Recording</span>
              </>
            )}
          </button>

          {/* Instructions */}
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-700">
                <p className="font-medium mb-1">Important Instructions:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Click "Join Meeting" to open the external platform</li>
                  <li>Join the meeting normally on that platform</li>
                  <li>Return to this tab and grant screen/microphone permissions</li>
                  <li>Select the meeting window for screen capture</li>
                  <li>Recording and transcription will start automatically</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <LiveCapturePanel 
          onTranscriptUpdate={(transcript) => console.log('New transcript:', transcript)}
        />
      )}
    </div>
  );
}
