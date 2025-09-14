import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Square, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor,
  Download,
  Settings,
  Users,
  Clock,
  Activity,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { MeetingCaptureService, CaptureSession, TranscriptEntry } from '../services/MeetingCapture';

interface LiveCapturePanelProps {
  meetingId?: string;
  onTranscriptUpdate?: (transcript: string) => void;
}

export default function LiveCapturePanel({ meetingId, onTranscriptUpdate }: LiveCapturePanelProps) {
  const [captureService] = useState(() => MeetingCaptureService.getInstance());
  const [isCapturing, setIsCapturing] = useState(false);
  const [activeSession, setActiveSession] = useState<CaptureSession | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);
  const [interimText, setInterimText] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);

  useEffect(() => {
    // Set up event listeners
    captureService.onTranscriptUpdate = (final: string, interim: string) => {
      if (final) {
        const newEntry: TranscriptEntry = {
          id: `live_${Date.now()}`,
          speaker: 'Live Speaker',
          text: final,
          timestamp: new Date(),
          confidence: 0.9,
          isFinal: true
        };
        setLiveTranscript(prev => [...prev, newEntry]);
        onTranscriptUpdate?.(final);
      }
      setInterimText(interim);
    };

    captureService.onParticipantJoin = (participant: string) => {
      setParticipants(prev => [...prev, participant]);
    };

    captureService.onRecordingComplete = (recordingUrl: string, transcript: TranscriptEntry[]) => {
      console.log('Recording completed:', recordingUrl);
      setLiveTranscript(transcript);
    };

    return () => {
      // Cleanup
      captureService.onTranscriptUpdate = undefined;
      captureService.onParticipantJoin = undefined;
      captureService.onRecordingComplete = undefined;
    };
  }, [captureService, onTranscriptUpdate]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCapturing && activeSession) {
      interval = setInterval(() => {
        const duration = Math.floor((Date.now() - activeSession.startTime.getTime()) / 1000);
        setRecordingDuration(duration);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isCapturing, activeSession]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartCapture = async (platform: string, meetingUrl: string) => {
    try {
      setIsCapturing(true);
      const sessionId = await captureService.startCapture(platform, meetingUrl);
      const session = captureService.getActiveSession(sessionId);
      setActiveSession(session || null);
      setLiveTranscript([]);
      setParticipants([]);
      setRecordingDuration(0);
    } catch (error) {
      console.error('Failed to start capture:', error);
      setIsCapturing(false);
      alert('Failed to start capture. Please ensure you grant the necessary permissions.');
    }
  };

  const handleStopCapture = async () => {
    if (!activeSession) return;
    
    try {
      await captureService.stopCapture(activeSession.id);
      setActiveSession(null);
      setIsCapturing(false);
      setInterimText('');
    } catch (error) {
      console.error('Failed to stop capture:', error);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="bg-red-100 p-2 rounded-lg">
            <Video className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Live Capture</h2>
            <p className="text-sm text-gray-600">Real-time recording and transcription</p>
          </div>
        </div>
        
        {isCapturing && (
          <div className="flex items-center space-x-2 bg-red-50 px-3 py-2 rounded-lg">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-red-700">LIVE</span>
            <span className="text-sm text-red-600">{formatDuration(recordingDuration)}</span>
          </div>
        )}
      </div>

      {/* Capture Status */}
      {activeSession && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-800">Capture Active</span>
            </div>
            <div className="flex items-center space-x-4 text-sm text-green-700">
              <div className="flex items-center space-x-1">
                <Video className="w-4 h-4" />
                <span>Recording</span>
              </div>
              <div className="flex items-center space-x-1">
                <Mic className="w-4 h-4" />
                <span>Transcribing</span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-green-700 font-medium">Platform:</span>
              <span className="text-green-600 ml-2">{activeSession.platform}</span>
            </div>
            <div>
              <span className="text-green-700 font-medium">Participants:</span>
              <span className="text-green-600 ml-2">{participants.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Live Transcript */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Live Transcript</h3>
          <div className="flex space-x-2">
            <button className="text-gray-400 hover:text-gray-600 transition-colors">
              <Download className="w-4 h-4" />
            </button>
            <button className="text-gray-400 hover:text-gray-600 transition-colors">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 h-64 overflow-y-auto">
          {liveTranscript.length === 0 && !interimText ? (
            <div className="h-full flex items-center justify-center text-center">
              <div>
                <Mic className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">
                  {isCapturing ? 'Listening for speech...' : 'Start capture to see live transcript'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {liveTranscript.map(entry => (
                <div key={entry.id} className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 text-sm">{entry.speaker}</span>
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>{entry.timestamp.toLocaleTimeString()}</span>
                      <span className="bg-gray-200 px-2 py-1 rounded">
                        {Math.round(entry.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-gray-700 text-sm">{entry.text}</p>
                </div>
              ))}
              
              {/* Interim text */}
              {interimText && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 mb-1">
                    <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
                    <span className="font-medium text-blue-700 text-sm">Speaking...</span>
                  </div>
                  <p className="text-blue-600 text-sm italic">{interimText}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Participants */}
      {participants.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Detected Participants</h3>
          <div className="flex flex-wrap gap-2">
            {participants.map((participant, index) => (
              <div key={index} className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium">
                {participant}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capture Controls */}
      <div className="flex space-x-3">
        {!isCapturing ? (
          <button
            onClick={() => {
              // For demo, use sample data
              handleStartCapture('google-meet', 'https://meet.google.com/abc-defg-hij');
            }}
            className="flex-1 bg-indigo-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2"
          >
            <Play className="w-5 h-5" />
            <span>Start Live Capture</span>
          </button>
        ) : (
          <button
            onClick={handleStopCapture}
            className="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center space-x-2"
          >
            <Square className="w-5 h-5" />
            <span>Stop Capture</span>
          </button>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-2">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">How to use Live Capture:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Join your meeting on the external platform (Google Meet, Zoom, etc.)</li>
              <li>Click "Start Live Capture" and grant screen/microphone permissions</li>
              <li>Select the meeting window when prompted for screen sharing</li>
              <li>The system will automatically record video and transcribe audio</li>
              <li>View real-time transcript and AI analysis in the panels</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
