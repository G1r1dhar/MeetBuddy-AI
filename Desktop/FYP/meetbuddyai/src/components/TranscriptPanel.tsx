import React, { useState, useEffect } from 'react';
import { Mic, Clock, Download, Search } from 'lucide-react';
import { Meeting, TranscriptEntry } from '../contexts/MeetingContext';
import { useMeeting } from '../contexts/MeetingContext';

interface TranscriptPanelProps {
  meeting: Meeting;
}

export default function TranscriptPanel({ meeting }: TranscriptPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const { updateMeetingTranscript } = useMeeting();

  useEffect(() => {
    if (meeting.status === 'active') {
      // Simulate real-time transcription
      const interval = setInterval(() => {
        const speakers = ['John Doe', 'Sarah Wilson', 'Mike Johnson'];
        const sampleTexts = [
          'I think we should focus on the user experience improvements for the next quarter.',
          'The analytics show that our conversion rate has improved by 15% this month.',
          'We need to prioritize the mobile app development based on user feedback.',
          'Let me share my screen to show the latest design mockups.',
          'The integration with the new API is progressing well and should be ready next week.',
          'We should schedule a follow-up meeting to discuss the implementation details.'
        ];

        const newEntry: TranscriptEntry = {
          id: Date.now().toString(),
          speaker: speakers[Math.floor(Math.random() * speakers.length)],
          text: sampleTexts[Math.floor(Math.random() * sampleTexts.length)],
          timestamp: new Date(),
          confidence: 0.85 + Math.random() * 0.15
        };

        updateMeetingTranscript(meeting.id, newEntry);
      }, 5000 + Math.random() * 10000);

      return () => clearInterval(interval);
    }
  }, [meeting.status, meeting.id, updateMeetingTranscript]);

  const filteredTranscript = meeting.transcript?.filter(entry =>
    entry.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entry.speaker.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Live Transcript</h3>
          <button className="text-gray-400 hover:text-gray-600 transition-colors">
            <Download className="w-4 h-4" />
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search transcript..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Transcript Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {meeting.status === 'active' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <div className="flex items-center space-x-2 text-green-700">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">Real-time transcription active</span>
            </div>
          </div>
        )}

        {filteredTranscript.length === 0 ? (
          <div className="text-center py-8">
            <Mic className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {meeting.status === 'active' 
                ? 'Waiting for speech to transcribe...' 
                : 'No transcript available'}
            </p>
          </div>
        ) : (
          filteredTranscript.map((entry) => (
            <div key={entry.id} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900 text-sm">{entry.speaker}</span>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span>{formatTime(entry.timestamp)}</span>
                  <span className="bg-gray-200 px-2 py-1 rounded">
                    {Math.round(entry.confidence * 100)}%
                  </span>
                </div>
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">{entry.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
