import React, { useState } from 'react';
import { X, ExternalLink, Bell, AlertCircle, Video } from 'lucide-react';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { scheduleMeeting } = useMeeting();
  const { user } = useAuth();

  if (!isOpen) return null;

  const validateGoogleMeetUrl = (url: string) => {
    // Allow standard meet URLs with optional query parameters/auth users
    const googleMeetPattern = /^https:\/\/meet\.google\.com\/[a-z0-9\-]+(\?.*)?$/i;
    return googleMeetPattern.test(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateGoogleMeetUrl(meetingUrl)) {
      setError('Please enter a valid Google Meet URL (e.g., https://meet.google.com/abc-defg-hij)');
      return;
    }

    // Validate scheduled time is not too far in the past (allow 5 mins for form filling)
    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    const now = new Date();
    if (scheduledDateTime < new Date(now.getTime() - 5 * 60000)) {
      setError('Meeting time must be in the future. Please select a later date and time.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // @ts-ignore
      const _meetingId = await scheduleMeeting(title, description, scheduledDateTime, 'GOOGLE_MEET', meetingUrl);

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

      // Reset form and close modal
      onClose();
      setTitle('');
      setDescription('');
      setScheduledDate('');
      setScheduledTime('');
      setMeetingUrl('');
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to schedule meeting';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="rounded-2xl max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto bg-theme-card border border-theme-card-border shadow-2xl dark:shadow-theme-accent/5">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 transition-colors text-theme-icon hover:text-theme-text"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 rounded-lg bg-theme-accent/20">
            <Video className="w-6 h-6 text-theme-accent" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-theme-text">
              Schedule Google Meet
            </h2>
            <p className="text-sm opacity-70 text-theme-text">
              Add meeting for AI transcript capture
            </p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-lg border bg-red-500/10 border-red-500/30 text-red-500 dark:text-red-400">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-2 text-theme-text">
              Meeting Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent bg-theme-bg border-theme-card-border text-theme-text focus:ring-theme-accent"
              placeholder="Enter meeting title"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-2 text-theme-text">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent resize-none bg-theme-bg border-theme-card-border text-theme-text focus:ring-theme-accent"
              placeholder="Brief description of the meeting"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="date" className="block text-sm font-medium mb-2 text-theme-text">
                Date *
              </label>
              <input
                id="date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent bg-theme-bg border-theme-card-border text-theme-text focus:ring-theme-accent"
                required
              />
            </div>

            <div>
              <label htmlFor="time" className="block text-sm font-medium mb-2 text-theme-text">
                Time *
              </label>
              <input
                id="time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent bg-theme-bg border-theme-card-border text-theme-text focus:ring-theme-accent"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="meetingUrl" className="block text-sm font-medium mb-2 text-theme-text">
              Google Meet URL *
            </label>
            <div className="space-y-2">
              <div className="flex space-x-2">
                <input
                  id="meetingUrl"
                  type="url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent bg-theme-bg border-theme-card-border text-theme-text focus:ring-theme-accent"
                  placeholder="https://meet.google.com/abc-defg-hij"
                  required
                />
                {meetingUrl && (
                  <button
                    type="button"
                    onClick={() => window.open(meetingUrl, '_blank')}
                    className="px-3 py-2 transition-colors text-theme-icon hover:text-theme-accent"
                    title="Test meeting link"
                  >
                    <ExternalLink className="w-5 h-5" />
                  </button>
                )}
              </div>
              {meetingUrl && !validateGoogleMeetUrl(meetingUrl) && (
                <div className="flex items-center space-x-2 text-xs text-red-500 dark:text-red-400">
                  <AlertCircle className="w-3 h-3" />
                  <span>Invalid Google Meet URL format</span>
                </div>
              )}
              <p className="text-xs text-theme-text opacity-50">
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
              className="rounded border-theme-card-border bg-theme-bg text-theme-accent focus:ring-theme-accent"
            />
            <label htmlFor="reminder" className="flex items-center space-x-1 text-sm text-theme-text">
              <Bell className="w-4 h-4" />
              <span>Send reminder 15 minutes before</span>
            </label>
          </div>

          <div className="p-4 rounded-lg bg-theme-accent/5 border border-theme-accent/10">
            <h4 className="text-sm font-medium mb-2 text-theme-accent">
              What happens when scheduled:
            </h4>
            <ul className="text-xs space-y-1 text-theme-text opacity-80">
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
              className="flex-1 px-4 py-2 border rounded-lg transition-colors border-theme-card-border text-theme-text hover:bg-theme-bg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-theme-accent text-black hover:brightness-110"
            >
              {isSubmitting ? 'Scheduling...' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
