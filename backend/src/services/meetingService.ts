import { prisma } from '../lib/prisma';
import { meetingCache } from '../utils/cache';
import { logger } from '../utils/logger';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError
} from '../middleware/errorHandler';

// Define platform and status types as string literals
type Platform = 'GOOGLE_MEET' | 'ZOOM' | 'MICROSOFT_TEAMS' | 'WEBEX' | 'DISCORD' | 'SKYPE';
type MeetingStatus = 'SCHEDULED' | 'RECORDING' | 'COMPLETED' | 'CANCELLED';

interface CreateMeetingData {
  title: string;
  description?: string;
  platform: Platform;
  meetingUrl?: string;
  scheduledTime: Date;
  participants?: string[];
}

interface UpdateMeetingData {
  title?: string;
  description?: string;
  scheduledTime?: Date;
  participants?: string[];
  status?: MeetingStatus;
  recordingUrl?: string;
  storageSize?: number;
}

interface MeetingFilters {
  status?: MeetingStatus;
  platform?: Platform;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'scheduledTime' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export class MeetingService {
  /**
   * Create a new meeting
   */
  async createMeeting(userId: string, data: CreateMeetingData) {
    const { title, description, platform, meetingUrl, scheduledTime, participants = [] } = data;

    // Validate input
    if (!title || title.trim().length < 1) {
      throw new ValidationError('Meeting title is required');
    }

    // Allow up to 5 minutes in the past to account for clock drift
    if (!scheduledTime || scheduledTime < new Date(Date.now() - 5 * 60 * 1000)) {
      throw new ValidationError('Scheduled time must be in the future');
    }

    if (meetingUrl && !this.isValidMeetingUrl(meetingUrl, platform)) {
      throw new ValidationError('Invalid meeting URL for the selected platform');
    }

    // Check user exists and has permission
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscription: true, storageUsed: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check meeting limits based on subscription
    const meetingCount = await prisma.meeting.count({
      where: {
        userId,
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    });

    const limits = this.getSubscriptionLimits(user.subscription);
    if (limits.monthlyMeetings !== -1 && meetingCount >= limits.monthlyMeetings) {
      throw new ConflictError('Monthly meeting limit reached for your subscription');
    }

    // Create meeting
    const meeting = await prisma.meeting.create({
      data: {
        title: title.trim(),
        description: description?.trim(),
        userId,
        platform,
        meetingUrl,
        scheduledTime,
        participants: JSON.stringify(participants.filter(p => p.trim().length > 0)),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Cache the meeting
    await meetingCache.set(meeting.id, meeting);

    logger.info('Meeting created successfully', {
      meetingId: meeting.id,
      userId,
      title: meeting.title,
      platform: meeting.platform,
      scheduledTime: meeting.scheduledTime,
    });

    // Convert BigInt values to numbers for JSON serialization
    return {
      ...meeting,
      participants: meeting.participants ? JSON.parse(meeting.participants as string) : [],
      storageSize: Number(meeting.storageSize),
    };
  }

  /**
   * Get meetings for a user with filtering and pagination
   */
  async getMeetings(
    userId: string,
    filters: MeetingFilters = {},
    pagination: PaginationOptions = {}
  ) {
    const {
      status,
      platform,
      startDate,
      endDate,
      search,
    } = filters;

    const {
      page = 1,
      limit = 20,
      sortBy = 'scheduledTime',
      sortOrder = 'desc',
    } = pagination;

    // Build where clause
    const where: any = { userId };

    if (status) {
      where.status = status;
    }

    if (platform) {
      where.platform = platform;
    }

    if (startDate || endDate) {
      where.scheduledTime = {};
      if (startDate) {
        where.scheduledTime.gte = startDate;
      }
      if (endDate) {
        where.scheduledTime.lte = endDate;
      }
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get meetings with count
    const [meetings, total] = await Promise.all([
      prisma.meeting.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          transcripts: {
            orderBy: { timestamp: 'asc' },
            take: 1000, // Load all transcripts so they persist on refresh
          },
          summaries: {
            orderBy: { generatedAt: 'desc' },
            take: 1, // Get latest summary
          },
          _count: {
            select: {
              transcripts: true,
              summaries: true,
            },
          },
        },
      }),
      prisma.meeting.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    // Convert BigInt values to numbers for JSON serialization
    const serializedMeetings = meetings.map(meeting => ({
      ...meeting,
      participants: meeting.participants ? JSON.parse(meeting.participants as string) : [],
      storageSize: Number(meeting.storageSize),
    }));

    logger.info('Meetings retrieved', {
      userId,
      count: meetings.length,
      total,
      page,
      filters,
    });

    return {
      meetings: serializedMeetings,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get a single meeting by ID
   */
  async getMeetingById(meetingId: string, userId: string, isAdmin: boolean = false) {
    // Always get fresh data from database for now (skip cache to debug)
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        transcripts: {
          orderBy: { timestamp: 'asc' },
          take: 100, // Limit initial transcript load
        },
        summaries: {
          orderBy: { generatedAt: 'desc' },
          take: 1, // Get latest summary
        },
        _count: {
          select: {
            transcripts: true,
            summaries: true,
          },
        },
      },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting not found');
    }

    // Check user has access to this meeting
    if (!isAdmin && meeting.userId !== userId) {
      throw new AuthorizationError('Access denied to this meeting');
    }

    // Cache the meeting after successful retrieval
    await meetingCache.set(meetingId, meeting);

    // Convert BigInt values to numbers for JSON serialization
    // Parse mind map JSON string if it exists
    let mindMap = undefined;
    if (meeting.mindMap) {
      try { mindMap = JSON.parse(meeting.mindMap); } catch (e) {}
    }

    return {
      ...meeting,
      participants: meeting.participants ? JSON.parse(meeting.participants as string) : [],
      storageSize: Number(meeting.storageSize),
      mindMap
    };
  }

  /**
   * Generates a mind map using AI and saves it to the meeting
   */
  async generateMindMap(meetingId: string, userId: string): Promise<any> {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { transcripts: { orderBy: { timestamp: 'asc' } } }
    });

    if (!meeting) throw new NotFoundError('Meeting not found');
    if (meeting.userId !== userId) throw new AuthorizationError('Not authorized');

    const transcriptText = meeting.transcripts
      .map(t => `${t.speaker}: ${t.text}`)
      .join('\n');

    if (!transcriptText) throw new ValidationError('Meeting has no transcripts yet');

    // Import aiService dynamically to avoid circular dependencies
    const { aiService } = require('./aiService');
    
    logger.info(`Generating Mind Map for meeting ${meetingId}`);
    const mindMapNode = await aiService.generateMindMap({
      transcript: transcriptText,
      meetingTitle: meeting.title
    });

    // Save to DB
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { mindMap: JSON.stringify(mindMapNode) }
    });

    return mindMapNode;
  }

  /**
   * Update a meeting
   */
  async updateMeeting(meetingId: string, userId: string, data: UpdateMeetingData) {
    const { title, description, scheduledTime, participants, status, recordingUrl, storageSize } = data;

    // Get existing meeting
    const existingMeeting = await this.getMeetingById(meetingId, userId);

    // Validate updates
    if (title !== undefined && (!title || title.trim().length < 1)) {
      throw new ValidationError('Meeting title cannot be empty');
    }

    if (scheduledTime !== undefined && scheduledTime < new Date(Date.now() - 5 * 60 * 1000)) {
      throw new ValidationError('Scheduled time must be in the future');
    }

    // Cannot update meetings that are recording or completed
    if (existingMeeting.status === 'RECORDING') {
      throw new ConflictError('Cannot update meeting that is currently recording');
    }

    // Update meeting
    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(scheduledTime !== undefined && { scheduledTime }),
        ...(participants !== undefined && {
          participants: JSON.stringify(participants.filter(p => p.trim().length > 0))
        }),
        ...(status !== undefined && { status }),
        ...(recordingUrl !== undefined && { recordingUrl }),
        ...(storageSize !== undefined && { storageSize }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Update cache
    await meetingCache.set(meetingId, updatedMeeting);

    logger.info('Meeting updated successfully', {
      meetingId,
      userId,
      changes: Object.keys(data),
    });

    return {
      ...updatedMeeting,
      participants: updatedMeeting.participants ? JSON.parse(updatedMeeting.participants as string) : [],
      storageSize: Number(updatedMeeting.storageSize),
    };
  }

  /**
   * Delete a meeting
   */
  async deleteMeeting(meetingId: string, userId: string, isAdmin: boolean = false) {
    // Get existing meeting
    const meeting = await this.getMeetingById(meetingId, userId, isAdmin);

    // Cannot delete meetings that are recording
    if (meeting.status === 'RECORDING') {
      throw new ConflictError('Cannot delete meeting that is currently recording');
    }

    // Delete meeting (cascades to transcripts and summaries)
    await prisma.meeting.delete({
      where: { id: meetingId },
    });

    // Remove from cache
    await meetingCache.invalidate(meetingId);

    logger.info('Meeting deleted successfully', {
      meetingId,
      userId,
      title: meeting.title,
    });

    return { success: true };
  }

  /**
   * Start a meeting (change status to RECORDING)
   */
  async startMeeting(meetingId: string, userId: string) {
    const meeting = await this.getMeetingById(meetingId, userId);

    // Allow starting from SCHEDULED or if already RECORDING (idempotent)
    if (meeting.status === 'RECORDING') {
      // Already recording, return current state
      return meeting;
    }

    if (meeting.status !== 'SCHEDULED') {
      throw new ConflictError(`Cannot start meeting with status: ${meeting.status}`);
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'RECORDING',
        startTime: new Date(),
      },
    });

    // Update cache
    await meetingCache.set(meetingId, updatedMeeting);

    logger.info('Meeting started', {
      meetingId,
      userId,
      startTime: updatedMeeting.startTime,
    });

    return {
      ...updatedMeeting,
      participants: updatedMeeting.participants ? JSON.parse(updatedMeeting.participants as string) : [],
      storageSize: Number(updatedMeeting.storageSize),
    };
  }

  /**
   * End a meeting (change status to COMPLETED)
   */
  async endMeeting(meetingId: string, userId: string) {
    const meeting = await this.getMeetingById(meetingId, userId);

    if (meeting.status !== 'RECORDING') {
      throw new ConflictError('Meeting is not currently recording');
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'COMPLETED',
        endTime: new Date(),
      },
      include: {
        transcripts: {
          orderBy: { timestamp: 'asc' },
        },
        summaries: {
          orderBy: { generatedAt: 'desc' },
          take: 1,
        },
      },
    });

    // Update cache
    await meetingCache.set(meetingId, updatedMeeting);

    logger.info('Meeting ended', {
      meetingId,
      userId,
      endTime: updatedMeeting.endTime,
      duration: (updatedMeeting.endTime?.getTime() || Date.now()) - (updatedMeeting.startTime?.getTime() || 0),
    });

    // Parse mind map JSON string if it exists
    let mindMap = undefined;
    if ((updatedMeeting as any).mindMap) {
      try { mindMap = JSON.parse((updatedMeeting as any).mindMap); } catch (e) {}
    }

    return {
      ...updatedMeeting,
      participants: updatedMeeting.participants ? JSON.parse(updatedMeeting.participants as string) : [],
      storageSize: Number(updatedMeeting.storageSize),
      mindMap,
    };
  }

  /**
   * Search meetings across all fields
   */
  async searchMeetings(userId: string, query: string, options: PaginationOptions = {}) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const searchTerms = query.trim().split(/\s+/).filter(term => term.length > 0);

    if (searchTerms.length === 0) {
      return this.getMeetings(userId, {}, options);
    }

    // Build search conditions
    const searchConditions = searchTerms.map(term => ({
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        {
          transcripts: {
            some: {
              text: { contains: term, mode: 'insensitive' },
            },
          },
        },
        {
          summaries: {
            some: {
              OR: [
                { overallSummary: { contains: term, mode: 'insensitive' } },
                { keyPoints: { contains: term, mode: 'insensitive' } },
                { actionItems: { contains: term, mode: 'insensitive' } },
              ],
            },
          },
        },
      ],
    }));

    const where = {
      userId,
      AND: searchConditions,
    };

    const [meetings, total] = await Promise.all([
      prisma.meeting.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledTime: 'desc' },
        include: {
          _count: {
            select: {
              transcripts: true,
              summaries: true,
            },
          },
        },
      }),
      prisma.meeting.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info('Meeting search completed', {
      userId,
      query,
      results: meetings.length,
      total,
    });

    return {
      meetings,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      query,
    };
  }

  /**
   * Get meeting statistics for a user
   */
  async getMeetingStats(userId: string) {
    const [
      totalMeetings,
      completedMeetings,
      scheduledMeetings,
      recordingMeetings,
      thisMonthMeetings,
      totalTranscripts,
      totalStorageUsed,
    ] = await Promise.all([
      prisma.meeting.count({ where: { userId } }),
      prisma.meeting.count({ where: { userId, status: 'COMPLETED' } }),
      prisma.meeting.count({ where: { userId, status: 'SCHEDULED' } }),
      prisma.meeting.count({ where: { userId, status: 'RECORDING' } }),
      prisma.meeting.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      prisma.transcriptEntry.count({
        where: { meeting: { userId } },
      }),
      prisma.meeting.aggregate({
        where: { userId },
        _sum: { storageSize: true },
      }),
    ]);

    return {
      totalMeetings,
      completedMeetings,
      scheduledMeetings,
      recordingMeetings,
      thisMonthMeetings,
      totalTranscripts,
      totalStorageUsed: totalStorageUsed._sum.storageSize || 0,
    };
  }

  /**
   * Validate meeting URL for platform
   */
  private isValidMeetingUrl(url: string, platform: Platform): boolean {
    try {
      const urlObj = new URL(url);

      switch (platform) {
        case 'GOOGLE_MEET':
          return urlObj.hostname === 'meet.google.com';
        case 'ZOOM':
          return urlObj.hostname.includes('zoom.us');
        case 'MICROSOFT_TEAMS':
          return urlObj.hostname.includes('teams.microsoft.com');
        case 'WEBEX':
          return urlObj.hostname.includes('webex.com');
        case 'DISCORD':
          return urlObj.hostname === 'discord.gg' || urlObj.hostname === 'discord.com';
        case 'SKYPE':
          return urlObj.hostname === 'join.skype.com';
        default:
          return true; // Allow any URL for unknown platforms
      }
    } catch {
      return false;
    }
  }

  /**
   * Export meeting data in various formats
   */
  async exportMeeting(meetingId: string, userId: string, format: 'json' | 'csv' | 'pdf') {
    // Get meeting with full data
    const meeting = await this.getMeetingById(meetingId, userId);

    switch (format) {
      case 'json':
        return {
          content: JSON.stringify(meeting, null, 2),
          contentType: 'application/json',
          filename: `meeting-${meeting.id}-${new Date().toISOString().split('T')[0]}.json`,
        };

      case 'csv':
        return {
          content: this.generateCSVExport(meeting),
          contentType: 'text/csv',
          filename: `meeting-${meeting.id}-${new Date().toISOString().split('T')[0]}.csv`,
        };

      case 'pdf':
        return {
          content: this.generatePDFExport(meeting),
          contentType: 'application/pdf',
          filename: `meeting-${meeting.id}-${new Date().toISOString().split('T')[0]}.pdf`,
        };

      default:
        throw new ValidationError('Invalid export format');
    }
  }

  /**
   * Generate CSV export content
   */
  private generateCSVExport(meeting: any): string {
    let csvContent = '';

    // Meeting metadata section
    csvContent += 'Meeting Information\n';
    csvContent += `Title,"${meeting.title.replace(/"/g, '""')}"\n`;
    csvContent += `Description,"${(meeting.description || '').replace(/"/g, '""')}"\n`;
    csvContent += `Platform,"${meeting.platform}"\n`;
    csvContent += `Scheduled Time,"${meeting.scheduledTime}"\n`;
    csvContent += `Start Time,"${meeting.startTime || 'N/A'}"\n`;
    csvContent += `End Time,"${meeting.endTime || 'N/A'}"\n`;
    csvContent += `Status,"${meeting.status}"\n`;
    csvContent += `Participants,"${Array.isArray(meeting.participants) ? meeting.participants.join('; ') : ''}"\n`;
    csvContent += '\n';

    // Summary section if available
    if (meeting.summaries && meeting.summaries.length > 0) {
      const summary = meeting.summaries[0];
      csvContent += 'Meeting Summary\n';
      csvContent += `Overall Summary,"${(summary.overallSummary || '').replace(/"/g, '""')}"\n`;

      if (Array.isArray(summary.keyPoints) && summary.keyPoints.length > 0) {
        csvContent += 'Key Points\n';
        summary.keyPoints.forEach((point: string, index: number) => {
          csvContent += `${index + 1},"${point.replace(/"/g, '""')}"\n`;
        });
      }

      if (Array.isArray(summary.actionItems) && summary.actionItems.length > 0) {
        csvContent += 'Action Items\n';
        summary.actionItems.forEach((item: string, index: number) => {
          csvContent += `${index + 1},"${item.replace(/"/g, '""')}"\n`;
        });
      }
      csvContent += '\n';
    }

    // Transcripts section
    if (meeting.transcripts && meeting.transcripts.length > 0) {
      csvContent += 'Transcripts\n';
      csvContent += 'Timestamp,Speaker,Text,Confidence,Final\n';
      meeting.transcripts.forEach((t: any) => {
        csvContent += `"${t.timestamp}","${t.speaker}","${t.text.replace(/"/g, '""')}","${t.confidence}","${t.isFinal}"\n`;
      });
    }

    return csvContent;
  }

  /**
   * Generate PDF export content (simplified text-based format)
   * In production, this should use a proper PDF library like puppeteer or jsPDF
   */
  private generatePDFExport(meeting: any): string {
    // For now, return a simple text format that can be converted to PDF
    // In production, implement proper PDF generation
    let content = `MEETING REPORT\n\n`;
    content += `Title: ${meeting.title}\n`;
    content += `Description: ${meeting.description || 'N/A'}\n`;
    content += `Platform: ${meeting.platform}\n`;
    content += `Scheduled: ${meeting.scheduledTime}\n`;
    content += `Status: ${meeting.status}\n\n`;

    if (meeting.participants && Array.isArray(meeting.participants)) {
      content += `Participants: ${meeting.participants.join(', ')}\n\n`;
    }

    if (meeting.summaries && meeting.summaries.length > 0) {
      const summary = meeting.summaries[0];
      content += `SUMMARY\n`;
      content += `${summary.overallSummary || 'N/A'}\n\n`;

      if (Array.isArray(summary.keyPoints) && summary.keyPoints.length > 0) {
        content += 'KEY POINTS:\n';
        summary.keyPoints.forEach((point: string, index: number) => {
          content += `${index + 1}. ${point}\n`;
        });
        content += '\n';
      }

      if (Array.isArray(summary.actionItems) && summary.actionItems.length > 0) {
        content += 'ACTION ITEMS:\n';
        summary.actionItems.forEach((item: string, index: number) => {
          content += `${index + 1}. ${item}\n`;
        });
        content += '\n';
      }
    }

    if (meeting.transcripts && meeting.transcripts.length > 0) {
      content += 'TRANSCRIPT:\n';
      meeting.transcripts.forEach((t: any) => {
        content += `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.speaker}: ${t.text}\n`;
      });
    }

    return content;
  }

  /**
   * Get subscription limits
   */
  private getSubscriptionLimits(subscription: string) {
    switch (subscription) {
      case 'FREE':
        return {
          monthlyMeetings: 10,
          storageLimit: 1024 * 1024 * 1024, // 1GB
          transcriptRetention: 30, // days
        };
      case 'PRO':
        return {
          monthlyMeetings: 100,
          storageLimit: 10 * 1024 * 1024 * 1024, // 10GB
          transcriptRetention: 365, // days
        };
      case 'ENTERPRISE':
        return {
          monthlyMeetings: -1, // unlimited
          storageLimit: -1, // unlimited
          transcriptRetention: -1, // unlimited
        };
      default:
        return {
          monthlyMeetings: 10,
          storageLimit: 1024 * 1024 * 1024,
          transcriptRetention: 30,
        };
    }
  }
}