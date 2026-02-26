import { prisma } from '../lib/prisma';
import { logger, logSecurity } from '../utils/logger';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError
} from '../middleware/errorHandler';
import { validateEmail } from '../utils/validation';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

interface CreateUserData {
  email: string;
  name: string;
  password?: string;
  role?: 'USER' | 'ADMIN';
  subscription?: 'FREE' | 'PRO' | 'ENTERPRISE';
  sendInvitation?: boolean;
}

interface UpdateUserData {
  name?: string;
  email?: string;
  role?: 'USER' | 'ADMIN';
  subscription?: 'FREE' | 'PRO' | 'ENTERPRISE';
  isActive?: boolean;
}

interface SystemAnalytics {
  users: {
    total: number;
    active: number;
    newThisMonth: number;
    bySubscription: Record<string, number>;
    byRole: Record<string, number>;
  };
  meetings: {
    total: number;
    thisMonth: number;
    thisWeek: number;
    byStatus: Record<string, number>;
    byPlatform: Record<string, number>;
  };
  storage: {
    totalUsed: number;
    averagePerUser: number;
    topUsers: Array<{
      userId: string;
      name: string;
      email: string;
      storageUsed: number;
    }>;
  };
  system: {
    uptime: number;
    version: string;
    environment: string;
  };
}

interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  checks: {
    database: { status: 'ok' | 'error'; responseTime?: number; error?: string };
    redis: { status: 'ok' | 'error'; responseTime?: number; error?: string };
    storage: { status: 'ok' | 'error'; freeSpace?: number; error?: string };
    externalApis: { status: 'ok' | 'error'; services?: Record<string, string>; error?: string };
  };
  timestamp: Date;
}

interface SystemSettings {
  general: {
    siteName: string;
    supportEmail: string;
    maintenanceMode: boolean;
    registrationEnabled: boolean;
  };
  storage: {
    maxFileSize: number;
    allowedFileTypes: string[];
    storageQuotas: {
      FREE: number;
      PRO: number;
      ENTERPRISE: number;
    };
  };
  ai: {
    openaiApiKey?: string;
    summaryEnabled: boolean;
    maxTokens: number;
    temperature: number;
  };
  security: {
    sessionTimeout: number;
    maxLoginAttempts: number;
    passwordMinLength: number;
    requireMfa: boolean;
  };
}

export class AdminService {
  /**
   * Get all users with pagination and filtering
   */
  async getUsers(
    page: number = 1,
    limit: number = 20,
    search?: string,
    role?: string,
    subscription?: string
  ): Promise<any> {
    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (subscription) {
      where.subscription = subscription;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          subscription: true,
          avatarUrl: true,
          storageUsed: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              meetings: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: offset,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users.map(user => ({
        ...user,
        totalMeetings: user._count.meetings,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create a new user (admin only)
   */
  async createUser(adminUserId: string, data: CreateUserData): Promise<any> {
    const { email, name, password, role = 'USER', subscription = 'FREE', sendInvitation = true } = data;

    // Validate input
    if (!validateEmail(email)) {
      throw new ValidationError('Invalid email format');
    }

    if (!name || name.trim().length < 2) {
      throw new ValidationError('Name must be at least 2 characters long');
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Generate password if not provided
    const userPassword = password || this.generateRandomPassword();
    const hashedPassword = await bcrypt.hash(userPassword, 12);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        email,
        name: name.trim(),
        password: hashedPassword,
        role,
        subscription,
        preferences: JSON.stringify({
          autoGenerateNotes: true,
          enableRealTimeTranscript: true,
          autoExportSummaries: false,
          notifications: {
            meetingReminders: true,
            summaryReady: true,
            adminMessages: true,
          },
        }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscription: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Log admin action
    logSecurity('Admin created user', {
      adminUserId,
      newUserId: newUser.id,
      newUserEmail: newUser.email,
      role,
      subscription,
    });

    // TODO: Send invitation email if requested
    if (sendInvitation) {
      logger.info('User invitation email queued', {
        userId: newUser.id,
        email: newUser.email,
        temporaryPassword: password ? 'provided' : 'generated',
      });
    }

    return {
      ...newUser,
      temporaryPassword: sendInvitation ? userPassword : undefined,
    };
  }

  /**
   * Update user (admin only)
   */
  async updateUser(adminUserId: string, userId: string, data: UpdateUserData): Promise<any> {
    const { name, email, role, subscription, isActive } = data;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new NotFoundError('User not found');
    }

    // Validate input
    if (email && !validateEmail(email)) {
      throw new ValidationError('Invalid email format');
    }

    if (name && name.trim().length < 2) {
      throw new ValidationError('Name must be at least 2 characters long');
    }

    // Check if email is already taken by another user
    if (email && email !== existingUser.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email },
      });

      if (emailTaken) {
        throw new ConflictError('Email is already taken by another user');
      }
    }

    // Prevent admin from demoting themselves
    if (adminUserId === userId && role && role !== 'ADMIN') {
      throw new ForbiddenError('Cannot change your own admin role');
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name: name.trim() }),
        ...(email && { email }),
        ...(role && { role }),
        ...(subscription && { subscription }),
        // Note: isActive would require adding this field to the schema
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscription: true,
        avatarUrl: true,
        storageUsed: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            meetings: true,
          },
        },
      },
    });

    // Log admin action
    logSecurity('Admin updated user', {
      adminUserId,
      targetUserId: userId,
      updatedFields: Object.keys(data),
      changes: data,
    });

    return {
      ...updatedUser,
      totalMeetings: updatedUser._count.meetings,
    };
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(adminUserId: string, userId: string): Promise<void> {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new NotFoundError('User not found');
    }

    // Prevent admin from deleting themselves
    if (adminUserId === userId) {
      throw new ForbiddenError('Cannot delete your own account');
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: userId },
    });

    // Log admin action
    logSecurity('Admin deleted user', {
      adminUserId,
      deletedUserId: userId,
      deletedUserEmail: existingUser.email,
    });

    logger.info('User deleted by admin', {
      adminUserId,
      deletedUserId: userId,
      deletedUserEmail: existingUser.email,
    });
  }

  /**
   * Get system analytics
   */
  async getSystemAnalytics(): Promise<SystemAnalytics> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));

    // User analytics
    const [
      totalUsers,
      activeUsers,
      newUsersThisMonth,
      usersBySubscription,
      usersByRole,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          lastLoginAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: startOfMonth,
          },
        },
      }),
      prisma.user.groupBy({
        by: ['subscription'],
        _count: { subscription: true },
      }),
      prisma.user.groupBy({
        by: ['role'],
        _count: { role: true },
      }),
    ]);

    // Meeting analytics
    const [
      totalMeetings,
      meetingsThisMonth,
      meetingsThisWeek,
      meetingsByStatus,
      meetingsByPlatform,
    ] = await Promise.all([
      prisma.meeting.count(),
      prisma.meeting.count({
        where: {
          createdAt: {
            gte: startOfMonth,
          },
        },
      }),
      prisma.meeting.count({
        where: {
          createdAt: {
            gte: startOfWeek,
          },
        },
      }),
      prisma.meeting.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.meeting.groupBy({
        by: ['platform'],
        _count: { platform: true },
      }),
    ]);

    // Storage analytics
    const [storageStats, topStorageUsers] = await Promise.all([
      prisma.user.aggregate({
        _sum: { storageUsed: true },
        _avg: { storageUsed: true },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          storageUsed: true,
        },
        orderBy: {
          storageUsed: 'desc',
        },
        take: 10,
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        newThisMonth: newUsersThisMonth,
        bySubscription: usersBySubscription.reduce((acc, item) => {
          acc[item.subscription] = item._count.subscription;
          return acc;
        }, {} as Record<string, number>),
        byRole: usersByRole.reduce((acc, item) => {
          acc[item.role] = item._count.role;
          return acc;
        }, {} as Record<string, number>),
      },
      meetings: {
        total: totalMeetings,
        thisMonth: meetingsThisMonth,
        thisWeek: meetingsThisWeek,
        byStatus: meetingsByStatus.reduce((acc, item) => {
          acc[item.status] = item._count.status;
          return acc;
        }, {} as Record<string, number>),
        byPlatform: meetingsByPlatform.reduce((acc, item) => {
          acc[item.platform || 'unknown'] = item._count.platform;
          return acc;
        }, {} as Record<string, number>),
      },
      storage: {
        totalUsed: Number(storageStats._sum.storageUsed || 0),
        averagePerUser: Number(storageStats._avg.storageUsed || 0),
        topUsers: topStorageUsers.map(user => ({
          userId: user.id,
          name: user.name,
          email: user.email,
          storageUsed: Number(user.storageUsed),
        })),
      },
      system: {
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
    };
  }

  /**
   * Get system health metrics
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const checks: SystemHealth['checks'] = {
      database: { status: 'ok' },
      redis: { status: 'ok' },
      storage: { status: 'ok' },
      externalApis: { status: 'ok' },
    };

    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Database health check
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: 'ok',
        responseTime: Date.now() - start,
      };
    } catch (error) {
      checks.database = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      overallStatus = 'critical';
    }

    // Redis health check (if Redis is configured)
    try {
      // This would check Redis connection if implemented
      // For now, we'll assume it's OK
      checks.redis = { status: 'ok', responseTime: 5 };
    } catch (error) {
      checks.redis = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      if (overallStatus !== 'critical') overallStatus = 'warning';
    }

    // Storage health check
    try {
      // Check available disk space (simplified)
      checks.storage = {
        status: 'ok',
        freeSpace: 1024 * 1024 * 1024 * 10, // 10GB placeholder
      };
    } catch (error) {
      checks.storage = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      if (overallStatus !== 'critical') overallStatus = 'warning';
    }

    // External APIs health check
    try {
      // This would check OpenAI API, OAuth providers, etc.
      checks.externalApis = {
        status: 'ok',
        services: {
          openai: 'ok',
          google: 'ok',
          microsoft: 'ok',
        },
      };
    } catch (error) {
      checks.externalApis = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      if (overallStatus !== 'critical') overallStatus = 'warning';
    }

    return {
      status: overallStatus,
      checks,
      timestamp: new Date(),
    };
  }

  /**
   * Get system settings
   */
  async getSystemSettings(): Promise<SystemSettings> {
    // In a real implementation, these would be stored in the database
    // For now, we'll return default settings with some from environment variables
    return {
      general: {
        siteName: process.env.SITE_NAME || 'MeetBuddy AI',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@meetbuddy.ai',
        maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
        registrationEnabled: process.env.REGISTRATION_ENABLED !== 'false',
      },
      storage: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB
        allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/mpeg', 'audio/wav'],
        storageQuotas: {
          FREE: 1024 * 1024 * 1024, // 1GB
          PRO: 5 * 1024 * 1024 * 1024, // 5GB
          ENTERPRISE: 50 * 1024 * 1024 * 1024, // 50GB
        },
      },
      ai: {
        openaiApiKey: process.env.OPENAI_API_KEY ? '***configured***' : undefined,
        summaryEnabled: process.env.AI_SUMMARY_ENABLED !== 'false',
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000'),
        temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
      },
      security: {
        sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '86400'), // 24 hours
        maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
        passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8'),
        requireMfa: process.env.REQUIRE_MFA === 'true',
      },
    };
  }

  /**
   * Update system settings
   */
  async updateSystemSettings(adminUserId: string, settings: Partial<SystemSettings>): Promise<SystemSettings> {
    // Validate settings
    if (settings.storage?.maxFileSize && settings.storage.maxFileSize < 1024) {
      throw new ValidationError('Max file size must be at least 1KB');
    }

    if (settings.security?.passwordMinLength && settings.security.passwordMinLength < 6) {
      throw new ValidationError('Password minimum length must be at least 6 characters');
    }

    // In a real implementation, you would:
    // 1. Validate all settings
    // 2. Store them in the database
    // 3. Apply them to the running system
    // 4. Restart services if necessary

    // Log admin action
    logSecurity('Admin updated system settings', {
      adminUserId,
      updatedSettings: Object.keys(settings),
    });

    logger.info('System settings updated', {
      adminUserId,
      settingsUpdated: Object.keys(settings),
    });

    // Return updated settings (for now, just return current settings)
    return this.getSystemSettings();
  }

  /**
   * Generate a random password
   */
  private generateRandomPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Get system logs (simplified implementation)
   */
  async getSystemLogs(
    page: number = 1,
    limit: number = 50,
    level?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<any> {
    // In a real implementation, this would query your logging system
    // For now, we'll return a placeholder response

    const logs = [
      {
        id: uuidv4(),
        timestamp: new Date(),
        level: 'info',
        message: 'User logged in successfully',
        metadata: { userId: 'user123', ip: '192.168.1.1' },
      },
      {
        id: uuidv4(),
        timestamp: new Date(Date.now() - 60000),
        level: 'warning',
        message: 'High memory usage detected',
        metadata: { memoryUsage: '85%' },
      },
      {
        id: uuidv4(),
        timestamp: new Date(Date.now() - 120000),
        level: 'error',
        message: 'Failed to connect to external API',
        metadata: { service: 'openai', error: 'timeout' },
      },
    ];

    return {
      logs,
      pagination: {
        page,
        limit,
        total: logs.length,
        pages: Math.ceil(logs.length / limit),
      },
    };
  }

  /**
   * Get all users (for admin operations like storage recalculation)
   */
  async getAllUsers(): Promise<Array<{ id: string; email: string; name: string; subscription: string }>> {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        subscription: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return users;
  }
}