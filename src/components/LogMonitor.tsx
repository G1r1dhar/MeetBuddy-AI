/**
 * Log Monitor Component
 * 
 * Provides real-time log monitoring and search capabilities for administrators
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { useToast } from '../../hooks/use-toast';
import { api } from '../services/api';

interface LogEntry {
  id: string;
  timestamp: Date;
  level: string;
  message: string;
  category?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

interface LogStats {
  totalLogs: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  debugCount: number;
  categoryCounts: Record<string, number>;
  hourlyDistribution: Array<{ hour: string; count: number }>;
  topUsers: Array<{ userId: string; count: number }>;
  topErrors: Array<{ error: string; count: number }>;
}

interface LogSearchParams {
  level?: string;
  category?: string;
  userId?: string;
  requestId?: string;
  startDate?: string;
  endDate?: string;
  message?: string;
  page?: number;
  limit?: number;
  search?: string;
}

const LogMonitor: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState<LogSearchParams>({
    page: 1,
    limit: 50,
  });
  const [totalLogs, setTotalLogs] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const { toast } = useToast();

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/logs/search?page=${searchParams.page}&limit=${searchParams.limit}${searchParams.level ? `&level=${searchParams.level}` : ''}${searchParams.search ? `&search=${searchParams.search}` : ''}`);
      const data = response.data as any;

      if (data.success) {
        setLogs(data.data.logs.map((log: any) => ({
          id: log.id,
          timestamp: new Date(log.timestamp),
          level: log.level,
          message: log.message,
          category: log.category,
          userId: log.userId,
          requestId: log.requestId,
          metadata: log.metadata || {}
        })));
        setTotalLogs(data.data.total);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch logs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  // Fetch statistics
  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/logs/stats?timeframe=day');
      const data = response.data as any;

      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch log stats:', error);
    }
  }, []);

  // Fetch anomalies
  const fetchAnomalies = useCallback(async () => {
    try {
      const response = await api.get('/logs/analyze?timeframe=hour');
      const data = response.data as any;

      if (data.success) {
        setAnomalies(data.data.anomalies);
      }
    } catch (error) {
      console.error('Failed to fetch anomalies:', error);
    }
  }, []);

  // Export logs
  const exportLogs = async (format: 'json' | 'csv') => {
    try {
      const response = await api.post('/logs/export', {
        ...searchParams,
        format,
      });
      const data = response.data as any;

      if (data.success) {
        toast({
          title: 'Success',
          description: `Logs exported successfully to ${data.data.filepath}`,
        });
      }
    } catch (error) {
      console.error('Failed to export logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to export logs',
        variant: 'destructive',
      });
    }
  };

  // Clean up old logs
  const cleanupLogs = async () => {
    try {
      const response = await api.delete('/logs/cleanup?retentionDays=30');
      const data = response.data as any;

      if (data.success) {
        toast({
          title: 'Success',
          description: `Cleaned up ${data.data.deletedCount} old log entries`,
        });
        fetchStats();
      }
    } catch (error) {
      console.error('Failed to cleanup logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to cleanup logs',
        variant: 'destructive',
      });
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchLogs();
        fetchStats();
        fetchAnomalies();
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchLogs, fetchStats, fetchAnomalies]);

  // Initial load
  useEffect(() => {
    fetchLogs();
    fetchStats();
    fetchAnomalies();
  }, [fetchLogs, fetchStats, fetchAnomalies]);

  // Get level badge color
  const getLevelBadgeVariant = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'destructive';
      case 'warn':
        return 'secondary';
      case 'info':
        return 'default';
      case 'debug':
        return 'outline';
      default:
        return 'default';
    }
  };

  // Get severity badge color
  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'destructive';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Log Monitor</h1>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Stop Auto-Refresh' : 'Start Auto-Refresh'}
          </Button>
          <Button onClick={() => fetchLogs()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Anomalies Detected</h2>
          {anomalies.map((anomaly, index) => (
            <Alert key={index} variant="destructive">
              <AlertDescription>
                <div className="flex justify-between items-start">
                  <div>
                    <strong>{anomaly.description}</strong>
                    <p className="text-sm mt-1">
                      Count: {anomaly.count} |
                      Severity: <Badge variant={getSeverityBadgeVariant(anomaly.severity)}>
                        {anomaly.severity}
                      </Badge>
                    </p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4">
          {/* Search Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Search Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <Select
                  value={searchParams.level || ''}
                  onValueChange={(value) =>
                    setSearchParams(prev => ({ ...prev, level: value || undefined, page: 1 }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Log Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Levels</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="warn">Warning</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="debug">Debug</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={searchParams.category || ''}
                  onValueChange={(value) =>
                    setSearchParams(prev => ({ ...prev, category: value || undefined, page: 1 }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Categories</SelectItem>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="audit">Audit</SelectItem>
                    <SelectItem value="performance">Performance</SelectItem>
                    <SelectItem value="database">Database</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  placeholder="User ID"
                  value={searchParams.userId || ''}
                  onChange={(e) =>
                    setSearchParams(prev => ({ ...prev, userId: e.target.value || undefined, page: 1 }))
                  }
                />

                <Input
                  placeholder="Request ID"
                  value={searchParams.requestId || ''}
                  onChange={(e) =>
                    setSearchParams(prev => ({ ...prev, requestId: e.target.value || undefined, page: 1 }))
                  }
                />

                <Input
                  placeholder="Search message"
                  value={searchParams.message || ''}
                  onChange={(e) =>
                    setSearchParams(prev => ({ ...prev, message: e.target.value || undefined, page: 1 }))
                  }
                />
              </div>

              <div className="flex justify-between items-center mt-4">
                <div className="flex gap-2">
                  <Button onClick={() => fetchLogs()}>
                    Search
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchParams({ page: 1, limit: 50 });
                      fetchLogs();
                    }}
                  >
                    Clear Filters
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => exportLogs('json')}>
                    Export JSON
                  </Button>
                  <Button variant="outline" onClick={() => exportLogs('csv')}>
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Log Entries */}
          <Card>
            <CardHeader>
              <CardTitle>
                Log Entries ({totalLogs} total)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading logs...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No logs found</div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="border rounded-lg p-4 hover:bg-gray-50"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={getLevelBadgeVariant(log.level)}>
                            {log.level.toUpperCase()}
                          </Badge>
                          {log.category && (
                            <Badge variant="outline">{log.category}</Badge>
                          )}
                          <span className="text-sm text-gray-500">
                            {log.timestamp.toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {log.requestId && `Request: ${log.requestId.substring(0, 8)}`}
                          {log.userId && ` | User: ${log.userId.substring(0, 8)}`}
                        </div>
                      </div>
                      <div className="text-sm font-medium mb-1">{log.message}</div>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <details className="text-xs text-gray-600">
                          <summary className="cursor-pointer">Metadata</summary>
                          <pre className="mt-2 bg-gray-100 p-2 rounded overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalLogs > (searchParams.limit || 50) && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    disabled={searchParams.page === 1}
                    onClick={() =>
                      setSearchParams(prev => ({ ...prev, page: (prev.page || 1) - 1 }))
                    }
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-4">
                    Page {searchParams.page || 1} of {Math.ceil(totalLogs / (searchParams.limit || 50))}
                  </span>
                  <Button
                    variant="outline"
                    disabled={(searchParams.page || 1) >= Math.ceil(totalLogs / (searchParams.limit || 50))}
                    onClick={() =>
                      setSearchParams(prev => ({ ...prev, page: (prev.page || 1) + 1 }))
                    }
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Total Logs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stats.totalLogs}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Errors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-600">{stats.errorCount}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Warnings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-yellow-600">{stats.warningCount}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">{stats.infoCount}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Top Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(stats.categoryCounts)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 10)
                      .map(([category, count]) => (
                        <div key={category} className="flex justify-between">
                          <span>{category}</span>
                          <Badge variant="outline">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Errors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.topErrors.slice(0, 10).map((error, index) => (
                      <div key={index} className="flex justify-between">
                        <span className="truncate">{error.error}</span>
                        <Badge variant="destructive">{error.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="management" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Log Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Cleanup Old Logs</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Remove logs older than 30 days (excluding errors and security logs)
                </p>
                <Button onClick={cleanupLogs} variant="outline">
                  Cleanup Old Logs
                </Button>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Export All Logs</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Export all logs matching current filters
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => exportLogs('json')} variant="outline">
                    Export as JSON
                  </Button>
                  <Button onClick={() => exportLogs('csv')} variant="outline">
                    Export as CSV
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LogMonitor;