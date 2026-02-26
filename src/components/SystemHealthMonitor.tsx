/**
 * System Health Monitor Component
 * 
 * Provides real-time monitoring of system health, performance metrics,
 * and active alerts for administrators
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useToast } from '../../hooks/use-toast';
import { api } from '../services/api';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Database,
  Server,
  Zap,
  TrendingUp,
  TrendingDown,
  Wifi,
  WifiOff
} from 'lucide-react';

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: 'connected' | 'disconnected' | 'slow';
    redis: 'connected' | 'disconnected' | 'slow';
    external_apis: 'available' | 'degraded' | 'unavailable';
  };
  metrics: {
    errorRate: number;
    avgResponseTime: number;
    activeConnections: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  alerts: {
    active: number;
    critical: number;
    resolved: number;
  };
}

interface Alert {
  id: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  timestamp: string;
  resolved: boolean;
}

interface PerformanceMetrics {
  timeframe: string;
  current: SystemHealth['metrics'];
  historical: {
    requests: Array<{ minute: string; request_count: number; avg_response_time: number }>;
    errors: Array<{ level: string; count: number }>;
    performance: Array<{ operation: string; avg_duration: number; max_duration: number; count: number }>;
  };
}

const SystemHealthMonitor: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  const { toast } = useToast();

  // Fetch system health
  const fetchHealth = useCallback(async () => {
    try {
      const response = await api.get('/health/detailed');
      const data = response.data as any;
      if (data && data.data) {
        setHealth(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch system health:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch system health',
        variant: 'destructive',
      });
    }
  }, []);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const response = await api.get('/health/alerts');
      const data = response.data as any;
      if (data.active) {
        setAlerts(data.active);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  }, []);

  // Fetch performance metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await api.get('/health/metrics?timeframe=' + selectedTimeframe);
      const data = response.data as any;
      if (data) {
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  }, [selectedTimeframe]);

  // Resolve alert
  const resolveAlert = async (alertId: string) => {
    try {
      await api.post(`/health/alerts/${alertId}/resolve`);
      toast({
        title: 'Success',
        description: 'Alert resolved successfully',
      });
      fetchAlerts();
    } catch (error) {
      console.error('Failed to resolve alert:', error);
      toast({
        title: 'Error',
        description: 'Failed to resolve alert',
        variant: 'destructive',
      });
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchHealth(), fetchAlerts(), fetchMetrics()]);
      setLoading(false);
    };

    fetchData();

    if (autoRefresh) {
      const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchHealth, fetchAlerts, fetchMetrics]);

  // Get status color and icon
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
      case 'available':
        return { color: 'text-green-600', icon: CheckCircle, bg: 'bg-green-100' };
      case 'degraded':
      case 'slow':
        return { color: 'text-yellow-600', icon: AlertTriangle, bg: 'bg-yellow-100' };
      case 'unhealthy':
      case 'disconnected':
      case 'unavailable':
        return { color: 'text-red-600', icon: XCircle, bg: 'bg-red-100' };
      default:
        return { color: 'text-gray-600', icon: Clock, bg: 'bg-gray-100' };
    }
  };

  // Get alert badge variant
  const getAlertBadgeVariant = (level: string) => {
    switch (level) {
      case 'critical':
        return 'destructive';
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

  // Format uptime
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Format memory usage
  const formatMemory = (mb: number) => {
    if (mb > 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb.toFixed(0)} MB`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p>Loading system health...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">System Health Monitor</h1>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <Wifi className="w-4 h-4 mr-2" /> : <WifiOff className="w-4 h-4 mr-2" />}
            {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
          </Button>
          <Button onClick={() => Promise.all([fetchHealth(), fetchAlerts(), fetchMetrics()])}>
            Refresh Now
          </Button>
        </div>
      </div>

      {/* System Status Overview */}
      {health && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">System Status</p>
                  <p className="text-2xl font-bold capitalize">{health.status}</p>
                </div>
                {(() => {
                  const { color, icon: Icon, bg } = getStatusDisplay(health.status);
                  return (
                    <div className={`p-3 rounded-full ${bg}`}>
                      <Icon className={`w-6 h-6 ${color}`} />
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Uptime</p>
                  <p className="text-2xl font-bold">{formatUptime(health.uptime)}</p>
                </div>
                <div className="p-3 rounded-full bg-blue-100">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Alerts</p>
                  <p className="text-2xl font-bold">{health.alerts.active}</p>
                  {health.alerts.critical > 0 && (
                    <p className="text-sm text-red-600">{health.alerts.critical} critical</p>
                  )}
                </div>
                <div className={`p-3 rounded-full ${health.alerts.active > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                  <AlertTriangle className={`w-6 h-6 ${health.alerts.active > 0 ? 'text-red-600' : 'text-green-600'}`} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Error Rate</p>
                  <p className="text-2xl font-bold">{(health.metrics.errorRate * 100).toFixed(2)}%</p>
                </div>
                <div className={`p-3 rounded-full ${health.metrics.errorRate > 0.05 ? 'bg-red-100' : 'bg-green-100'}`}>
                  {health.metrics.errorRate > 0.05 ? (
                    <TrendingUp className="w-6 h-6 text-red-600" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-green-600" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="services" className="space-y-4">
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          {health && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Database
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const { color, icon: Icon } = getStatusDisplay(health.services.database);
                    return (
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${color}`} />
                        <span className="capitalize">{health.services.database}</span>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="w-5 h-5" />
                    Redis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const { color, icon: Icon } = getStatusDisplay(health.services.redis);
                    return (
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${color}`} />
                        <span className="capitalize">{health.services.redis}</span>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    External APIs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const { color, icon: Icon } = getStatusDisplay(health.services.external_apis);
                    return (
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${color}`} />
                        <span className="capitalize">{health.services.external_apis}</span>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {alerts.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Active Alerts</h3>
                <p className="text-gray-600">All systems are operating normally.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {alerts.map((alert) => (
                <Alert key={alert.id} variant={alert.level === 'critical' || alert.level === 'high' ? 'destructive' : 'default'}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getAlertBadgeVariant(alert.level)}>
                            {alert.level.toUpperCase()}
                          </Badge>
                          <span className="text-sm text-gray-500">
                            {new Date(alert.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="font-medium">{alert.message}</p>
                        <p className="text-sm text-gray-600 mt-1">Type: {alert.type}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        Resolve
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          {health && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Response Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{health.metrics.avgResponseTime.toFixed(0)}ms</p>
                  <p className="text-sm text-gray-600">Average response time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Memory Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatMemory(health.metrics.memoryUsage)}</p>
                  <p className="text-sm text-gray-600">Current memory usage</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Active Connections</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{health.metrics.activeConnections}</p>
                  <p className="text-sm text-gray-600">Current connections</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>CPU Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{health.metrics.cpuUsage.toFixed(1)}%</p>
                  <p className="text-sm text-gray-600">Current CPU usage</p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="flex gap-2 mb-4">
            {['5m', '15m', '1h', '24h'].map((timeframe) => (
              <Button
                key={timeframe}
                variant={selectedTimeframe === timeframe ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedTimeframe(timeframe)}
              >
                {timeframe}
              </Button>
            ))}
          </div>

          {metrics && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Error Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {metrics.historical.errors.map((error, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <Badge variant={error.level === 'ERROR' ? 'destructive' : 'secondary'}>
                          {error.level}
                        </Badge>
                        <span className="font-medium">{error.count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Slowest Operations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {metrics.historical.performance.slice(0, 5).map((perf, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-sm">{perf.operation}</span>
                        <div className="text-right">
                          <div className="font-medium">{perf.avg_duration.toFixed(0)}ms avg</div>
                          <div className="text-xs text-gray-500">{perf.count} calls</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SystemHealthMonitor;