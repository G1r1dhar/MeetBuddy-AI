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
        <Loader className="w-8 h-8 animate-spin text-theme-accent" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex justify-center items-center h-64 text-theme-text/60">
        Failed to load analytics
      </div>
    );
  }

  return (
    <div className="space-y-6 transition-colors duration-300">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-theme-text">Analytics Dashboard</h3>
        <div className="flex items-center space-x-4">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="bg-theme-bg border border-theme-card-border text-theme-text rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-theme-accent focus:border-transparent outline-none cursor-pointer"
          >
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="quarter">Last 90 days</option>
          </select>
          <button className="flex items-center space-x-2 bg-theme-accent text-black font-semibold px-4 py-2 rounded-lg hover:brightness-110 transition-all shadow-[0_4px_14px_0_rgba(255,193,7,0.39)] hover:shadow-[0_6px_20px_rgba(255,193,7,0.23)]">
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-theme-card border border-theme-card-border rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-theme-text/70">Active Users</p>
              <p className="text-2xl font-bold text-green-500">{analytics.users.active}</p>
              <p className="text-xs text-green-500/80 mt-1">+{analytics.users.newThisWeek} this week</p>
            </div>
            <Activity className="w-8 h-8 text-green-500/80" />
          </div>
        </div>

        <div className="bg-theme-card border border-theme-card-border rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-theme-text/70">Avg. Meetings/User</p>
              <p className="text-2xl font-bold text-blue-500">
                {analytics.users.total > 0 ? Math.round(analytics.meetings.total / analytics.users.total) : 0}
              </p>
              <p className="text-xs text-blue-500/80 mt-1">Per month</p>
            </div>
            <BarChart3 className="w-8 h-8 text-blue-500/80" />
          </div>
        </div>

        <div className="bg-theme-card border border-theme-card-border rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-theme-text/70">Avg. Storage/User</p>
              <p className="text-2xl font-bold text-purple-500">
                {analytics.users.total > 0 ? Math.round(analytics.storage.totalUsed / analytics.users.total) : 0}MB
              </p>
              <p className="text-xs text-purple-500/80 mt-1">Per user</p>
            </div>
            <Database className="w-8 h-8 text-purple-500/80" />
          </div>
        </div>

        <div className="bg-theme-card border border-theme-card-border rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-theme-text/70">Total Meetings Duration</p>
              <p className="text-2xl font-bold text-orange-500">
                {Math.round(analytics.meetings.totalDuration / 60)} hrs
              </p>
              <p className="text-xs text-orange-500/80 mt-1">Recorded</p>
            </div>
            <TrendingUp className="w-8 h-8 text-orange-500/80" />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Usage */}
        <div className="bg-theme-card border border-theme-card-border rounded-lg p-6 shadow-sm">
          <h4 className="font-medium text-theme-text mb-4 flex items-center">
            <PieChart className="w-5 h-5 mr-2 text-theme-accent" />
            Platform Usage
          </h4>
          <div className="space-y-3">
            {Object.entries(analytics.activity.platformDistribution).map(([platform, count]) => (
              <div key={platform} className="flex items-center justify-between">
                <span className="text-sm text-theme-text/80">{platform}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-theme-bg rounded-full h-2 overflow-hidden border border-theme-card-border">
                    <div
                      className="bg-theme-accent h-2 rounded-full"
                      style={{ width: `${(count / analytics.meetings.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-theme-text">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subscription Distribution */}
        <div className="bg-theme-card border border-theme-card-border rounded-lg p-6 shadow-sm">
          <h4 className="font-medium text-theme-text mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2 text-purple-500" />
            Subscription Distribution
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-theme-text/80 capitalize">Pro</span>
              <div className="flex items-center space-x-2">
                <div className="w-24 bg-theme-bg rounded-full h-2 overflow-hidden border border-theme-card-border">
                  <div className="bg-purple-500 h-2 rounded-full" style={{ width: '45%' }} />
                </div>
                <span className="text-sm font-medium text-theme-text">45%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Trends */}
      <div className="bg-theme-card border border-theme-card-border rounded-lg p-6 shadow-sm overflow-hidden">
        <h4 className="font-medium text-theme-text mb-4 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2 text-green-500" />
          Weekly Trends
        </h4>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full">
            <thead>
              <tr className="border-b border-theme-card-border">
                <th className="text-left py-2 text-sm font-medium text-theme-text/70">Period</th>
                <th className="text-right py-2 text-sm font-medium text-theme-text/70">Meetings</th>
                <th className="text-right py-2 text-sm font-medium text-theme-text/70">Active Users</th>
                <th className="text-right py-2 text-sm font-medium text-theme-text/70">Storage (MB)</th>
              </tr>
            </thead>
            <tbody>
              {analytics.activity.weeklyMeetings.map((week, index) => (
                <tr key={index} className="border-b border-theme-card-border/50 hover:bg-theme-bg/50 transition-colors">
                  <td className="py-3 text-sm text-theme-text">{week.week}</td>
                  <td className="py-3 text-sm text-theme-text text-right">{week.count}</td>
                  <td className="py-3 text-sm text-theme-text text-right">-</td>
                  <td className="py-3 text-sm text-theme-text text-right">-</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
