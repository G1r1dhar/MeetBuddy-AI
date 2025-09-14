import React, { useState } from 'react';
import { X, Calendar, Clock, ExternalLink, Bell, AlertCircle, Video } from 'lucide-react';
import { useMeeting } from '../contexts/MeetingContext';
import { useAuth } from '../contexts/AuthContext';

interface ScheduleMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ScheduleMeetingModal({ isOpen, onClose }: ScheduleMeetingModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [enableReminder, setEnableReminder] = useState(true);
  const { scheduleMeeting } = useMeeting();
  const { user } = useAuth();

  if (!isOpen) return null;

  const validateGoogleMeetUrl = (url: string) => {
    const googleMeetPattern = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
    return googleMeetPattern.test(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateGoogleMeetUrl(meetingUrl)) {
      alert('Please enter a valid Google Meet URL (e.g., https://meet.google.com/abc-defg-hij)');
      return;
    }
    
    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    const meetingId = scheduleMeeting(title, description, scheduledDateTime, meetingUrl);
    
    // Schedule notification if enabled
    if (enableReminder) {
      const reminderTime = scheduledDateTime.getTime() - Date.now() - (15 * 60 * 1000);
      if (reminderTime > 0) {
        setTimeout(() => {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`Google Meet Reminder: ${title}`, {
              body: `Your meeting starts in 15 minutes`,
              icon: '/vite.svg'
            });
          }
        }, reminderTime);
      }
    }
    
    onClose();
    setTitle('');
    setDescription('');
    setScheduledDate('');
    setScheduledTime('');
    setMeetingUrl('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`rounded-2xl max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto ${
        user?.darkMode 
          ? 'bg-gray-900 border border-yellow-500/20 shadow-lg shadow-yellow-500/10' 
          : 'bg-white'
      }`}>
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 transition-colors ${
            user?.darkMode 
              ? 'text-gray-400 hover:text-white' 
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className={`p-2 rounded-lg ${
            user?.darkMode ? 'bg-yellow-500/20' : 'bg-green-100'
          }`}>
            <Video className={`w-6 h-6 ${
              user?.darkMode ? 'text-yellow-400' : 'text-green-600'
            }`} />
          </div>
          <div>
            <h2 className={`text-xl font-semibold ${
              user?.darkMode ? 'text-yellow-400' : 'text-gray-900'
            }`}>
              Schedule Google Meet
            </h2>
            <p className={`text-sm ${
              user?.darkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Add meeting for AI transcript capture
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className={`block text-sm font-medium mb-2 ${
              user?.darkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Meeting Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${
                user?.darkMode 
                  ? 'bg-gray-800 border-yellow-500/30 text-white focus:ring-yellow-500' 
                  : 'border-gray-300 focus:ring-green-500'
              }`}
              placeholder="Enter meeting title"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className={`block text-sm font-medium mb-2 ${
              user?.darkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent resize-none ${
                user?.darkMode 
                  ? 'bg-gray-800 border-yellow-500/30 text-white focus:ring-yellow-500' 
                  : 'border-gray-300 focus:ring-green-500'
              }`}
              placeholder="Brief description of the meeting"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="date" className={`block text-sm font-medium mb-2 ${
                user?.darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Date *
              </label>
              <input
                id="date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${
                  user?.darkMode 
                    ? 'bg-gray-800 border-yellow-500/30 text-white focus:ring-yellow-500' 
                    : 'border-gray-300 focus:ring-green-500'
                }`}
                required
              />
            </div>

            <div>
              <label htmlFor="time" className={`block text-sm font-medium mb-2 ${
                user?.darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Time *
              </label>
              <input
                id="time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${
                  user?.darkMode 
                    ? 'bg-gray-800 border-yellow-500/30 text-white focus:ring-yellow-500' 
                    : 'border-gray-300 focus:ring-green-500'
                }`}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="meetingUrl" className={`block text-sm font-medium mb-2 ${
              user?.darkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Google Meet URL *
            </label>
            <div className="space-y-2">
              <div className="flex space-x-2">
                <input
                  id="meetingUrl"
                  type="url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${
                    user?.darkMode 
                      ? 'bg-gray-800 border-yellow-500/30 text-white focus:ring-yellow-500' 
                      : 'border-gray-300 focus:ring-green-500'
                  }`}
                  placeholder="https://meet.google.com/abc-defg-hij"
                  required
                />
                {meetingUrl && (
                  <button
                    type="button"
                    onClick={() => window.open(meetingUrl, '_blank')}
                    className={`px-3 py-2 transition-colors ${
                      user?.darkMode 
                        ? 'text-gray-400 hover:text-yellow-400' 
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                    title="Test meeting link"
                  >
                    <ExternalLink className="w-5 h-5" />
                  </button>
                )}
              </div>
              {meetingUrl && !validateGoogleMeetUrl(meetingUrl) && (
                <div className={`flex items-center space-x-2 text-xs ${
                  user?.darkMode ? 'text-red-400' : 'text-red-600'
                }`}>
                  <AlertCircle className="w-3 h-3" />
                  <span>Invalid Google Meet URL format</span>
                </div>
              )}
              <p className={`text-xs ${
                user?.darkMode ? 'text-gray-500' : 'text-gray-500'
              }`}>
                Example: https://meet.google.com/abc-defg-hij
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="reminder"
              type="checkbox"
              checked={enableReminder}
              onChange={(e) => setEnableReminder(e.target.checked)}
              className={`rounded border-gray-300 focus:ring-2 ${
                user?.darkMode 
                  ? 'text-yellow-500 focus:ring-yellow-500' 
                  : 'text-green-600 focus:ring-green-500'
              }`}
            />
            <label htmlFor="reminder" className={`flex items-center space-x-1 text-sm ${
              user?.darkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              <Bell className="w-4 h-4" />
              <span>Send reminder 15 minutes before</span>
            </label>
          </div>

          <div className={`p-4 rounded-lg ${
            user?.darkMode 
              ? 'bg-yellow-500/10 border border-yellow-500/20' 
              : 'bg-green-50'
          }`}>
            <h4 className={`text-sm font-medium mb-2 ${
              user?.darkMode ? 'text-yellow-400' : 'text-green-900'
            }`}>
              What happens when scheduled:
            </h4>
            <ul className={`text-xs space-y-1 ${
              user?.darkMode ? 'text-yellow-300' : 'text-green-700'
            }`}>
              <li>• Meeting added to your calendar with notification</li>
              <li>• Reminder sent 15 minutes before meeting time</li>
              <li>• Ready to capture real-time transcript from Google Meet</li>
              <li>• AI summary, notes, and insights generated automatically</li>
              <li>• Meeting notes available for editing after completion</li>
            </ul>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-2 border rounded-lg transition-colors ${
                user?.darkMode 
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700' 
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                user?.darkMode 
                  ? 'bg-yellow-500 text-black hover:bg-yellow-400' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              Schedule Meeting
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
