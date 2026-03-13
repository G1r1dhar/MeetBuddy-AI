import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Clock, Download, Search, AlertCircle } from 'lucide-react';
import { Meeting, TranscriptEntry } from '../contexts/MeetingContext';
import { useMeeting } from '../contexts/MeetingContext';
import { whisperService } from '../services/whisperService';
import { useSocket } from '../hooks/useSocket';

interface TranscriptPanelProps {
  meeting: Meeting;
}

export default function TranscriptPanel({ meeting }: TranscriptPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [isConnected, setIsConnected] = useState(false);

  const { updateMeetingTranscript } = useMeeting();
  const socket = useSocket({ meetingId: meeting.id });

  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new transcript entries are added
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [meeting.transcript]);

  // Set up real-time transcript listeners
  useEffect(() => {
    if (!socket.isConnected || !meeting.id) return;

    setIsConnected(socket.isConnected);

    const handleNewTranscriptEntry = (data: { meetingId: string; entry: TranscriptEntry }) => {
      if (data.meetingId === meeting.id) {
        console.log('Received new transcript entry:', data.entry);
        setError(null);
        // The MeetingContext will handle updating the meeting transcript
        // No need to manually update here as it's handled by the context
      }
    };

    const handleTranscriptUpdate = (data: { meetingId: string; transcript: TranscriptEntry }) => {
      if (data.meetingId === meeting.id) {
        console.log('Received transcript update:', data.transcript);
        setError(null);
      }
    };

    const handleTranscriptError = (data: { meetingId: string; error: string }) => {
      if (data.meetingId === meeting.id) {
        console.error('Transcript error:', data.error);
        setError(data.error);
      }
    };

    const handleLiveTranscript = (data: any) => {
      console.log('Received live transcript:', data);
      if (data.meetingId === meeting.id && data.text) {
        // Create a new transcript entry from live data
        const newEntry: Omit<TranscriptEntry, 'id'> = {
          speaker: data.speaker || 'Live Speaker',
          text: data.text,
          timestamp: new Date(),
          confidence: data.confidence || 0.9,
          isFinal: data.isFinal || false,
        } as any;

        updateMeetingTranscript(meeting.id, newEntry);
        setError(null);
      }
    };

    // Listen for real-time transcript events
    socket.on('transcript:new-entry', handleNewTranscriptEntry);
    (socket as any).on('transcript:update', handleTranscriptUpdate);
    (socket as any).on('transcript:error', handleTranscriptError);
    (socket as any).on('live:transcript', handleLiveTranscript);

    return () => {
      socket.off('transcript:new-entry', handleNewTranscriptEntry);
      (socket as any).off('transcript:update', handleTranscriptUpdate);
      (socket as any).off('transcript:error', handleTranscriptError);
      (socket as any).off('live:transcript', handleLiveTranscript);
    };
  }, [socket.isConnected, meeting.id, updateMeetingTranscript, socket]);

  // Start audio capture for real-time transcription
  const startCapture = async () => {
    try {
      setError(null);

      // Check if Whisper is available
      const whisperAvailable = await whisperService.checkWhisperAvailability();
      if (!whisperAvailable) {
        throw new Error('Whisper service is not available. Please check your API configuration.');
      }

      // Request microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        }
      });

      streamRef.current = stream;
      setPermissionStatus('granted');
      setIsCapturing(true);

      // Start Whisper transcription service
      await whisperService.startTranscription(meeting.id);

      // Simulate audio level changes or use real analyser if needed
      const audioInterval = setInterval(() => {
        setAudioLevel(prev => prev > 0 ? 0 : Math.random() * 100);
      }, 100);

      // Store interval ID on stream to clear later
      (stream as any).audioInterval = audioInterval;

      console.log('Audio capture and transcription started');

    } catch (err: any) {
      console.error('Failed to start capture:', err);
      setError(err.message || 'Failed to start audio capture');
      setPermissionStatus('denied');
      setIsCapturing(false);
    }
  };

  // Stop audio capture
  const stopCapture = async () => {
    try {
      if (streamRef.current) {
        if ((streamRef.current as any).audioInterval) {
          clearInterval((streamRef.current as any).audioInterval);
        }
        streamRef.current.getTracks().forEach((track: any) => track.stop());
        streamRef.current = null;
        setAudioLevel(0);
      }

      // Stop Whisper transcription service
      await whisperService.stopTranscription();

      setIsCapturing(false);
      console.log('Audio capture stopped');

    } catch (err: any) {
      console.error('Failed to stop capture:', err);
      setError(err.message || 'Failed to stop audio capture');
    }
  };

  // Export transcript
  const exportTranscript = () => {
    if (!meeting.transcript || meeting.transcript.length === 0) {
      setError('No transcript data to export');
      return;
    }

    const transcriptText = meeting.transcript.map(entry =>
      `[${formatTime(entry.timestamp)}] ${entry.speaker}: ${entry.text}`
    ).join('\n');

    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-transcript-${meeting.id}-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredTranscript = meeting.transcript?.filter(entry =>
    entry.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entry.speaker.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const formatTime = (dateInput: any) => {
    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return '--:--:--';

      return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(date);
    } catch (e) {
      return '--:--:--';
    }
  };

  return (
    <div className="h-full flex flex-col pt-2 transition-colors duration-300">
      {/* Header */}
      <div className="px-4 pb-4 pt-2 border-b border-theme-card-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-theme-text">Live Transcript</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={exportTranscript}
              disabled={!meeting.transcript || meeting.transcript.length === 0}
              className="text-theme-icon hover:text-theme-text transition-colors disabled:opacity-50"
              title="Export transcript"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={isCapturing ? stopCapture : startCapture}
              className={`p-2 rounded-lg transition-colors ${isCapturing
                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                : 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                }`}
              title={isCapturing ? 'Stop transcription' : 'Start transcription'}
            >
              {isCapturing ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center space-x-2 mb-3">
          {isConnected && (
            <div className="flex items-center space-x-1 bg-green-500/20 border border-green-500/30 px-2 py-1 rounded-full">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">Connected</span>
            </div>
          )}
          {isCapturing && (
            <div className={`flex items-center space-x-1 bg-theme-accent/20 border border-theme-accent/30 px-2 py-1 rounded-full ${audioLevel > 50 ? 'animate-pulse' : ''}`}>
              <Mic className="w-3 h-3 text-theme-accent" />
              <span className="text-xs font-medium text-theme-text">Recording {permissionStatus === 'granted' ? '' : '(Permissions Pending)'}</span>
            </div>
          )}
          {meeting.status === 'RECORDING' && (
            <div className="flex items-center space-x-1 bg-red-500/20 border border-red-500/30 px-2 py-1 rounded-full">
              <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-red-500">Meeting Active</span>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-theme-icon" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search transcript..."
            className="w-full pl-9 pr-3 py-2 bg-theme-bg border border-theme-card-border rounded-lg text-sm text-theme-text placeholder-theme-text/40 focus:ring-2 focus:ring-theme-accent focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-500/10 border-b border-red-500/20">
          <div className="flex items-center space-x-2 text-red-500">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Transcript Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {filteredTranscript.length === 0 ? (
          <div className="text-center py-8">
            <Mic className="w-12 h-12 text-theme-icon mx-auto mb-3 opacity-50" />
            <p className="text-theme-text/60">
              {isCapturing
                ? 'Listening for speech to transcribe...'
                : meeting.status === 'RECORDING'
                  ? 'Click the microphone to start transcription'
                  : 'No transcript available'}
            </p>
            {!isCapturing && meeting.status === 'RECORDING' && (
              <button
                onClick={startCapture}
                className="mt-4 bg-theme-accent text-black font-medium px-5 py-2.5 rounded-xl transition-all shadow-[0_4px_14px_0_rgba(255,193,7,0.39)] hover:shadow-[0_6px_20px_rgba(255,193,7,0.23)] hover:brightness-110 transform hover:-translate-y-0.5"
              >
                Start Live Transcription
              </button>
            )}
          </div>
        ) : (
          <>
            {filteredTranscript.map((entry) => (
              <div key={entry.id} className="bg-theme-bg border border-theme-card-border rounded-xl p-4 hover:brightness-95 dark:hover:brightness-110 transition-colors group">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-theme-text text-sm">{entry.speaker}</span>
                  <div className="flex items-center space-x-2 text-xs text-theme-text/60">
                    <Clock className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                    <span>{formatTime(entry.timestamp)}</span>
                    <span className={`px-2 py-0.5 rounded-md font-medium ${entry.confidence > 0.8
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                      : entry.confidence > 0.6
                        ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                      }`}>
                      {Math.round(entry.confidence * 100)}%
                    </span>
                  </div>
                </div>
                <p className="text-theme-text/90 text-sm leading-relaxed">{entry.text}</p>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </>
        )}
      </div>

      {/* Footer with stats */}
      {filteredTranscript.length > 0 && (
        <div className="px-4 py-3 border-t border-theme-card-border bg-theme-bg/50 backdrop-blur-md">
          <div className="flex justify-between text-xs font-medium text-theme-text/60">
            <span>{filteredTranscript.length} entries</span>
            <span>{filteredTranscript.reduce((acc, entry) => acc + entry.text.split(' ').length, 0)} words</span>
          </div>
        </div>
      )}
    </div>
  );
}