/**
 * Storage Management Service
 * 
 * Handles storage quota management, usage tracking, cleanup utilities, and notifications
 * Implements requirement 5.5: Storage limit enforcement with user options
 */

import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { NotificationService } from './notificationService';
import { FileStorageService } from './fileStorageService';
import {
  ValidationError,
  NotFoundError
} from '../middleware/errorHandler';

export interface StorageQuota {
  subscription: string;
  totalQuota: number;
  usedStorage: number;
  availableStorage: number;
  usagePercentage: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
}

export interface StorageUsageByCategory {
  category: string;
  fileCount: number;
  totalSize: number;
  percentage: number;
}

export interface StorageCleanupOptions {
  userId: string;
  categories?: string[];
  olderThanDays?: number;
  maxFilesToDelete?: number;
  dryRun?: boolean;
}

export interface StorageCleanupResult {
  deletedFiles: number;
  freedSpace: number;
  errors: string[];
  suggestions: string[];
}

export interface StorageAlert {
  type: 'warning' | 'critical' | 'exceeded';
  message: string;
  usagePercentage: number;
  recommendedActions: string[];
}

export class StorageManagementService {
  private readonly notificationService: NotificationService;
  private readonly fileStorageService: FileStorageService;

  // Storage quotas by subscription type (in bytes)
  private readonly quotas = {
    FREE: 1024 * 1024 * 1024, // 1GB
    PRO: 5 * 1024 * 1024 * 1024, // 5GB
    ENTERPRISE: 50 * 1024 * 1024 * 1024, // 50GB
  };

  // Warning thresholds
  private readonly warningThresholds = {
    warning: 0.8, // 80%
    critical: 0.95, // 95%
  };

  constructor() {
    this.notificationService = new NotificationService();
    this.fileStorageService = new FileStorageService();
  }

  /**
   * Get user storage quota information
   */
  async getUserStorageQuota(userId: string): Promise<StorageQuota> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        storageUsed: true,
        subscription: true,
        email: true,
        name: true
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const subscription = user.subscription as keyof typeof this.quotas;
    const totalQuota = this.quotas[subscription] || this.quotas.FREE;
    const usedStorage = Number(user.storageUsed);
    const availableStorage = Math.max(0, totalQuota - usedStorage);
    const usagePercentage = (usedStorage / totalQuota) * 100;

    const isNearLimit = usagePercentage >= this.warningThresholds.warning * 100;
    const isOverLimit = usagePercentage >= 100;

    return {
      subscription,
      totalQuota,
      usedStorage,
      availableStorage,
      usagePercentage,
      isNearLimit,
      isOverLimit,
    };
  }

  /**
   * Get detailed storage usage breakdown by category
   */
  async getStorageUsageBreakdown(userId: string): Promise<StorageUsageByCategory[]> {
    const files = await prisma.file.findMany({
      where: { userId },
      select: { category: true, size: true },
    });

    const categoryMap = new Map<string, { count: number; size: number }>();
    let totalSize = 0;

    // Aggregate by category
    for (const file of files) {
      const category = file.category;
      const existing = categoryMap.get(category) || { count: 0, size: 0 };

      categoryMap.set(category, {
        count: existing.count + 1,
        size: existing.size + file.size,
      });

      totalSize += file.size;
    }

    // Convert to array with percentages
    return Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      fileCount: data.count,
      totalSize: data.size,
      percentage: totalSize > 0 ? (data.size / totalSize) * 100 : 0,
    }));
  }

  /**
   * Check if user can upload a file of given size
   */
  async canUploadFile(userId: string, fileSize: number): Promise<{
    canUpload: boolean;
    reason?: string;
    quota: StorageQuota;
  }> {
    const quota = await this.getUserStorageQuota(userId);

    if (quota.isOverLimit) {
      return {
        canUpload: false,
        reason: 'Storage quota exceeded. Please free up space or upgrade your plan.',
        quota,
      };
    }

    if (quota.availableStorage < fileSize) {
      return {
        canUpload: false,
        reason: `File size (${this.formatBytes(fileSize)}) exceeds available storage (${this.formatBytes(quota.availableStorage)}).`,
        quota,
      };
    }

    return {
      canUpload: true,
      quota,
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

    // Check if we need to send alerts after the update
    if (sizeChange > 0) {
      await this.checkAndSendStorageAlerts(userId);
    }

    logger.info('Storage usage updated', {
      userId,
      sizeChange,
      changeType: sizeChange > 0 ? 'increase' : 'decrease',
    });
  }

  /**
   * Check storage usage and send alerts if necessary
   */
  async checkAndSendStorageAlerts(userId: string): Promise<StorageAlert | null> {
    const quota = await this.getUserStorageQuota(userId);

    let alert: StorageAlert | null = null;

    if (quota.isOverLimit) {
      alert = {
        type: 'exceeded',
        message: 'Storage quota exceeded! Upload functionality is disabled.',
        usagePercentage: quota.usagePercentage,
        recommendedActions: [
          'Delete old meeting recordings',
          'Remove unused attachments',
          'Export and delete old meetings',
          'Upgrade to a higher plan',
        ],
      };
    } else if (quota.usagePercentage >= this.warningThresholds.critical * 100) {
      alert = {
        type: 'critical',
        message: 'Storage usage is critically high (95%+). Consider freeing up space.',
        usagePercentage: quota.usagePercentage,
        recommendedActions: [
          'Delete unnecessary files',
          'Export old meetings',
          'Upgrade your plan',
        ],
      };
    } else if (quota.usagePercentage >= this.warningThresholds.warning * 100) {
      alert = {
        type: 'warning',
        message: 'Storage usage is high (80%+). Consider managing your files.',
        usagePercentage: quota.usagePercentage,
        recommendedActions: [
          'Review and delete old files',
          'Consider upgrading your plan',
        ],
      };
    }

    if (alert) {
      await this.sendStorageAlert(userId, alert);
    }

    return alert;
  }

  /**
   * Send storage alert notification
   */
  private async sendStorageAlert(userId: string, alert: StorageAlert): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user) return;

    try {
      await this.notificationService.sendNotification({
        title: `Storage ${alert.type}: ${alert.message}`,
        message: `Storage alert for ${user.name}: ${alert.message}. Usage: ${Math.round(alert.usagePercentage)}%`,
        severity: alert.type === 'exceeded' ? 'critical' : (alert.type === 'warning' ? 'medium' : 'high'),
        timestamp: new Date(),
        metadata: {
          userName: user.name,
          alertType: alert.type,
          usagePercentage: Math.round(alert.usagePercentage),
          recommendedActions: alert.recommendedActions,
        },
      });

      logger.info('Storage alert sent', {
        userId,
        alertType: alert.type,
        usagePercentage: alert.usagePercentage,
      });
    } catch (error) {
      logger.error('Failed to send storage alert', { userId, error });
    }
  }

  /**
   * Get cleanup suggestions for user
   */
  async getCleanupSuggestions(userId: string): Promise<{
    suggestions: Array<{
      type: string;
      description: string;
      potentialSavings: number;
      fileCount: number;
    }>;
    totalPotentialSavings: number;
  }> {
    const suggestions: Array<{ type: string; description: string; potentialSavings: number; fileCount: number; }> = [];
    let totalPotentialSavings = 0;

    // Old recordings (older than 90 days)
    const oldRecordings = await prisma.file.findMany({
      where: {
        userId,
        category: 'RECORDING',
        createdAt: {
          lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        },
      },
      select: { size: true },
    });

    if (oldRecordings.length > 0) {
      const savings = oldRecordings.reduce((sum, file) => sum + file.size, 0);
      suggestions.push({
        type: 'old_recordings',
        description: 'Delete meeting recordings older than 90 days',
        potentialSavings: savings,
        fileCount: oldRecordings.length,
      });
      totalPotentialSavings += savings;
    }

    // Large attachments (larger than 10MB)
    const largeAttachments = await prisma.file.findMany({
      where: {
        userId,
        category: 'ATTACHMENT',
        size: { gt: 10 * 1024 * 1024 },
      },
      select: { size: true },
    });

    if (largeAttachments.length > 0) {
      const savings = largeAttachments.reduce((sum, file) => sum + file.size, 0);
      suggestions.push({
        type: 'large_attachments',
        description: 'Review large attachments (>10MB)',
        potentialSavings: savings,
        fileCount: largeAttachments.length,
      });
      totalPotentialSavings += savings;
    }

    // Completed meetings without summaries (might be incomplete)
    const incompleteMeetings = await prisma.meeting.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        summaries: { none: {} },
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      select: { storageSize: true },
    });

    if (incompleteMeetings.length > 0) {
      const savings = incompleteMeetings.reduce((sum, meeting) => sum + Number(meeting.storageSize), 0);
      suggestions.push({
        type: 'incomplete_meetings',
        description: 'Remove incomplete meetings older than 30 days',
        potentialSavings: savings,
        fileCount: incompleteMeetings.length,
      });
      totalPotentialSavings += savings;
    }

    return {
      suggestions,
      totalPotentialSavings,
    };
  }

  /**
   * Perform storage cleanup based on options
   */
  async performCleanup(options: StorageCleanupOptions): Promise<StorageCleanupResult> {
    const result: StorageCleanupResult = {
      deletedFiles: 0,
      freedSpace: 0,
      errors: [],
      suggestions: [],
    };

    try {
      const { userId, categories, olderThanDays = 90, maxFilesToDelete = 100, dryRun = false } = options;

      // Build query conditions
      const whereConditions: any = {
        userId,
        createdAt: {
          lt: new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000),
        },
      };

      if (categories && categories.length > 0) {
        whereConditions.category = { in: categories };
      }

      // Find files to delete
      const filesToDelete = await prisma.file.findMany({
        where: whereConditions,
        orderBy: { createdAt: 'asc' },
        take: maxFilesToDelete,
      });

      if (dryRun) {
        result.suggestions.push(
          `Would delete ${filesToDelete.length} files`,
          `Would free ${this.formatBytes(filesToDelete.reduce((sum, f) => sum + f.size, 0))}`
        );
        return result;
      }

      // Delete files
      for (const file of filesToDelete) {
        try {
          await this.fileStorageService.deleteFile(file.id, userId);
          result.deletedFiles++;
          result.freedSpace += file.size;
        } catch (error) {
          result.errors.push(`Failed to delete file ${file.originalName}: ${error}`);
        }
      }

      logger.info('Storage cleanup completed', {
        userId,
        deletedFiles: result.deletedFiles,
        freedSpace: result.freedSpace,
        errors: result.errors.length,
      });

    } catch (error) {
      logger.error('Storage cleanup failed', { userId: options.userId, error });
      result.errors.push(`Cleanup failed: ${error}`);
    }

    return result;
  }

  /**
   * Recalculate user storage usage from actual files
   */
  async recalculateUserStorage(userId: string): Promise<{
    previousUsage: number;
    currentUsage: number;
    difference: number;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { storageUsed: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const previousUsage = Number(user.storageUsed);

    // Calculate actual usage from files
    const files = await prisma.file.findMany({
      where: { userId },
      select: { size: true },
    });

    const currentUsage = files.reduce((sum, file) => sum + file.size, 0);
    const difference = currentUsage - previousUsage;

    // Update user storage
    await prisma.user.update({
      where: { id: userId },
      data: { storageUsed: currentUsage },
    });

    logger.info('Storage usage recalculated', {
      userId,
      previousUsage,
      currentUsage,
      difference,
    });

    return {
      previousUsage,
      currentUsage,
      difference,
    };
  }

  /**
   * Get system-wide storage statistics (admin only)
   */
  async getSystemStorageStats(): Promise<{
    totalUsers: number;
    totalStorage: number;
    storageBySubscription: Record<string, { users: number; storage: number }>;
    topUsers: Array<{ userId: string; email: string; storage: number; subscription: string }>;
  }> {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        subscription: true,
        storageUsed: true,
      },
    });

    const storageBySubscription: Record<string, { users: number; storage: number }> = {};
    let totalStorage = 0;

    for (const user of users) {
      const storage = Number(user.storageUsed);
      totalStorage += storage;

      if (!storageBySubscription[user.subscription]) {
        storageBySubscription[user.subscription] = { users: 0, storage: 0 };
      }

      storageBySubscription[user.subscription]!.users++;
      storageBySubscription[user.subscription]!.storage += storage;
    }

    // Get top 10 users by storage
    const topUsers = users
      .sort((a, b) => Number(b.storageUsed) - Number(a.storageUsed))
      .slice(0, 10)
      .map(user => ({
        userId: user.id,
        email: user.email,
        storage: Number(user.storageUsed),
        subscription: user.subscription,
      }));

    return {
      totalUsers: users.length,
      totalStorage,
      storageBySubscription,
      topUsers,
    };
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Schedule automatic cleanup for all users
   */
  async scheduleAutomaticCleanup(): Promise<void> {
    logger.info('Starting automatic storage cleanup');

    const users = await prisma.user.findMany({
      select: { id: true },
    });

    for (const user of users) {
      try {
        const quota = await this.getUserStorageQuota(user.id);

        // Only cleanup if user is over 90% usage
        if (quota.usagePercentage > 90) {
          await this.performCleanup({
            userId: user.id,
            categories: ['RECORDING', 'ATTACHMENT'],
            olderThanDays: 180, // 6 months
            maxFilesToDelete: 50,
            dryRun: false,
          });
        }
      } catch (error) {
        logger.error('Automatic cleanup failed for user', { userId: user.id, error });
      }
    }

    logger.info('Automatic storage cleanup completed');
  }
}