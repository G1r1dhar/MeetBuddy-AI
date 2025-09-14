import React, { useState } from 'react';
import { 
  Mail, 
  Send, 
  Users, 
  Bell, 
  MessageSquare, 
  Calendar,
  Plus,
  Edit,
  Trash2,
  Eye
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'announcement' | 'reminder' | 'update';
  recipients: 'all' | 'users' | 'admins';
  sentAt: Date;
  readBy: string[];
}

export default function NotificationManager() {
  const { users } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      title: 'New AI Features Available',
      message: 'We\'ve added enhanced mind mapping and improved summary generation. Check out the new features in your next meeting recording!',
      type: 'announcement',
      recipients: 'all',
      sentAt: new Date(Date.now() - 86400000),
      readBy: ['1', '3']
    },
    {
      id: '2',
      title: 'Scheduled Maintenance',
      message: 'System maintenance scheduled for this weekend. Recording services may be temporarily unavailable.',
      type: 'update',
      recipients: 'users',
      sentAt: new Date(Date.now() - 172800000),
      readBy: ['1']
    }
  ]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNotification, setNewNotification] = useState({
    title: '',
    message: '',
    type: 'announcement' as const,
    recipients: 'all' as const
  });

  const handleSendNotification = () => {
    const notification: Notification = {
      id: Date.now().toString(),
      ...newNotification,
      sentAt: new Date(),
      readBy: []
    };
    
    setNotifications(prev => [notification, ...prev]);
    setShowCreateModal(false);
    setNewNotification({
      title: '',
      message: '',
      type: 'announcement',
      recipients: 'all'
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'announcement': return 'bg-blue-100 text-blue-800';
      case 'reminder': return 'bg-yellow-100 text-yellow-800';
      case 'update': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRecipientCount = (recipients: string) => {
    switch (recipients) {
      case 'all': return users.length;
      case 'users': return users.filter(u => u.role === 'user').length;
      case 'admins': return users.filter(u => u.role === 'admin').length;
      default: return 0;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Notification Management</h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Send Notification</span>
        </button>
      </div>

      {/* Notification Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600">Total Sent</p>
              <p className="text-2xl font-bold text-blue-900">{notifications.length}</p>
            </div>
            <Mail className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600">Read Rate</p>
              <p className="text-2xl font-bold text-green-900">
                {notifications.length > 0 
                  ? Math.round((notifications.reduce((acc, n) => acc + n.readBy.length, 0) / (notifications.length * users.length)) * 100)
                  : 0}%
              </p>
            </div>
            <Eye className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-600">This Week</p>
              <p className="text-2xl font-bold text-purple-900">
                {notifications.filter(n => {
                  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                  return n.sentAt >= weekAgo;
                }).length}
              </p>
            </div>
            <Calendar className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h4 className="font-medium text-gray-900">Recent Notifications</h4>
        </div>
        <div className="divide-y divide-gray-200">
          {notifications.map(notification => (
            <div key={notification.id} className="p-6 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h5 className="font-medium text-gray-900">{notification.title}</h5>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(notification.type)}`}>
                      {notification.type}
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm mb-3">{notification.message}</p>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      {notification.sentAt.toLocaleDateString()}
                    </span>
                    <span className="flex items-center">
                      <Users className="w-3 h-3 mr-1" />
                      {getRecipientCount(notification.recipients)} recipients
                    </span>
                    <span className="flex items-center">
                      <Eye className="w-3 h-3 mr-1" />
                      {notification.readBy.length} read
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button className="text-gray-400 hover:text-indigo-600 transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button className="text-gray-400 hover:text-red-600 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Notification Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Send Notification</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                <input
                  type="text"
                  value={newNotification.title}
                  onChange={(e) => setNewNotification(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Notification title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                <textarea
                  value={newNotification.message}
                  onChange={(e) => setNewNotification(prev => ({ ...prev, message: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  placeholder="Notification message"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                  <select
                    value={newNotification.type}
                    onChange={(e) => setNewNotification(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="announcement">Announcement</option>
                    <option value="reminder">Reminder</option>
                    <option value="update">Update</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Recipients</label>
                  <select
                    value={newNotification.recipients}
                    onChange={(e) => setNewNotification(prev => ({ ...prev, recipients: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="all">All Users ({users.length})</option>
                    <option value="users">Users Only ({users.filter(u => u.role === 'user').length})</option>
                    <option value="admins">Admins Only ({users.filter(u => u.role === 'admin').length})</option>
                  </select>
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendNotification}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
