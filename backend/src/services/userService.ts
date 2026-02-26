import { prisma } from '../lib/prisma';
import { userCache } from '../utils/cache';
import { logger } from '../utils/logger';
import { 
  ValidationError, 
  NotFoundError,
  ConflictError 
} from '../middleware/errorHandler';
import { validateEmail } from '../utils/validation';

interface UpdateProfileData {
  name?: string;
  avatarUrl?: string;
}

interface UpdatePreferencesData {
  autoGenerateNotes?: boolean;
  enableRealTimeTranscript?: boolean;
  autoExportSummaries?: boolean;
  notifications?: {
    meetingReminders?: boolean;
    summaryReady?: boolean;
    adminMessages?: boolean;
  };
}

interface UserStats {
  totalMeetings: number;
  meetingsThisMonth: number;
  meetingsThisWeek: number;
  storageUsed: number;
  storageQuota: number;
}

export class UserService {
  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string): Promise<any> {
    // Try cache first
    const cachedUser = await userCache.get(userId);
    if (cachedUser) {
      return cachedUser;
    }

    // Get from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscription: true,
        avatarUrl: true,
        preferences: true,
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

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const userProfile = {
      ...user,
      preferences: user.preferences ? JSON.parse(user.preferences as string) : null,
      totalMeetings: user._count.meetings,
    };

    // Cache user data
    await userCache.set(userId, userProfile);

    return userProfile;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: UpdateProfileData): Promise<any> {
    const { name, avatarUrl } = data;

    // Validate input
    if (name !== undefined) {
      if (!name || name.trim().length < 2) {
        throw new ValidationError('Name must be at least 2 characters long');
      }
      if (name.trim().length > 100) {
        throw new ValidationError('Name must not exceed 100 characters');
      }
    }

    if (avatarUrl !== undefined && avatarUrl !== '') {
      // Basic URL validation
      try {
        new URL(avatarUrl);
      } catch {
        throw new ValidationError('Avatar URL must be a valid URL');
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscription: true,
        avatarUrl: true,
        preferences: true,
        storageUsed: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    // Invalidate cache
    await userCache.invalidate(userId);

    logger.info('User profile updated', {
      userId,
      updatedFields: Object.keys(data),
    });

    return {
      ...updatedUser,
      preferences: updatedUser.preferences ? JSON.parse(updatedUser.preferences as string) : null,
    };
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, data: UpdatePreferencesData): Promise<any> {
    // Get current user to merge preferences
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    if (!currentUser) {
      throw new NotFoundError('User not found');
    }

    // Merge preferences
    const currentPrefs = currentUser.preferences ? JSON.parse(currentUser.preferences as string) : {};
    const newPreferences = {
      ...currentPrefs,
      ...data,
      notifications: {
        ...currentPrefs.notifications,
        ...data.notifications,
      },
    };

    // Update user preferences
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { preferences: JSON.stringify(newPreferences) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscription: true,
        avatarUrl: true,
        preferences: true,
        storageUsed: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    // Invalidate cache
    await userCache.invalidate(userId);

    logger.info('User preferences updated', {
      userId,
      updatedPreferences: Object.keys(data),
    });

    return {
      ...updatedUser,
      preferences: updatedUser.preferences ? JSON.parse(updatedUser.preferences as string) : null,
    };
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<UserStats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));

    // Get user with meeting counts
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        storageUsed: true,
        subscription: true,
        _count: {
          select: {
            meetings: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Get meetings this month
    const meetingsThisMonth = await prisma.meeting.count({
      where: {
        userId,
        createdAt: {
          gte: startOfMonth,
        },
      },
    });

    // Get meetings this week
    const meetingsThisWeek = await prisma.meeting.count({
      where: {
        userId,
        createdAt: {
          gte: startOfWeek,
        },
      },
    });

    // Determine storage quota based on subscription
    const storageQuotas = {
      FREE: 1024 * 1024 * 1024, // 1GB
      PRO: 5 * 1024 * 1024 * 1024, // 5GB
      ENTERPRISE: 50 * 1024 * 1024 * 1024, // 50GB
    };

    const storageQuota = storageQuotas[user.subscription as keyof typeof storageQuotas] || storageQuotas.FREE;

    return {
      totalMeetings: user._count.meetings,
      meetingsThisMonth,
      meetingsThisWeek,
      storageUsed: Number(user.storageUsed),
      storageQuota,
    };
  }

  /**
   * Upload avatar using file storage service
   */
  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<string> {
    const { FileStorageService } = await import('./fileStorageService');
    const fileStorageService = new FileStorageService();
    
    const storedFile = await fileStorageService.uploadAvatar(userId, file);
    
    // Update user avatar URL
    await this.updateProfile(userId, { avatarUrl: storedFile.publicUrl });

    logger.info('Avatar uploaded', {
      userId,
      fileId: storedFile.id,
      fileName: storedFile.originalName,
      fileSize: storedFile.size,
      avatarUrl: storedFile.publicUrl,
    });

    return storedFile.publicUrl;
  }

  /**
   * Delete user account
   */
  async deleteAccount(userId: string): Promise<void> {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: userId },
    });

    // Invalidate cache
    await userCache.invalidate(userId);

    logger.info('User account deleted', {
      userId,
      email: user.email,
    });
  }

  /**
   * Check if user has reached storage limit
   */
  async checkStorageLimit(userId: string): Promise<{ hasSpace: boolean; usage: number; quota: number }> {
    const stats = await this.getUserStats(userId);
    
    return {
      hasSpace: stats.storageUsed < stats.storageQuota,
      usage: stats.storageUsed,
      quota: stats.storageQuota,
    };
  }

  /**
   * Update user storage usage
   */
  async updateStorageUsage(userId: string, sizeChange: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        storageUsed: {
          increment: sizeChange,
        },
      },
    });

    // Invalidate cache
    await userCache.invalidate(userId);

    logger.debug('Storage usage updated', {
      userId,
      sizeChange,
    });
  }

  /**
   * Get user activity summary
   */
  async getUserActivity(userId: string, days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get recent meetings
    const recentMeetings = await prisma.meeting.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        startTime: true,
        endTime: true,
        platform: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    // Get meeting counts by status
    const meetingsByStatus = await prisma.meeting.groupBy({
      by: ['status'],
      where: {
        userId,
        createdAt: {
          gte: startDate,
        },
      },
      _count: {
        status: true,
      },
    });

    // Get platform usage
    const platformUsage = await prisma.meeting.groupBy({
      by: ['platform'],
      where: {
        userId,
        createdAt: {
          gte: startDate,
        },
      },
      _count: {
        platform: true,
      },
    });

    return {
      period: `${days} days`,
      recentMeetings,
      meetingsByStatus: meetingsByStatus.reduce((acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      }, {} as Record<string, number>),
      platformUsage: platformUsage.reduce((acc, item) => {
        acc[item.platform] = item._count.platform;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Search users (admin only)
   */
  async searchUsers(query: string, page: number = 1, limit: number = 20): Promise<any> {
    const offset = (page - 1) * limit;

    const where = query ? {
      OR: [
        { name: { contains: query, mode: 'insensitive' as const } },
        { email: { contains: query, mode: 'insensitive' as const } },
      ],
    } : {};

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
          createdAt: true,
          lastLoginAt: true,
          storageUsed: true,
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
}