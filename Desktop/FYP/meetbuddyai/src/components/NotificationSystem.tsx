import React, { useState, useEffect } from 'react';
import { Bell, X, Calendar, Clock, ExternalLink } from 'lucide-react';
import { useMeeting } from '../contexts/MeetingContext';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'meeting-reminder' | 'meeting-scheduled' | 'admin-message';
  timestamp: Date;
  meetingId?: string;
  read: boolean;
}

export default function NotificationSystem() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const { meetings } = useMeeting();

  useEffect(() => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Check for upcoming meetings and create notifications
    const checkUpcomingMeetings = () => {
      const now = new Date();
      const in15Minutes = new Date(now.getTime() + 15 * 60 * 1000);
      
      meetings.forEach(meeting => {
        if (meeting.status === 'scheduled' && 
            meeting.scheduledTime <= in15Minutes && 
            meeting.scheduledTime > now) {
          
          const existingNotification = notifications.find(n => 
            n.meetingId === meeting.id && n.type === 'meeting-reminder'
          );
          
          if (!existingNotification) {
            const notification: Notification = {
              id: `reminder-${meeting.id}`,
              title: 'Meeting Reminder',
              message: `"${meeting.title}" starts in 15 minutes`,
              type: 'meeting-reminder',
              timestamp: new Date(),
              meetingId: meeting.id,
              read: false
            };
            
            setNotifications(prev => [notification, ...prev]);
            
            // Show browser notification
            if (Notification.permission === 'granted') {
              new Notification(notification.title, {
                body: notification.message,
                icon: '/vite.svg'
              });
            }
          }
        }
      });
    };

    // Check every minute
    const interval = setInterval(checkUpcomingMeetings, 60000);
    checkUpcomingMeetings(); // Initial check

    return () => clearInterval(interval);
  }, [meetings, notifications]);

  // Add notification when meeting is scheduled
  useEffect(() => {
    const latestMeeting = meetings[meetings.length - 1];
    if (latestMeeting && latestMeeting.status === 'scheduled') {
      const existingNotification = notifications.find(n => 
        n.meetingId === latestMeeting.id && n.type === 'meeting-scheduled'
      );
      
      if (!existingNotification) {
        const notification: Notification = {
          id: `scheduled-${latestMeeting.id}`,
          title: 'Meeting Scheduled',
          message: `"${latestMeeting.title}" has been scheduled for ${new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }).format(latestMeeting.scheduledTime)}`,
          type: 'meeting-scheduled',
          timestamp: new Date(),
          meetingId: latestMeeting.id,
          read: false
        };
        
        setNotifications(prev => [notification, ...prev]);
      }
    }
  }, [meetings]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'meeting-reminder': return <Clock className="w-4 h-4 text-orange-500" />;
      case 'meeting-scheduled': return <Calendar className="w-4 h-4 text-blue-500" />;
      case 'admin-message': return <Bell className="w-4 h-4 text-purple-500" />;
      default: return <Bell className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount}
          </div>
        )}
      </button>

      {showNotifications && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              <button
                onClick={() => setShowNotifications(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center">
                <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                    !notification.read ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start space-x-3">
                    {getTypeIcon(notification.type)}
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-medium ${
                        notification.read ? 'text-gray-700' : 'text-gray-900'
                      }`}>
                        {notification.title}
                      </h4>
                      <p className={`text-sm mt-1 ${
                        notification.read ? 'text-gray-500' : 'text-gray-700'
                      }`}>
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Intl.DateTimeFormat('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        }).format(notification.timestamp)}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
