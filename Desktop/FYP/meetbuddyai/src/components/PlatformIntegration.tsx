import React, { useState, useEffect } from 'react';
import { 
  Video, 
  Mic, 
  Monitor, 
  Play, 
  Square, 
  Settings, 
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Clock,
  Download
} from 'lucide-react';
import { MeetingCaptureService, PlatformIntegration as PlatformIntegrationType, CaptureSession } from '../services/MeetingCapture';

interface PlatformIntegrationProps {
  onCaptureStart?: (sessionId: string) => void;
  onCaptureStop?: (sessionId: string) => void;
  onTranscriptUpdate?: (transcript: string) => void;
}

export default function PlatformIntegration({ 
  onCaptureStart, 
  onCaptureStop, 
  onTranscriptUpdate 
}: PlatformIntegrationProps) {
  const [platforms, setPlatforms] = useState<PlatformIntegrationType[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [activeSession, setActiveSession] = useState<CaptureSession | null>(null);
  const [captureService] = useState(() => MeetingCaptureService.getInstance());

  useEffect(() => {
    loadPlatforms();
    
    // Set up transcript callback
    captureService.onTranscriptUpdate = (final: string, interim: string) => {
      onTranscriptUpdate?.(final || interim);
    };
  }, [captureService, onTranscriptUpdate]);

  const loadPlatforms = async () => {
    const availablePlatforms = await captureService.initializePlatformIntegrations();
    setPlatforms(availablePlatforms);
    if (availablePlatforms.length > 0) {
      setSelectedPlatform(availablePlatforms[0].id);
    }
  };

  const handleStartCapture = async () => {
    if (!selectedPlatform || !meetingUrl) return;
    
    try {
      setIsCapturing(true);
      const sessionId = await captureService.startCapture(selectedPlatform, meetingUrl);
      const session = captureService.getActiveSession(sessionId);
      setActiveSession(session || null);
      onCaptureStart?.(sessionId);
    } catch (error) {
      console.error('Failed to start capture:', error);
      setIsCapturing(false);
    }
  };

  const handleStopCapture = async () => {
    if (!activeSession) return;
    
    try {
      await captureService.stopCapture(activeSession.id);
      setActiveSession(null);
      setIsCapturing(false);
      onCaptureStop?.(activeSession.id);
    } catch (error) {
      console.error('Failed to stop capture:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'ready': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const selectedPlatformData = platforms.find(p => p.id === selectedPlatform);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="bg-indigo-100 p-2 rounded-lg">
          <Video className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Meeting Capture</h2>
          <p className="text-sm text-gray-600">Record and transcribe from external platforms</p>
        </div>
      </div>

      {/* Platform Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">Platform</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {platforms.map(platform => (
            <button
              key={platform.id}
              onClick={() => setSelectedPlatform(platform.id)}
              className={`p-4 border-2 rounded-lg transition-all text-left ${
                selectedPlatform === platform.id
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-lg">{platform.icon}</span>
                  <span className="font-medium text-gray-900">{platform.name}</span>
                </div>
                {getStatusIcon(platform.status)}
              </div>
              <div className="flex space-x-2 text-xs">
                {platform.capabilities.videoCapture && (
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded">Video</span>
                )}
                {platform.capabilities.audioCapture && (
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Audio</span>
                )}
                {platform.capabilities.transcription && (
                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">AI</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Meeting URL Input */}
      <div className="mb-6">
        <label htmlFor="meetingUrl" className="block text-sm font-medium text-gray-700 mb-2">
          Meeting URL
        </label>
        <div className="flex space-x-3">
          <input
            id="meetingUrl"
            type="url"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="Paste your meeting link here..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            disabled={isCapturing}
          />
          <button
            className="px-3 py-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Open meeting in new tab"
          >
            <ExternalLink className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Capture Settings */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Capture Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center space-x-2">
            <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" defaultChecked />
            <div className="flex items-center space-x-1">
              <Video className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">Record Video</span>
            </div>
          </label>
          
          <label className="flex items-center space-x-2">
            <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" defaultChecked />
            <div className="flex items-center space-x-1">
              <Mic className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">Microphone</span>
            </div>
          </label>
          
          <label className="flex items-center space-x-2">
            <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" defaultChecked />
            <div className="flex items-center space-x-1">
              <Monitor className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">Screen Capture</span>
            </div>
          </label>
          
          <label className="flex items-center space-x-2">
            <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" defaultChecked />
            <div className="flex items-center space-x-1">
              <Settings className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">Auto Chapters</span>
            </div>
          </label>
        </div>
      </div>

      {/* Capture Controls */}
      <div className="flex space-x-3 mb-6">
        {!isCapturing ? (
          <button
            onClick={handleStartCapture}
            disabled={!selectedPlatform || !meetingUrl}
            className="flex-1 bg-indigo-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            <Play className="w-5 h-5" />
            <span>Start Capture</span>
          </button>
        ) : (
          <button
            onClick={handleStopCapture}
            className="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all flex items-center justify-center space-x-2"
          >
            <Square className="w-5 h-5" />
            <span>Stop Capture</span>
          </button>
        )}
      </div>

      {/* Active Session Info */}
      {activeSession && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="font-medium text-green-800">Recording Active</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-green-700">
              <Clock className="w-4 h-4" />
              <span>
                {Math.floor((Date.now() - activeSession.startTime.getTime()) / 1000 / 60)}m
              </span>
            </div>
          </div>
          
          <div className="space-y-2 text-sm text-green-700">
            <p><strong>Platform:</strong> {selectedPlatformData?.name}</p>
            <p><strong>Session ID:</strong> {activeSession.id}</p>
            <div className="flex items-center space-x-4">
              <span className={`flex items-center space-x-1 ${activeSession.isRecording ? 'text-green-600' : 'text-gray-500'}`}>
                <Video className="w-3 h-3" />
                <span>Recording</span>
              </span>
              <span className={`flex items-center space-x-1 ${activeSession.isTranscribing ? 'text-green-600' : 'text-gray-500'}`}>
                <Mic className="w-3 h-3" />
                <span>Transcribing</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Platform Integrations Status */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Platform Integrations</h3>
        <div className="space-y-2">
          {platforms.map(platform => (
            <div key={platform.id} className="flex items-center justify-between py-2">
              <div className="flex items-center space-x-3">
                <span className="text-lg">{platform.icon}</span>
                <span className="text-sm font-medium text-gray-900">{platform.name}</span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(platform.status)}
                <span className={`text-xs font-medium capitalize ${
                  platform.status === 'connected' ? 'text-green-600' :
                  platform.status === 'ready' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {platform.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
