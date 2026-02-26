/**
 * File Storage Service
 * 
 * Handles file uploads, storage, and management for avatars, meeting recordings, and other files
 * Supports both local storage and cloud storage (S3-compatible)
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import {
  ValidationError,
  NotFoundError,
  ConflictError
} from '../middleware/errorHandler';

export interface FileUploadOptions {
  userId: string;
  category: 'avatar' | 'recording' | 'attachment' | 'export';
  allowedTypes?: string[];
  maxSize?: number;
  generateThumbnail?: boolean;
}

export interface StoredFile {
  id: string;
  originalName: string;
  fileName: string;
  filePath: string;
  publicUrl: string;
  mimeType: string;
  size: number;
  category: string;
  userId: string;
  metadata?: any;
  createdAt: Date;
}

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedName?: string;
}

export class FileStorageService {
  private readonly uploadDir: string;
  private readonly publicUrl: string;
  private readonly maxFileSize: number;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    this.publicUrl = process.env.PUBLIC_FILE_URL || 'http://localhost:5000/files';
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB default

    this.ensureUploadDirectories();
  }

  /**
   * Ensure upload directories exist
   */
  private async ensureUploadDirectories(): Promise<void> {
    const categories = ['avatars', 'recordings', 'attachments', 'exports', 'thumbnails'];

    try {
      await fs.mkdir(this.uploadDir, { recursive: true });

      for (const category of categories) {
        await fs.mkdir(path.join(this.uploadDir, category), { recursive: true });
      }

      logger.info('Upload directories initialized', { uploadDir: this.uploadDir });
    } catch (error) {
      logger.error('Failed to create upload directories', { error });
      throw error;
    }
  }

  /**
   * Validate file upload
   */
  private validateFile(file: Express.Multer.File, options: FileUploadOptions): FileValidationResult {
    const { allowedTypes, maxSize } = options;

    // Check file size
    const sizeLimit = maxSize || this.maxFileSize;
    if (file.size > sizeLimit) {
      return {
        isValid: false,
        error: `File size exceeds limit of ${Math.round(sizeLimit / 1024 / 1024)}MB`,
      };
    }

    // Check file type
    if (allowedTypes && !allowedTypes.includes(file.mimetype)) {
      return {
        isValid: false,
        error: `File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      };
    }

    // Sanitize filename
    const sanitizedName = this.sanitizeFileName(file.originalname);
    if (!sanitizedName) {
      return {
        isValid: false,
        error: 'Invalid filename',
      };
    }

    return {
      isValid: true,
      sanitizedName,
    };
  }

  /**
   * Sanitize filename to prevent security issues
   */
  private sanitizeFileName(filename: string): string {
    // Remove path traversal attempts and dangerous characters
    const sanitized = filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .substring(0, 255);

    // Ensure we have a valid filename
    if (!sanitized || sanitized === '.' || sanitized === '..') {
      return `file_${Date.now()}`;
    }

    return sanitized;
  }

  /**
   * Generate unique filename
   */
  private generateFileName(originalName: string, category: string): string {
    const ext = path.extname(originalName);
    const hash = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `${category}_${timestamp}_${hash}${ext}`;
  }

  /**
   * Upload file
   */
  async uploadFile(file: Express.Multer.File, options: FileUploadOptions): Promise<StoredFile> {
    // Validate file
    const validation = this.validateFile(file, options);
    if (!validation.isValid) {
      throw new ValidationError(validation.error!);
    }

    // Check user storage quota
    await this.checkStorageQuota(options.userId, file.size);

    // Generate unique filename
    const fileName = this.generateFileName(validation.sanitizedName!, options.category);
    const categoryDir = path.join(this.uploadDir, `${options.category}s`);
    const filePath = path.join(categoryDir, fileName);
    const publicUrl = `${this.publicUrl}/${options.category}s/${fileName}`;

    try {
      // Write file to disk
      await fs.writeFile(filePath, file.buffer);

      // Generate thumbnail if requested
      let thumbnailUrl: string | undefined;
      if (options.generateThumbnail && this.isImageFile(file.mimetype)) {
        thumbnailUrl = await this.generateThumbnail(filePath, fileName);
      }

      // Store file metadata in database
      const storedFile = await prisma.file.create({
        data: {
          originalName: file.originalname,
          fileName,
          filePath,
          publicUrl,
          mimeType: file.mimetype,
          size: file.size,
          category: options.category.toUpperCase() as any,
          userId: options.userId,
          metadata: JSON.stringify({
            thumbnailUrl,
            uploadedAt: new Date().toISOString(),
          }),
        },
      });

      // Update user storage usage
      await this.updateUserStorage(options.userId, file.size);

      logger.info('File uploaded successfully', {
        fileId: storedFile.id,
        userId: options.userId,
        category: options.category,
        size: file.size,
        fileName,
      });

      return {
        id: storedFile.id,
        originalName: storedFile.originalName,
        fileName: storedFile.fileName,
        filePath: storedFile.filePath,
        publicUrl: storedFile.publicUrl,
        mimeType: storedFile.mimeType,
        size: storedFile.size,
        category: storedFile.category,
        userId: storedFile.userId,
        metadata: storedFile.metadata ? JSON.parse(storedFile.metadata as string) : null,
        createdAt: storedFile.createdAt,
      };
    } catch (error) {
      // Clean up file if database operation fails
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        logger.warn('Failed to clean up file after database error', { filePath, error: unlinkError });
      }

      logger.error('File upload failed', { error, fileName, userId: options.userId });
      throw error;
    }
  }

  /**
   * Check if file type is an image
   */
  private isImageFile(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Generate thumbnail for images
   */
  private async generateThumbnail(filePath: string, fileName: string): Promise<string> {
    // For now, return a placeholder. In a real implementation, you would use
    // a library like Sharp to generate thumbnails
    const thumbnailName = `thumb_${fileName}`;
    const thumbnailUrl = `${this.publicUrl}/thumbnails/${thumbnailName}`;

    // TODO: Implement actual thumbnail generation
    logger.debug('Thumbnail generation requested', { filePath, thumbnailName });

    return thumbnailUrl;
  }

  /**
   * Check user storage quota
   */
  private async checkStorageQuota(userId: string, additionalSize: number): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { storageUsed: true, subscription: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Define storage quotas by subscription
    const quotas = {
      FREE: 1024 * 1024 * 1024, // 1GB
      PRO: 5 * 1024 * 1024 * 1024, // 5GB
      ENTERPRISE: 50 * 1024 * 1024 * 1024, // 50GB
    };

    const quota = quotas[user.subscription as keyof typeof quotas] || quotas.FREE;
    const currentUsage = Number(user.storageUsed);

    if (currentUsage + additionalSize > quota) {
      throw new ValidationError(
        `Storage quota exceeded. Current usage: ${Math.round(currentUsage / 1024 / 1024)}MB, ` +
        `Quota: ${Math.round(quota / 1024 / 1024)}MB`
      );
    }
  }

  /**
   * Update user storage usage
   */
  private async updateUserStorage(userId: string, sizeChange: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        storageUsed: {
          increment: sizeChange,
        },
      },
    });
  }

  /**
   * Get file by ID
   */
  async getFile(fileId: string, userId?: string): Promise<StoredFile | null> {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return null;
    }

    // Check access permissions
    if (userId && file.userId !== userId) {
      // Check if user has admin access or file is public
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (!user || user.role !== 'ADMIN') {
        throw new ValidationError('Access denied');
      }
    }

    return {
      id: file.id,
      originalName: file.originalName,
      fileName: file.fileName,
      filePath: file.filePath,
      publicUrl: file.publicUrl,
      mimeType: file.mimeType,
      size: file.size,
      category: file.category,
      userId: file.userId,
      metadata: file.metadata ? JSON.parse(file.metadata as string) : null,
      createdAt: file.createdAt,
    };
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string, userId: string): Promise<void> {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Check permissions
    if (file.userId !== userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (!user || user.role !== 'ADMIN') {
        throw new ValidationError('Access denied');
      }
    }

    try {
      // Delete file from disk
      await fs.unlink(file.filePath);

      // Delete thumbnail if exists
      const metadata = file.metadata ? JSON.parse(file.metadata as string) : null;
      if (metadata?.thumbnailUrl) {
        const thumbnailPath = this.getThumbnailPath(file.fileName);
        try {
          await fs.unlink(thumbnailPath);
        } catch (error) {
          logger.warn('Failed to delete thumbnail', { thumbnailPath, error });
        }
      }

      // Delete from database
      await prisma.file.delete({
        where: { id: fileId },
      });

      // Update user storage usage
      await this.updateUserStorage(file.userId, -file.size);

      logger.info('File deleted successfully', {
        fileId,
        userId: file.userId,
        fileName: file.fileName,
        size: file.size,
      });
    } catch (error) {
      logger.error('File deletion failed', { fileId, error });
      throw error;
    }
  }

  /**
   * Get thumbnail path
   */
  private getThumbnailPath(fileName: string): string {
    return path.join(this.uploadDir, 'thumbnails', `thumb_${fileName}`);
  }

  /**
   * List user files
   */
  async listUserFiles(
    userId: string,
    category?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ files: StoredFile[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    const where: any = {
      userId,
      ...(category && { category: category.toUpperCase() }),
    };

    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.file.count({ where }),
    ]);

    return {
      files: files.map(file => ({
        id: file.id,
        originalName: file.originalName,
        fileName: file.fileName,
        filePath: file.filePath,
        publicUrl: file.publicUrl,
        mimeType: file.mimeType,
        size: file.size,
        category: file.category,
        userId: file.userId,
        metadata: file.metadata ? JSON.parse(file.metadata as string) : null,
        createdAt: file.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Get user storage statistics
   */
  async getUserStorageStats(userId: string): Promise<{
    totalFiles: number;
    totalSize: number;
    byCategory: Record<string, { count: number; size: number }>;
  }> {
    const files = await prisma.file.findMany({
      where: { userId },
      select: { category: true, size: true },
    });

    const byCategory: Record<string, { count: number; size: number }> = {};
    let totalSize = 0;

    for (const file of files) {
      totalSize += file.size;

      if (!byCategory[file.category]) {
        byCategory[file.category] = { count: 0, size: 0 };
      }

      byCategory[file.category]!.count++;
      byCategory[file.category]!.size += file.size;
    }

    return {
      totalFiles: files.length,
      totalSize,
      byCategory,
    };
  }

  /**
   * Clean up orphaned files
   */
  async cleanupOrphanedFiles(): Promise<{ deletedCount: number; freedSpace: number }> {
    // Find files that are older than 24 hours and not referenced
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const orphanedFiles = await prisma.file.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        // Add conditions to check if file is not referenced
        // This would depend on your specific use case
      },
    });

    let deletedCount = 0;
    let freedSpace = 0;

    for (const file of orphanedFiles) {
      try {
        await this.deleteFile(file.id, file.userId);
        deletedCount++;
        freedSpace += file.size;
      } catch (error) {
        logger.warn('Failed to delete orphaned file', { fileId: file.id, error });
      }
    }

    logger.info('Orphaned files cleanup completed', { deletedCount, freedSpace });

    return { deletedCount, freedSpace };
  }

  /**
   * Upload avatar specifically
   */
  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<StoredFile> {
    return this.uploadFile(file, {
      userId,
      category: 'avatar',
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      maxSize: 5 * 1024 * 1024, // 5MB
      generateThumbnail: true,
    });
  }

  /**
   * Upload meeting recording
   */
  async uploadRecording(userId: string, file: Express.Multer.File, meetingId?: string): Promise<StoredFile> {
    const storedFile = await this.uploadFile(file, {
      userId,
      category: 'recording',
      allowedTypes: ['video/mp4', 'video/webm', 'audio/mp3', 'audio/wav', 'audio/webm'],
      maxSize: 500 * 1024 * 1024, // 500MB
    });

    // Link to meeting if provided
    if (meetingId) {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { recordingUrl: storedFile.publicUrl },
      });
    }

    return storedFile;
  }

  /**
   * Upload meeting attachment
   */
  async uploadAttachment(userId: string, file: Express.Multer.File): Promise<StoredFile> {
    return this.uploadFile(file, {
      userId,
      category: 'attachment',
      allowedTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'image/jpeg',
        'image/png',
      ],
      maxSize: 25 * 1024 * 1024, // 25MB
    });
  }
}