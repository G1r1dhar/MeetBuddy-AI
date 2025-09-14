import React, { useState } from 'react';
import { Bell, Calendar, Info, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface UserNotification {
  id: string;
  title: string;
  message: string;
  type: 'meeting' | 'system' | 'reminder';
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
}

export default function NotificationPanel() {
  const [notifications, setNotifications] = useState<UserNotification[]>([
    {
      id: '1',
      title: 'Meeting Reminder',
      message: 'Your "Product Strategy Review" meeting starts in 15 minutes',
      type: 'meeting',
      timestamp: new Date(Date.now() - 300000),
      read: false,
      actionUrl: '/meeting/1'
    },
    {
      id: '2',
      title: 'AI Summary Ready',
      message: 'Your meeting summary and mind map for "Team Standup" is now available',
      type: 'system',
      timestamp: new Date(Date.now() - 3600000),
      read: false
    },
    {
      id: '3',
      title: 'Storage Alert',
      message: 'You\'re using 80% of your storage quota. Consider upgrading your plan.',
      type: 'system',
      timestamp: new Date(Date.now() - 86400000),
      read: true
    },
    {
      id: '4',
      title: 'New Features Available',
      message: 'Enhanced real-time transcription and improved mind mapping features are now live!',
      type: 'system',
      timestamp: new Date(Date.now() - 172800000),
      read: true
    }
  ]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'meeting': return <Calendar className="w-4 h-4 text-blue-500" />;
      case 'reminder': return <Clock className="w-4 h-4 text-orange-500" />;
      case 'system': return <Info className="w-4 h-4 text-purple-500" />;
      default: return <Bell className="w-4 h-4 text-gray-500" />;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Bell className="w-5 h-5 text-gray-600" />
          <span className="font-medium text-gray-900">Notifications</span>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No notifications yet</p>
          </div>
        ) : (
          notifications.map(notification => (
            <div
              key={notification.id}
              className={`p-4 rounded-lg border transition-all cursor-pointer ${
                notification.read 
                  ? 'bg-gray-50 border-gray-200' 
                  : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
              }`}
              onClick={() => markAsRead(notification.id)}
            >
              <div className="flex items-start space-x-3">
                <div className="mt-1">
                  {getTypeIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className={`text-sm font-medium ${
                      notification.read ? 'text-gray-700' : 'text-gray-900'
                    }`}>
                      {notification.title}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {new Intl.DateTimeFormat('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      }).format(notification.timestamp)}
                    </span>
                  </div>
                  <p className={`text-sm ${
                    notification.read ? 'text-gray-500' : 'text-gray-700'
                  }`}>
                    {notification.message}
                  </p>
                  {notification.actionUrl && (
                    <button className="text-xs text-indigo-600 hover:text-indigo-700 mt-2 transition-colors">
                      View Details →
                    </button>
                  )}
                </div>
                {!notification.read && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Notification Settings */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Notification Preferences</h4>
        <div className="space-y-2">
          <label className="flex items-center">
            <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" defaultChecked />
            <span className="ml-2 text-sm text-gray-700">Meeting reminders</span>
          </label>
          <label className="flex items-center">
            <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" defaultChecked />
            <span className="ml-2 text-sm text-gray-700">AI summary notifications</span>
          </label>
          <label className="flex items-center">
            <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" defaultChecked />
            <span className="ml-2 text-sm text-gray-700">System updates</span>
          </label>
          <label className="flex items-center">
            <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="ml-2 text-sm text-gray-700">Marketing emails</span>
          </label>
        </div>
      </div>
    </div>
  );
}
