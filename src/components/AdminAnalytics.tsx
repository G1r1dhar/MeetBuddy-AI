import React, { useState } from 'react';
import {
  TrendingUp,
  Users,
  Database,
  Download,
  BarChart3,
  PieChart,
  Activity,
  Loader
} from 'lucide-react';
import { adminService, AdminAnalyticsData } from '../services/adminService';

export default function AdminAnalytics() {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('month');
  const [analytics, setAnalytics] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const data = await adminService.getAnalytics();
        setAnalytics(data);
      } catch (error) {
        console.error('Failed to fetch admin analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [timeRange]); // Add timeRange as a dependency if the backend supports it later

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500">
        Failed to load analytics
      </div>
    );
  }

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
              <p className="text-2xl font-bold text-green-600">{analytics.users.active}</p>
              <p className="text-xs text-green-600 mt-1">+{analytics.users.newThisWeek} this week</p>
            </div>
            <Activity className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg. Meetings/User</p>
              <p className="text-2xl font-bold text-blue-600">
                {analytics.users.total > 0 ? Math.round(analytics.meetings.total / analytics.users.total) : 0}
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
                {analytics.users.total > 0 ? Math.round(analytics.storage.totalUsed / analytics.users.total) : 0}MB
              </p>
              <p className="text-xs text-purple-600 mt-1">Per user</p>
            </div>
            <Database className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Meetings Duration</p>
              <p className="text-2xl font-bold text-orange-600">
                {Math.round(analytics.meetings.totalDuration / 60)} hrs
              </p>
              <p className="text-xs text-orange-600 mt-1">Recorded</p>
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
            {Object.entries(analytics.activity.platformDistribution).map(([platform, count]) => (
              <div key={platform} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{platform}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-indigo-600 h-2 rounded-full"
                      style={{ width: `${(count / analytics.meetings.total) * 100}%` }}
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
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 capitalize">Pro</span>
              <div className="flex items-center space-x-2">
                <div className="w-24 bg-gray-200 rounded-full h-2">
                  <div className="bg-purple-600 h-2 rounded-full" style={{ width: '45%' }} />
                </div>
                <span className="text-sm font-medium text-gray-900">45%</span>
              </div>
            </div>
            {/* The backend currently doesn't return full subscription distribution, so using a dummy value temporarily until the API is updated to match. */}
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
              {analytics.activity.weeklyMeetings.map((week, index) => (
                <tr key={index} className="border-b border-gray-100">
                  <td className="py-3 text-sm text-gray-900">{week.week}</td>
                  <td className="py-3 text-sm text-gray-900 text-right">{week.count}</td>
                  <td className="py-3 text-sm text-gray-900 text-right">-</td>
                  <td className="py-3 text-sm text-gray-900 text-right">-</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
