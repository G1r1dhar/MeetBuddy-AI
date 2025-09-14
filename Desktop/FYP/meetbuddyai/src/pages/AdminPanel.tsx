import React, { useState } from 'react';
import { 
  Users, 
  BarChart3, 
  Settings, 
  Download, 
  Calendar,
  TrendingUp,
  Activity,
  Database,
  Mail,
  Plus,
  Edit,
  Trash2,
  Crown,
  Shield
} from 'lucide-react';
import { useMeeting } from '../contexts/MeetingContext';
import { useAuth } from '../contexts/AuthContext';
import UserManagement from '../components/UserManagement';
import AdminAnalytics from '../components/AdminAnalytics';
import NotificationManager from '../components/NotificationManager';

export default function AdminPanel() {
  const { meetings, getTotalStorageUsed, getMeetingsThisMonth } = useMeeting();
  const { users } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'analytics' | 'notifications' | 'settings'>('overview');

  const totalUsers = users.filter(u => u.role === 'user').length;
  const totalMeetings = meetings.length;
  const totalStorage = getTotalStorageUsed();
  const monthlyMeetings = getMeetingsThisMonth();

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'notifications', label: 'Notifications', icon: Mail },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center space-x-3">
          <div className="bg-purple-100 p-2 rounded-lg">
            <Crown className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600">Manage users, analytics, and system settings</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl border border-gray-200 mb-8">
        <nav className="flex border-b border-gray-200 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-6 py-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Admin Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100 text-sm">Total Users</p>
                      <p className="text-3xl font-bold">{totalUsers}</p>
                      <p className="text-xs text-blue-200 mt-1">Active accounts</p>
                    </div>
                    <Users className="w-8 h-8 text-blue-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100 text-sm">Total Meetings</p>
                      <p className="text-3xl font-bold">{totalMeetings}</p>
                      <p className="text-xs text-green-200 mt-1">All time</p>
                    </div>
                    <Calendar className="w-8 h-8 text-green-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-100 text-sm">Storage Used</p>
                      <p className="text-3xl font-bold">{totalStorage}MB</p>
                      <p className="text-xs text-purple-200 mt-1">Total recordings</p>
                    </div>
                    <Database className="w-8 h-8 text-purple-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-100 text-sm">This Month</p>
                      <p className="text-3xl font-bold">{monthlyMeetings}</p>
                      <p className="text-xs text-orange-200 mt-1">meetings recorded</p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-orange-200" />
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent User Activity</h3>
                <div className="space-y-3">
                  {users.slice(0, 5).map(user => (
                    <div key={user.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center space-x-3">
                        <img 
                          src={user.avatar} 
                          alt={user.name}
                          className="w-8 h-8 rounded-full"
                        />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{user.name}</p>
                          <p className="text-xs text-gray-500">
                            Last login: {new Intl.DateTimeFormat('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }).format(user.lastLogin)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{user.meetingsThisMonth} meetings</p>
                        <p className="text-xs text-gray-500">{user.storageUsed}MB used</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'analytics' && <AdminAnalytics />}
          {activeTab === 'notifications' && <NotificationManager />}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">System Settings</h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="font-medium text-gray-900 mb-4">Recording Settings</h4>
                  <div className="space-y-4">
                    <label className="flex items-center">
                      <input type="checkbox" className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" defaultChecked />
                      <span className="ml-2 text-sm text-gray-700">Auto-start recording</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" defaultChecked />
                      <span className="ml-2 text-sm text-gray-700">Generate transcripts</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" defaultChecked />
                      <span className="ml-2 text-sm text-gray-700">Auto-generate summaries</span>
                    </label>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="font-medium text-gray-900 mb-4">Storage Management</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Auto-delete recordings after
                      </label>
                      <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                        <option>30 days</option>
                        <option selected>90 days</option>
                        <option>1 year</option>
                        <option>Never</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Storage limit per user
                      </label>
                      <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                        <option>1 GB</option>
                        <option selected>5 GB</option>
                        <option>10 GB</option>
                        <option>Unlimited</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
