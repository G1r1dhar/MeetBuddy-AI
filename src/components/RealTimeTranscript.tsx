/**
 * RealTimeTranscript — Live speech-to-text using backend Whisper Service
 *
 * Uses whisperService to capture audio and stream to backend,
 * receiving transcript updates via Socket.IO
 *
 * Props:
 *   meetingId   – required for backend processing
 *   isRecording – controlled by parent; when true, recognition runs automatically
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Download,
  Search,
  Clock,
  User,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { whisperService } from '../services/whisperService';

import { useMeeting, type TranscriptEntry } from '../contexts/MeetingContext';


interface RealTimeTranscriptProps {
  meetingId?: string;
  isRecording?: boolean;
}

export default function RealTimeTranscript({ meetingId, isRecording }: RealTimeTranscriptProps) {
  const { meetings } = useMeeting();
  const meeting = meetings.find(m => m.id === meetingId);
  const transcript: TranscriptEntry[] = meeting?.transcript || [];

  const [isListening, setIsListening] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);


  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // We don't need a custom socket listener here anymore because MeetingContext 
  // already listens to 'transcript:new-entry' and updates meeting.transcript.


  // Core recognition management
  const stopRecognition = useCallback(async () => {
    try {
      await whisperService.stopTranscription();
    } catch (err) {
      console.warn('Error stopping transcription:', err);
    } finally {
      setIsListening(false);
    }
  }, []);

  const startRecognition = useCallback(async () => {
    if (!meetingId) {
      setError('Cannot start transcription without a meeting ID.');
      return;
    }

    try {
      setError(null);
      setIsListening(true);
      await whisperService.startTranscription(meetingId);
    } catch (err: any) {
      console.error('Failed to start Whisper transcription:', err);
      setError(err.message || 'Could not start speech recognition. Please check your microphone permissions.');
      setIsListening(false);
    }
  }, [meetingId]);

  // Sync with parent `isRecording` prop
  useEffect(() => {
    if (isRecording && !isListening) {
      startRecognition();
    } else if (!isRecording && isListening) {
      stopRecognition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isListening) stopRecognition();
    };
  }, [isListening, stopRecognition]);

  // Manual toggle
  const toggleListening = () => {
    if (isListening) {
      stopRecognition();
    } else {
      startRecognition();
    }
  };

  // Export
  const exportTranscript = () => {
    const text = transcript
      .map(e => `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.speaker}: ${e.text}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtering
  const filteredTranscript = transcript.filter(entry => {
    const matchesSearch =
      entry.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.speaker.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpeaker = selectedSpeaker === 'all' || entry.speaker === selectedSpeaker;
    return matchesSearch && matchesSpeaker;
  });

  const uniqueSpeakers = Array.from(new Set(transcript.map(e => e.speaker)));

  // UI
  return (
    <div className="h-full flex flex-col pt-2">
      {/* Header */}
      <div className="px-4 pb-4 pt-2 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold text-white">Live Transcript</h3>
            {isListening && (
              <div className="flex items-center space-x-1.5 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-emerald-300">LIVE</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={exportTranscript}
              disabled={transcript.length === 0}
              className="text-slate-400 hover:text-white transition-colors disabled:opacity-30"
              title="Export transcript"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={toggleListening}
              className={`p-2 rounded-lg transition-colors ${isListening
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                }`}
              title={isListening ? 'Stop listening' : 'Start listening'}
            >
              {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-3 p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-rose-300">{error}</p>
          </div>
        )}

        {/* Search and Speaker Filter */}
        <div className="flex space-x-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search transcript..."
              className="w-full pl-8 pr-3 py-1.5 bg-black/20 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          <select
            value={selectedSpeaker}
            onChange={e => setSelectedSpeaker(e.target.value)}
            className="bg-black/20 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="all" className="bg-slate-900 text-white">All Speakers</option>
            {uniqueSpeakers.map(s => (
              <option key={s} value={s} className="bg-slate-900 text-white">
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Transcript body */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {filteredTranscript.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center">
            <div>
              <Mic className="w-10 h-10 text-slate-600 opacity-50 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">
                {isListening
                  ? 'Listening… start speaking!'
                  : 'Click the 🎤 button above to start transcription'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTranscript.map(entry => (
              <div
                key={entry.id}
                className="rounded-xl p-4 transition-all bg-white/5 border border-white/5 hover:bg-white/10 group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="font-semibold text-indigo-300 text-sm">{entry.speaker}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <Clock className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                    <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
                <p className="mt-2 text-slate-300 text-sm leading-relaxed">{entry.text}</p>
              </div>
            ))}

            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-4 py-3 border-t border-white/10 bg-black/20 backdrop-blur-md">
        <div className="flex items-center justify-between text-xs font-medium text-slate-400">
          <span>
            {transcript.length} entries •{' '}
            {transcript.reduce((a, e) => a + e.text.split(' ').length, 0)} words
          </span>
          {isListening ? (
            <div className="flex items-center space-x-1.5 text-emerald-400">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="font-bold">Listening</span>
            </div>
          ) : (
            <span className="text-slate-500">Stopped</span>
          )}
        </div>
      </div>
    </div>
  );
}
