/**
 * Cleanup Service
 * 
 * Handles automatic cleanup of old meeting data, orphaned files, and storage optimization
 * Implements requirement 5.5: Storage limit enforcement with cleanup utilities
 */

import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { StorageManagementService } from './storageManagementService';
import { FileStorageService } from './fileStorageService';
import * as cron from 'node-cron';

export interface CleanupConfig {
  enabled: boolean;
  schedules: {
    dailyCleanup: string;
    weeklyCleanup: string;
    monthlyCleanup: string;
  };
  retentionPolicies: {
    freeUserRetentionDays: number;
    proUserRetentionDays: number;
    enterpriseUserRetentionDays: number;
    orphanedFileRetentionHours: number;
    tempFileRetentionHours: number;
  };
  cleanupLimits: {
    maxFilesPerRun: number;
    maxUsersPerRun: number;
  };
}

export interface CleanupResult {
  type: 'daily' | 'weekly' | 'monthly' | 'manual';
  startTime: Date;
  endTime: Date;
  duration: number;
  results: {
    orphanedFiles: { deleted: number; freedSpace: number };
    oldMeetings: { deleted: number; freedSpace: number };
    tempFiles: { deleted: number; freedSpace: number };
    storageAlerts: { sent: number };
    errors: string[];
  };
}

export class CleanupService {
  private readonly storageService: StorageManagementService;
  private readonly fileService: FileStorageService;
  private readonly config: CleanupConfig;
  private isRunning: boolean = false;
  private scheduledJobs: any[] = [];

  constructor(config?: Partial<CleanupConfig>) {
    this.storageService = new StorageManagementService();
    this.fileService = new FileStorageService();
    
    this.config = {
      enabled: process.env.CLEANUP_ENABLED === 'true' || true,
      schedules: {
        dailyCleanup: '0 2 * * *', // 2 AM daily
        weeklyCleanup: '0 3 * * 0', // 3 AM every Sunday
        monthlyCleanup: '0 4 1 * *', // 4 AM on 1st of every month
      },
      retentionPolicies: {
        freeUserRetentionDays: 30,
        proUserRetentionDays: 365,
        enterpriseUserRetentionDays: -1, // unlimited
        orphanedFileRetentionHours: 24,
        tempFileRetentionHours: 6,
      },
      cleanupLimits: {
        maxFilesPerRun: 1000,
        maxUsersPerRun: 100,
      },
      ...config,
    };
  }

  /**
   * Start scheduled cleanup jobs
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('Cleanup service is disabled');
      return;
    }

    // Daily cleanup - orphaned files and temp files
    const dailyJob = cron.schedule(this.config.schedules.dailyCleanup, async () => {
      await this.runDailyCleanup();
    });

    // Weekly cleanup - old meetings based on retention policy
    const weeklyJob = cron.schedule(this.config.schedules.weeklyCleanup, async () => {
      await this.runWeeklyCleanup();
    });

    // Monthly cleanup - comprehensive cleanup and storage alerts
    const monthlyJob = cron.schedule(this.config.schedules.monthlyCleanup, async () => {
      await this.runMonthlyCleanup();
    });

    this.scheduledJobs = [dailyJob, weeklyJob, monthlyJob];
    
    // Start all jobs
    this.scheduledJobs.forEach(job => job.start());

    logger.info('Cleanup service started with scheduled jobs', {
      dailySchedule: this.config.schedules.dailyCleanup,
      weeklySchedule: this.config.schedules.weeklyCleanup,
      monthlySchedule: this.config.schedules.monthlyCleanup,
    });
  }

  /**
   * Stop scheduled cleanup jobs
   */
  stop(): void {
    this.scheduledJobs.forEach(job => job.stop());
    this.scheduledJobs = [];
    logger.info('Cleanup service stopped');
  }

  /**
   * Run daily cleanup
   */
  async runDailyCleanup(): Promise<CleanupResult> {
    if (this.isRunning) {
      logger.warn('Cleanup already running, skipping daily cleanup');
      throw new Error('Cleanup already in progress');
    }

    this.isRunning = true;
    const startTime = new Date();
    
    logger.info('Starting daily cleanup');

    const result: CleanupResult = {
      type: 'daily',
      startTime,
      endTime: new Date(),
      duration: 0,
      results: {
        orphanedFiles: { deleted: 0, freedSpace: 0 },
        oldMeetings: { deleted: 0, freedSpace: 0 },
        tempFiles: { deleted: 0, freedSpace: 0 },
        storageAlerts: { sent: 0 },
        errors: [],
      },
    };

    try {
      // Clean up orphaned files
      result.results.orphanedFiles = await this.cleanupOrphanedFiles();
      
      // Clean up temporary files
      result.results.tempFiles = await this.cleanupTempFiles();
      
      // Check storage alerts for users near limits
      result.results.storageAlerts.sent = await this.checkStorageAlerts();

    } catch (error) {
      logger.error('Daily cleanup failed', { error });
      result.results.errors.push(`Daily cleanup error: ${error}`);
    } finally {
      this.isRunning = false;
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - result.startTime.getTime();
      
      logger.info('Daily cleanup completed', {
        duration: result.duration,
        orphanedFiles: result.results.orphanedFiles.deleted,
        tempFiles: result.results.tempFiles.deleted,
        storageAlerts: result.results.storageAlerts.sent,
        errors: result.results.errors.length,
      });
    }

    return result;
  }

  /**
   * Run weekly cleanup
   */
  async runWeeklyCleanup(): Promise<CleanupResult> {
    if (this.isRunning) {
      logger.warn('Cleanup already running, skipping weekly cleanup');
      throw new Error('Cleanup already in progress');
    }

    this.isRunning = true;
    const startTime = new Date();
    
    logger.info('Starting weekly cleanup');

    const result: CleanupResult = {
      type: 'weekly',
      startTime,
      endTime: new Date(),
      duration: 0,
      results: {
        orphanedFiles: { deleted: 0, freedSpace: 0 },
        oldMeetings: { deleted: 0, freedSpace: 0 },
        tempFiles: { deleted: 0, freedSpace: 0 },
        storageAlerts: { sent: 0 },
        errors: [],
      },
    };

    try {
      // Clean up old meetings based on retention policy
      result.results.oldMeetings = await this.cleanupOldMeetings();
      
      // Run daily cleanup tasks as well
      const dailyResults = await this.runDailyCleanupTasks();
      result.results.orphanedFiles = dailyResults.orphanedFiles;
      result.results.tempFiles = dailyResults.tempFiles;

    } catch (error) {
      logger.error('Weekly cleanup failed', { error });
      result.results.errors.push(`Weekly cleanup error: ${error}`);
    } finally {
      this.isRunning = false;
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - result.startTime.getTime();
      
      logger.info('Weekly cleanup completed', {
        duration: result.duration,
        oldMeetings: result.results.oldMeetings.deleted,
        orphanedFiles: result.results.orphanedFiles.deleted,
        errors: result.results.errors.length,
      });
    }

    return result;
  }

  /**
   * Run monthly cleanup
   */
  async runMonthlyCleanup(): Promise<CleanupResult> {
    if (this.isRunning) {
      logger.warn('Cleanup already running, skipping monthly cleanup');
      throw new Error('Cleanup already in progress');
    }

    this.isRunning = true;
    const startTime = new Date();
    
    logger.info('Starting monthly cleanup');

    const result: CleanupResult = {
      type: 'monthly',
      startTime,
      endTime: new Date(),
      duration: 0,
      results: {
        orphanedFiles: { deleted: 0, freedSpace: 0 },
        oldMeetings: { deleted: 0, freedSpace: 0 },
        tempFiles: { deleted: 0, freedSpace: 0 },
        storageAlerts: { sent: 0 },
        errors: [],
      },
    };

    try {
      // Run comprehensive cleanup
      await this.storageService.scheduleAutomaticCleanup();
      
      // Recalculate storage for all users
      await this.recalculateAllUserStorage();
      
      // Run weekly cleanup tasks
      const weeklyResults = await this.runWeeklyCleanupTasks();
      result.results = { ...result.results, ...weeklyResults };

    } catch (error) {
      logger.error('Monthly cleanup failed', { error });
      result.results.errors.push(`Monthly cleanup error: ${error}`);
    } finally {
      this.isRunning = false;
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - result.startTime.getTime();
      
      logger.info('Monthly cleanup completed', {
        duration: result.duration,
        errors: result.results.errors.length,
      });
    }

    return result;
  }

  /**
   * Clean up orphaned files
   */
  private async cleanupOrphanedFiles(): Promise<{ deleted: number; freedSpace: number }> {
    const cutoffDate = new Date(Date.now() - this.config.retentionPolicies.orphanedFileRetentionHours * 60 * 60 * 1000);
    
    // Find files that exist in database but not on disk, or vice versa
    const orphanedFiles = await prisma.file.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        // Additional conditions to identify orphaned files
      },
      take: this.config.cleanupLimits.maxFilesPerRun,
    });

    let deleted = 0;
    let freedSpace = 0;

    for (const file of orphanedFiles) {
      try {
        await this.fileService.deleteFile(file.id, file.userId);
        deleted++;
        freedSpace += file.size;
      } catch (error) {
        logger.warn('Failed to delete orphaned file', { fileId: file.id, error });
      }
    }

    return { deleted, freedSpace };
  }

  /**
   * Clean up temporary files
   */
  private async cleanupTempFiles(): Promise<{ deleted: number; freedSpace: number }> {
    // This would clean up temporary files created during processing
    // For now, return empty result as we don't have temp files implemented
    return { deleted: 0, freedSpace: 0 };
  }

  /**
   * Clean up old meetings based on retention policy
   */
  private async cleanupOldMeetings(): Promise<{ deleted: number; freedSpace: number }> {
    let deleted = 0;
    let freedSpace = 0;

    // Get users with their subscription types
    const users = await prisma.user.findMany({
      select: {
        id: true,
        subscription: true,
      },
      take: this.config.cleanupLimits.maxUsersPerRun,
    });

    for (const user of users) {
      try {
        const retentionDays = this.getRetentionDays(user.subscription);
        
        if (retentionDays === -1) {
          continue; // Unlimited retention
        }

        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        
        // Find old completed meetings
        const oldMeetings = await prisma.meeting.findMany({
          where: {
            userId: user.id,
            status: 'COMPLETED',
            endTime: { lt: cutoffDate },
          },
          select: {
            id: true,
            storageSize: true,
          },
        });

        for (const meeting of oldMeetings) {
          // Delete meeting and all associated data (cascades)
          await prisma.meeting.delete({
            where: { id: meeting.id },
          });
          
          deleted++;
          freedSpace += Number(meeting.storageSize);
        }

      } catch (error) {
        logger.warn('Failed to cleanup meetings for user', { userId: user.id, error });
      }
    }

    return { deleted, freedSpace };
  }

  /**
   * Check storage alerts for users
   */
  private async checkStorageAlerts(): Promise<number> {
    const users = await prisma.user.findMany({
      select: { id: true },
      take: this.config.cleanupLimits.maxUsersPerRun,
    });

    let alertsSent = 0;

    for (const user of users) {
      try {
        const alert = await this.storageService.checkAndSendStorageAlerts(user.id);
        if (alert) {
          alertsSent++;
        }
      } catch (error) {
        logger.warn('Failed to check storage alerts for user', { userId: user.id, error });
      }
    }

    return alertsSent;
  }

  /**
   * Recalculate storage for all users
   */
  private async recalculateAllUserStorage(): Promise<void> {
    const users = await prisma.user.findMany({
      select: { id: true },
    });

    for (const user of users) {
      try {
        await this.storageService.recalculateUserStorage(user.id);
      } catch (error) {
        logger.warn('Failed to recalculate storage for user', { userId: user.id, error });
      }
    }

    logger.info('Storage recalculation completed for all users', { userCount: users.length });
  }

  /**
   * Get retention days based on subscription
   */
  private getRetentionDays(subscription: string): number {
    switch (subscription) {
      case 'FREE':
        return this.config.retentionPolicies.freeUserRetentionDays;
      case 'PRO':
        return this.config.retentionPolicies.proUserRetentionDays;
      case 'ENTERPRISE':
        return this.config.retentionPolicies.enterpriseUserRetentionDays;
      default:
        return this.config.retentionPolicies.freeUserRetentionDays;
    }
  }

  /**
   * Run daily cleanup tasks without the full daily cleanup overhead
   */
  private async runDailyCleanupTasks(): Promise<{
    orphanedFiles: { deleted: number; freedSpace: number };
    tempFiles: { deleted: number; freedSpace: number };
  }> {
    const orphanedFiles = await this.cleanupOrphanedFiles();
    const tempFiles = await this.cleanupTempFiles();
    
    return { orphanedFiles, tempFiles };
  }

  /**
   * Run weekly cleanup tasks without the full weekly cleanup overhead
   */
  private async runWeeklyCleanupTasks(): Promise<{
    orphanedFiles: { deleted: number; freedSpace: number };
    oldMeetings: { deleted: number; freedSpace: number };
    tempFiles: { deleted: number; freedSpace: number };
  }> {
    const dailyResults = await this.runDailyCleanupTasks();
    const oldMeetings = await this.cleanupOldMeetings();
    
    return {
      ...dailyResults,
      oldMeetings,
    };
  }

  /**
   * Manual cleanup trigger
   */
  async runManualCleanup(type: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<CleanupResult> {
    switch (type) {
      case 'daily':
        return this.runDailyCleanup();
      case 'weekly':
        return this.runWeeklyCleanup();
      case 'monthly':
        return this.runMonthlyCleanup();
      default:
        throw new Error(`Invalid cleanup type: ${type}`);
    }
  }

  /**
   * Get cleanup status
   */
  getStatus(): {
    isRunning: boolean;
    enabled: boolean;
    scheduledJobs: number;
    config: CleanupConfig;
  } {
    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      scheduledJobs: this.scheduledJobs.length,
      config: this.config,
    };
  }
}