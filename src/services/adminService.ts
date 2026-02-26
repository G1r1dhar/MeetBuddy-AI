import { apiClient } from './apiClient';

export interface AdminAnalyticsData {
    users: {
        total: number;
        active: number;
        newThisWeek: number;
        growthRate: number;
    };
    meetings: {
        total: number;
        thisMonth: number;
        totalDuration: number;
        avgDuration: number;
    };
    storage: {
        totalUsed: number;
        projectedUsage: number;
    };
    activity: {
        weeklyMeetings: Array<{ week: string; count: number }>;
        platformDistribution: Record<string, number>;
    };
}

export interface AdminSystemHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    services: {
        database: string;
        redis: string;
        external_apis: string;
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

export interface PaginatedUsers {
    users: Array<{
        id: string;
        email: string;
        name: string;
        role: string;
        subscription: string;
        isActive: boolean;
        storageUsed: number;
        lastLoginAt: string | null;
        createdAt: string;
        meetingsThisMonth: number;
        avatarUrl?: string;
    }>;
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export const adminService = {
    getAnalytics: async (): Promise<AdminAnalyticsData> => {
        const response = await apiClient.get<AdminAnalyticsData>('/admin/analytics');
        return response.data;
    },

    getSystemHealth: async (): Promise<AdminSystemHealth> => {
        const response = await apiClient.get<AdminSystemHealth>('/admin/system-health');
        return response.data;
    },

    getUsers: async (page = 1, limit = 20, search?: string, role?: string): Promise<PaginatedUsers> => {
        const params = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString(),
        });
        if (search) params.append('search', search);
        if (role && role !== 'all') params.append('role', role);

        const response = await apiClient.get<PaginatedUsers>(`/admin/users?${params.toString()}`);
        return response.data;
    },

    deleteUser: async (userId: string): Promise<void> => {
        await apiClient.delete(`/admin/users/${userId}`);
    },

    updateUser: async (userId: string, data: any): Promise<any> => {
        const response = await apiClient.put(`/admin/users/${userId}`, data);
        return response.data;
    },

    createUser: async (data: any): Promise<any> => {
        const response = await apiClient.post('/admin/users', data);
        return response.data;
    }
};
