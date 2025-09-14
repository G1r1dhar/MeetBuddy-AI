import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Download, 
  Search, 
  Filter,
  Clock,
  User,
  Activity,
  Zap
} from 'lucide-react';

interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: Date;
  confidence: number;
  platform: string;
  isLive?: boolean;
}

interface RealTimeTranscriptProps {
  meetingId?: string;
  isRecording?: boolean;
}

export default function RealTimeTranscript({ meetingId, isRecording }: RealTimeTranscriptProps) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('all');
  const [interimText, setInterimText] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRecording) {
      startRealTimeTranscription();
    } else {
      stopRealTimeTranscription();
    }

    return () => stopRealTimeTranscription();
  }, [isRecording]);

  useEffect(() => {
    // Auto-scroll to bottom when new transcript entries are added
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, interimText]);

  const startRealTimeTranscription = () => {
    setIsListening(true);
    
    // Simulate real-time transcript from external meeting platforms
    const simulateTranscript = () => {
      const speakers = [
        'John Smith (Google Meet)',
        'Sarah Wilson (Google Meet)', 
        'Mike Johnson (Google Meet)',
        'Emily Davis (Google Meet)',
        'Alex Chen (Google Meet)'
      ];
      
      const sampleTexts = [
        "Let's start by reviewing the quarterly objectives we discussed last week.",
        "I think we should prioritize the user experience improvements for the mobile app.",
        "The analytics data shows a 25% increase in user engagement this month.",
        "We need to address the performance issues before the next release.",
        "I'll take the action item to follow up with the design team on the new mockups.",
        "Can everyone see the screen share? I want to walk through the latest prototypes.",
        "The integration with the new API is progressing well and should be ready by Friday.",
        "Let's schedule a follow-up meeting to discuss the implementation details.",
        "I have some concerns about the timeline for the Q4 deliverables.",
        "The customer feedback has been overwhelmingly positive for the new features."
      ];

      const addTranscriptEntry = () => {
        if (!isRecording) return;
        
        const speaker = speakers[Math.floor(Math.random() * speakers.length)];
        const text = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
        
        const entry: TranscriptEntry = {
          id: `transcript_${Date.now()}`,
          speaker,
          text,
          timestamp: new Date(),
          confidence: 0.85 + Math.random() * 0.15,
          platform: 'Google Meet',
          isLive: true
        };

        setTranscript(prev => [...prev, entry]);
        
        // Schedule next entry
        setTimeout(addTranscriptEntry, 3000 + Math.random() * 7000);
      };

      // Start the simulation
      setTimeout(addTranscriptEntry, 2000);
    };

    simulateTranscript();
  };

  const stopRealTimeTranscription = () => {
    setIsListening(false);
    setInterimText('');
  };

  const filteredTranscript = transcript.filter(entry => {
    const matchesSearch = entry.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         entry.speaker.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpeaker = selectedSpeaker === 'all' || entry.speaker.includes(selectedSpeaker);
    return matchesSearch && matchesSpeaker;
  });

  const uniqueSpeakers = Array.from(new Set(transcript.map(entry => entry.speaker.split(' (')[0])));

  const exportTranscript = () => {
    const transcriptText = transcript.map(entry => 
      `[${entry.timestamp.toLocaleTimeString()}] ${entry.speaker}: ${entry.text}`
    ).join('\n');
    
    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-transcript-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold text-gray-900">Live Transcript</h3>
            {isListening && (
              <div className="flex items-center space-x-1 bg-green-100 px-2 py-1 rounded-full">
                <Activity className="w-3 h-3 text-green-600 animate-pulse" />
                <span className="text-xs font-medium text-green-700">LIVE</span>
              </div>
            )}
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={exportTranscript}
              disabled={transcript.length === 0}
              className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              title="Export transcript"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsListening(!isListening)}
              className={`p-2 rounded-lg transition-colors ${
                isListening 
                  ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
              title={isListening ? 'Stop listening' : 'Start listening'}
            >
              {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex space-x-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search transcript..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          
          <select
            value={selectedSpeaker}
            onChange={(e) => setSelectedSpeaker(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="all">All Speakers</option>
            {uniqueSpeakers.map(speaker => (
              <option key={speaker} value={speaker}>{speaker}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Transcript Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredTranscript.length === 0 && !interimText ? (
          <div className="h-full flex items-center justify-center text-center">
            <div>
              <Mic className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {isListening ? 'Listening for speech from external meeting...' : 'Start recording to see live transcript'}
              </p>
              <p className="text-gray-400 text-sm mt-2">
                Supports Google Meet, Zoom, Teams, and more
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTranscript.map((entry) => (
              <div 
                key={entry.id} 
                className={`rounded-lg p-3 transition-all ${
                  entry.isLive ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-900 text-sm">{entry.speaker}</span>
                    {entry.isLive && (
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{entry.timestamp.toLocaleTimeString()}</span>
                    <span className="bg-gray-200 px-2 py-1 rounded">
                      {Math.round(entry.confidence * 100)}%
                    </span>
                  </div>
                </div>
                <p className="text-gray-700 text-sm leading-relaxed">{entry.text}</p>
              </div>
            ))}
            
            {/* Interim text (currently being spoken) */}
            {interimText && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Zap className="w-4 h-4 text-blue-500 animate-pulse" />
                  <span className="font-medium text-blue-700 text-sm">Speaking...</span>
                </div>
                <p className="text-blue-600 text-sm italic">{interimText}</p>
              </div>
            )}
            
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4 text-gray-600">
            <span>{transcript.length} entries</span>
            <span>•</span>
            <span>{transcript.reduce((acc, entry) => acc + entry.text.split(' ').length, 0)} words</span>
          </div>
          
          {isListening && (
            <div className="flex items-center space-x-2 text-green-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium">Recording from external platform</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
