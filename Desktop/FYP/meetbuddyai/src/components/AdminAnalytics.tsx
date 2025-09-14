import React, { useState } from 'react';
import { 
  TrendingUp, 
  Users, 
  Calendar, 
  Database, 
  Download,
  BarChart3,
  PieChart,
  Activity,
  Clock
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMeeting } from '../contexts/MeetingContext';

export default function AdminAnalytics() {
  const { users } = useAuth();
  const { meetings } = useMeeting();
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('month');

  // Calculate analytics data
  const totalUsers = users.filter(u => u.role === 'user').length;
  const activeUsers = users.filter(u => {
    const daysSinceLogin = (Date.now() - u.lastLogin.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLogin <= 7;
  }).length;

  const meetingsByPlatform = meetings.reduce((acc, meeting) => {
    acc[meeting.platform] = (acc[meeting.platform] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const subscriptionDistribution = users.reduce((acc, user) => {
    if (user.role === 'user') {
      acc[user.subscription] = (acc[user.subscription] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const weeklyData = [
    { week: 'Week 1', meetings: 12, users: 8, storage: 245 },
    { week: 'Week 2', meetings: 18, users: 12, storage: 387 },
    { week: 'Week 3', meetings: 15, users: 10, storage: 298 },
    { week: 'Week 4', meetings: 22, users: 15, storage: 456 }
  ];

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Analytics Dashboard</h3>
        <div className="flex items-center space-x-4">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="quarter">Last 90 days</option>
          </select>
          <button className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Users</p>
              <p className="text-2xl font-bold text-green-600">{activeUsers}</p>
              <p className="text-xs text-green-600 mt-1">+12% from last week</p>
            </div>
            <Activity className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg. Meetings/User</p>
              <p className="text-2xl font-bold text-blue-600">
                {totalUsers > 0 ? Math.round(meetings.length / totalUsers) : 0}
              </p>
              <p className="text-xs text-blue-600 mt-1">Per month</p>
            </div>
            <BarChart3 className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg. Storage/User</p>
              <p className="text-2xl font-bold text-purple-600">
                {totalUsers > 0 ? Math.round(users.reduce((acc, u) => acc + u.storageUsed, 0) / totalUsers) : 0}MB
              </p>
              <p className="text-xs text-purple-600 mt-1">Per user</p>
            </div>
            <Database className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completion Rate</p>
              <p className="text-2xl font-bold text-orange-600">
                {meetings.length > 0 ? Math.round((meetings.filter(m => m.status === 'completed').length / meetings.length) * 100) : 0}%
              </p>
              <p className="text-xs text-orange-600 mt-1">Meetings recorded</p>
            </div>
            <TrendingUp className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Usage */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h4 className="font-medium text-gray-900 mb-4 flex items-center">
            <PieChart className="w-5 h-5 mr-2 text-indigo-600" />
            Platform Usage
          </h4>
          <div className="space-y-3">
            {Object.entries(meetingsByPlatform).map(([platform, count]) => (
              <div key={platform} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{platform}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-indigo-600 h-2 rounded-full" 
                      style={{ width: `${(count / meetings.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subscription Distribution */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h4 className="font-medium text-gray-900 mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2 text-purple-600" />
            Subscription Distribution
          </h4>
          <div className="space-y-3">
            {Object.entries(subscriptionDistribution).map(([subscription, count]) => (
              <div key={subscription} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 capitalize">{subscription}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full" 
                      style={{ width: `${(count / totalUsers) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly Trends */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 mb-4 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
          Weekly Trends
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-sm font-medium text-gray-600">Period</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Meetings</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Active Users</th>
                <th className="text-right py-2 text-sm font-medium text-gray-600">Storage (MB)</th>
              </tr>
            </thead>
            <tbody>
              {weeklyData.map((week, index) => (
                <tr key={index} className="border-b border-gray-100">
                  <td className="py-3 text-sm text-gray-900">{week.week}</td>
                  <td className="py-3 text-sm text-gray-900 text-right">{week.meetings}</td>
                  <td className="py-3 text-sm text-gray-900 text-right">{week.users}</td>
                  <td className="py-3 text-sm text-gray-900 text-right">{week.storage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
