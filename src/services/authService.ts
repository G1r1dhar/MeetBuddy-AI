/**
 * Authentication Service
 * 
 * Handles all authentication-related API calls
 * Replaces mock authentication logic with real backend integration
 */

import { apiClient } from './apiClient';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: "user" | "admin";
  createdAt: Date;
  lastLogin: Date;
  subscription: "free" | "pro" | "enterprise";
  storageUsed: number;
  meetingsThisMonth: number;
  darkMode: boolean;
  notifications: {
    meetingReminders: boolean;
    summaryReady: boolean;
    adminMessages: boolean;
  };
  preferences: {
    autoGenerateNotes: boolean;
    enableRealTimeTranscript: boolean;
    autoExportSummaries: boolean;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface UpdateUserRequest {
  name?: string;
  avatar?: string;
  notifications?: User['notifications'];
  preferences?: User['preferences'];
}

class AuthService {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await apiClient.post<any>('/auth/login', credentials);

      // Backend returns: { message: "Login successful", data: { user: {...}, token: "..." } }
      if (response.data && response.data.token) {
        apiClient.setToken(response.data.token);

        // Map backend user response to frontend User interface
        const backendUser = response.data.user;
        const user: User = {
          id: backendUser.id,
          name: backendUser.name,
          email: backendUser.email,
          avatar: backendUser.avatarUrl || '',
          role: backendUser.role.toLowerCase() as "user" | "admin",
          createdAt: new Date(backendUser.createdAt),
          lastLogin: new Date(backendUser.lastLoginAt || backendUser.createdAt),
          subscription: backendUser.subscription?.toLowerCase() as "free" | "pro" | "enterprise" || "free",
          storageUsed: 0,
          meetingsThisMonth: 0,
          darkMode: true, // Default to dark mode
          notifications: {
            meetingReminders: true,
            summaryReady: true,
            adminMessages: backendUser.role === 'ADMIN',
          },
          preferences: {
            autoGenerateNotes: true,
            enableRealTimeTranscript: true,
            autoExportSummaries: false,
          },
        };

        return { user, token: response.data.token };
      }

      throw new Error('Invalid login response format');
    } catch (error: any) {
      console.error('Login error:', error);

      // If it's an API error with a message, use that
      if (error.message && !error.message.includes('Login successful')) {
        throw new Error(error.message);
      }

      throw new Error('Login failed');
    }
  }

  async register(userData: RegisterRequest): Promise<LoginResponse> {
    try {
      const response = await apiClient.post<LoginResponse>('/auth/register', userData);

      if (response.success && response.data.token) {
        apiClient.setToken(response.data.token);

        const user = {
          ...response.data.user,
          createdAt: new Date(response.data.user.createdAt),
          lastLogin: new Date(response.data.user.lastLogin),
        };

        return { ...response.data, user };
      }

      throw new Error(response.message || 'Registration failed');
    } catch (error: any) {
      console.error('Registration error:', error);
      throw new Error(error.message || 'Registration failed');
    }
  }

  async getCurrentUser(): Promise<User> {
    try {
      const response = await apiClient.get<any>('/auth/me');

      // Backend returns: { message: "User profile retrieved successfully", data: { user: {...} } }
      if (response.data && response.data.user) {
        const backendUser = response.data.user;
        const user: User = {
          id: backendUser.id,
          name: backendUser.name,
          email: backendUser.email,
          avatar: backendUser.avatarUrl || '',
          role: backendUser.role.toLowerCase() as "user" | "admin",
          createdAt: new Date(backendUser.createdAt),
          lastLogin: new Date(backendUser.lastLoginAt || backendUser.createdAt),
          subscription: backendUser.subscription?.toLowerCase() as "free" | "pro" | "enterprise" || "free",
          storageUsed: 0,
          meetingsThisMonth: 0,
          darkMode: true,
          notifications: {
            meetingReminders: true,
            summaryReady: true,
            adminMessages: backendUser.role === 'ADMIN',
          },
          preferences: {
            autoGenerateNotes: true,
            enableRealTimeTranscript: true,
            autoExportSummaries: false,
          },
        };

        return user;
      }

      throw new Error('Invalid user data response format');
    } catch (error: any) {
      console.error('Get current user error:', error);
      throw new Error(error.message || 'Failed to get user data');
    }
  }

  async updateUser(updates: UpdateUserRequest): Promise<User> {
    try {
      const response = await apiClient.put<any>('/users/profile', updates);

      // Backend returns: { message: "Profile updated successfully", data: { user: {...} } }
      if (response.success && response.data?.user) {
        const backendUser = response.data.user;
        return {
          id: backendUser.id,
          name: backendUser.name,
          email: backendUser.email,
          avatar: backendUser.avatarUrl || '',
          role: backendUser.role?.toLowerCase() as "user" | "admin",
          createdAt: new Date(backendUser.createdAt),
          lastLogin: new Date(backendUser.lastLoginAt || backendUser.updatedAt || backendUser.createdAt),
          subscription: backendUser.subscription?.toLowerCase() as "free" | "pro" | "enterprise" || "free",
          storageUsed: backendUser.storageUsed || 0,
          meetingsThisMonth: backendUser.totalMeetings || 0,
          darkMode: true,
          notifications: updates.notifications || {
            meetingReminders: true,
            summaryReady: true,
            adminMessages: backendUser.role === 'ADMIN',
          },
          preferences: updates.preferences || {
            autoGenerateNotes: true,
            enableRealTimeTranscript: true,
            autoExportSummaries: false,
          },
        };
      }

      throw new Error(response.message || 'Failed to update user');
    } catch (error: any) {
      console.error('Update user error:', error);
      throw new Error(error.message || 'Failed to update user');
    }
  }

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.warn('Logout API call failed:', error);
      // Continue with local logout even if API call fails
    } finally {
      apiClient.clearToken();
    }
  }

  async deleteAccount(): Promise<void> {
    try {
      const response = await apiClient.delete('/users/account');

      if (response.success) {
        apiClient.clearToken();
        return;
      }

      throw new Error('Failed to delete account');
    } catch (error: any) {
      console.error('Delete account error:', error);
      throw new Error(error.message || 'Failed to delete account');
    }
  }

  async refreshToken(): Promise<string> {
    try {
      const currentToken = apiClient.getToken();
      if (!currentToken) throw new Error('No token to refresh');

      const response = await apiClient.post<any>('/auth/refresh', { token: currentToken });

      // Backend returns: { message: "Token refreshed", data: { token: "..." } }
      if (response.success && response.data?.token) {
        apiClient.setToken(response.data.token);
        return response.data.token;
      }

      throw new Error('Failed to refresh token');
    } catch (error: any) {
      console.error('Refresh token error:', error);
      apiClient.clearToken();
      throw new Error(error.message || 'Failed to refresh token');
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      const response = await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      if (!response.success) {
        throw new Error(response.message || 'Failed to change password');
      }
    } catch (error: any) {
      console.error('Change password error:', error);
      throw new Error(error.message || 'Failed to change password');
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    try {
      const response = await apiClient.post('/auth/forgot-password', { email });

      if (!response.success) {
        throw new Error(response.message || 'Failed to request password reset');
      }
    } catch (error: any) {
      console.error('Password reset request error:', error);
      throw new Error(error.message || 'Failed to request password reset');
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const response = await apiClient.post('/auth/reset-password', {
        token,
        newPassword,
      });

      if (!response.success) {
        throw new Error(response.message || 'Failed to reset password');
      }
    } catch (error: any) {
      console.error('Password reset error:', error);
      throw new Error(error.message || 'Failed to reset password');
    }
  }

  // Admin-only methods
  async getAllUsers(): Promise<User[]> {
    try {
      const response = await apiClient.get<any>('/admin/users');

      if (response.success && response.data.users) {
        // Backend returns paginated response: { users: [...], pagination: {...} }
        return response.data.users.map((user: any) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatarUrl || '',
          role: user.role.toLowerCase() as "user" | "admin",
          createdAt: new Date(user.createdAt),
          lastLogin: new Date(user.lastLoginAt || user.createdAt),
          subscription: user.subscription?.toLowerCase() as "free" | "pro" | "enterprise" || "free",
          storageUsed: user.storageUsed || 0,
          meetingsThisMonth: user.totalMeetings || 0,
          darkMode: true,
          notifications: {
            meetingReminders: true,
            summaryReady: true,
            adminMessages: user.role === 'ADMIN',
          },
          preferences: {
            autoGenerateNotes: true,
            enableRealTimeTranscript: true,
            autoExportSummaries: false,
          },
        }));
      }

      throw new Error(response.message || 'Failed to get users');
    } catch (error: any) {
      console.error('Get all users error:', error);
      throw new Error(error.message || 'Failed to get users');
    }
  }

  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): Promise<User> {
    try {
      const response = await apiClient.post<User>('/admin/users', userData);

      if (response.success) {
        return {
          ...response.data,
          createdAt: new Date(response.data.createdAt),
          lastLogin: new Date(response.data.lastLogin),
        };
      }

      throw new Error(response.message || 'Failed to create user');
    } catch (error: any) {
      console.error('Create user error:', error);
      throw new Error(error.message || 'Failed to create user');
    }
  }

  async updateUserAsAdmin(id: string, updates: Partial<User>): Promise<User> {
    try {
      const response = await apiClient.put<any>(`/admin/users/${id}`, updates);

      // Backend returns the updated user object
      if (response.success && response.data) {
        const u = response.data;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          avatar: u.avatarUrl || '',
          role: u.role?.toLowerCase() as "user" | "admin",
          createdAt: new Date(u.createdAt),
          lastLogin: new Date(u.lastLoginAt || u.createdAt),
          subscription: u.subscription?.toLowerCase() as "free" | "pro" | "enterprise" || "free",
          storageUsed: u.storageUsed || 0,
          meetingsThisMonth: u.totalMeetings || 0,
          darkMode: true,
          notifications: { meetingReminders: true, summaryReady: true, adminMessages: u.role === 'ADMIN' },
          preferences: { autoGenerateNotes: true, enableRealTimeTranscript: true, autoExportSummaries: false },
        };
      }

      throw new Error(response.message || 'Failed to update user');
    } catch (error: any) {
      console.error('Update user as admin error:', error);
      throw new Error(error.message || 'Failed to update user');
    }
  }

  async deleteUserAsAdmin(id: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/admin/users/${id}`);

      if (!response.success) {
        throw new Error(response.message || 'Failed to delete user');
      }
    } catch (error: any) {
      console.error('Delete user as admin error:', error);
      throw new Error(error.message || 'Failed to delete user');
    }
  }

  isAuthenticated(): boolean {
    return apiClient.isAuthenticated();
  }

  getToken(): string | null {
    return apiClient.getToken();
  }
}

// Create singleton instance
export const authService = new AuthService();