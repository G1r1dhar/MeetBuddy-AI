import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import {
  ValidationError,
  NotFoundError
} from '../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';

interface CreateTranscriptData {
  meetingId: string;
  speaker: string;
  text: string;
  timestamp: Date;
  confidence: number;
  isFinal?: boolean;
}

interface UpdateTranscriptData {
  speaker?: string;
  text?: string;
  confidence?: number;
  isFinal?: boolean;
}

interface TranscriptFilters {
  speaker?: string;
  search?: string;
  startTime?: Date;
  endTime?: Date;
  minConfidence?: number;
  isFinal?: boolean;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: 'timestamp' | 'speaker' | 'confidence';
  sortOrder?: 'asc' | 'desc';
}

export class TranscriptService {
  /**
   * Create a new transcript entry
   */
  async createTranscriptEntry(userId: string, data: CreateTranscriptData) {
    const { meetingId, speaker, text, timestamp, confidence, isFinal = false } = data;

    // Validate input
    if (!speaker || speaker.trim().length === 0) {
      throw new ValidationError('Speaker name is required');
    }

    if (!text || text.trim().length === 0) {
      throw new ValidationError('Transcript text is required');
    }

    if (confidence < 0 || confidence > 1) {
      throw new ValidationError('Confidence must be between 0 and 1');
    }

    // Verify meeting exists and user has access
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, userId: true, status: true },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting not found');
    }

    if (meeting.userId !== userId) {
      throw new NotFoundError('Meeting not found');
    }

    // Create transcript entry
    const transcript = await prisma.transcriptEntry.create({
      data: {
        meetingId,
        speaker: speaker.trim(),
        text: text.trim(),
        timestamp,
        confidence,
        isFinal,
      },
    });

    logger.info('Transcript entry created', {
      transcriptId: transcript.id,
      meetingId,
      userId,
      speaker: transcript.speaker,
      textLength: transcript.text.length,
      confidence: transcript.confidence,
      isFinal: transcript.isFinal,
    });

    return transcript;
  }

  /**
   * Get transcripts for a meeting with filtering and pagination
   */
  async getTranscriptsForMeeting(
    meetingId: string,
    userId: string,
    filters: TranscriptFilters = {},
    pagination: PaginationOptions = {}
  ) {
    // Verify meeting exists and user has access
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, userId: true },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting not found');
    }

    if (meeting.userId !== userId) {
      throw new NotFoundError('Meeting not found');
    }

    const {
      speaker,
      search,
      startTime,
      endTime,
      minConfidence,
      isFinal,
    } = filters;

    const {
      page = 1,
      limit = 100,
      sortBy = 'timestamp',
      sortOrder = 'asc',
    } = pagination;

    // Build where clause
    const where: any = { meetingId };

    if (speaker) {
      where.speaker = { contains: speaker, mode: 'insensitive' };
    }

    if (search) {
      where.text = { contains: search, mode: 'insensitive' };
    }

    if (startTime || endTime) {
      where.timestamp = {};
      if (startTime) {
        where.timestamp.gte = startTime;
      }
      if (endTime) {
        where.timestamp.lte = endTime;
      }
    }

    if (minConfidence !== undefined) {
      where.confidence = { gte: minConfidence };
    }

    if (isFinal !== undefined) {
      where.isFinal = isFinal;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get transcripts with count
    const [transcripts, total] = await Promise.all([
      prisma.transcriptEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.transcriptEntry.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info('Transcripts retrieved', {
      meetingId,
      userId,
      count: transcripts.length,
      total,
      page,
      filters,
    });

    return {
      transcripts,
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
   * Update a transcript entry
   */
  async updateTranscriptEntry(
    transcriptId: string,
    userId: string,
    data: UpdateTranscriptData
  ) {
    const { speaker, text, confidence, isFinal } = data;

    // Get existing transcript and verify access
    const existingTranscript = await prisma.transcriptEntry.findUnique({
      where: { id: transcriptId },
      include: {
        meeting: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!existingTranscript) {
      throw new NotFoundError('Transcript entry not found');
    }

    if (existingTranscript.meeting.userId !== userId) {
      throw new NotFoundError('Transcript not found');
    }

    // Validate updates
    if (speaker !== undefined && (!speaker || speaker.trim().length === 0)) {
      throw new ValidationError('Speaker name cannot be empty');
    }

    if (text !== undefined && (!text || text.trim().length === 0)) {
      throw new ValidationError('Transcript text cannot be empty');
    }

    if (confidence !== undefined && (confidence < 0 || confidence > 1)) {
      throw new ValidationError('Confidence must be between 0 and 1');
    }

    // Update transcript
    const updatedTranscript = await prisma.transcriptEntry.update({
      where: { id: transcriptId },
      data: {
        ...(speaker !== undefined && { speaker: speaker.trim() }),
        ...(text !== undefined && { text: text.trim() }),
        ...(confidence !== undefined && { confidence }),
        ...(isFinal !== undefined && { isFinal }),
      },
    });

    logger.info('Transcript entry updated', {
      transcriptId,
      meetingId: existingTranscript.meetingId,
      userId,
      changes: Object.keys(data),
    });

    return updatedTranscript;
  }

  /**
   * Delete a transcript entry
   */
  async deleteTranscriptEntry(transcriptId: string, userId: string) {
    // Get existing transcript and verify access
    const existingTranscript = await prisma.transcriptEntry.findUnique({
      where: { id: transcriptId },
      include: {
        meeting: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!existingTranscript) {
      throw new NotFoundError('Transcript entry not found');
    }

    if (existingTranscript.meeting.userId !== userId) {
      throw new NotFoundError('Transcript not found');
    }

    // Delete transcript
    await prisma.transcriptEntry.delete({
      where: { id: transcriptId },
    });

    logger.info('Transcript entry deleted', {
      transcriptId,
      meetingId: existingTranscript.meetingId,
      userId,
    });

    return { success: true };
  }

  /**
   * Search transcripts across all user meetings
   */
  async searchTranscripts(
    userId: string,
    query: string,
    options: PaginationOptions = {}
  ) {
    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const searchTerms = query.trim().split(/\s+/).filter(term => term.length > 0);

    if (searchTerms.length === 0) {
      return {
        transcripts: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
        query,
      };
    }

    // Build search conditions
    const searchConditions = searchTerms.map(term => ({
      OR: [
        { text: { contains: term, mode: 'insensitive' } },
        { speaker: { contains: term, mode: 'insensitive' } },
      ],
    }));

    const where = {
      meeting: { userId },
      AND: searchConditions,
    };

    const [transcripts, total] = await Promise.all([
      prisma.transcriptEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          meeting: {
            select: {
              id: true,
              title: true,
              scheduledTime: true,
              platform: true,
            },
          },
        },
      }),
      prisma.transcriptEntry.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info('Transcript search completed', {
      userId,
      query,
      results: transcripts.length,
      total,
    });

    return {
      transcripts,
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
   * Get transcript statistics for a meeting
   */
  async getTranscriptStats(meetingId: string, userId: string) {
    // Verify meeting access
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, userId: true },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting not found');
    }

    if (meeting.userId !== userId) {
      throw new NotFoundError('Meeting not found');
    }

    const [
      totalEntries,
      finalEntries,
      uniqueSpeakers,
      avgConfidence,
      totalWords,
      speakerStats,
    ] = await Promise.all([
      prisma.transcriptEntry.count({
        where: { meetingId },
      }),
      prisma.transcriptEntry.count({
        where: { meetingId, isFinal: true },
      }),
      prisma.transcriptEntry.findMany({
        where: { meetingId },
        select: { speaker: true },
        distinct: ['speaker'],
      }),
      prisma.transcriptEntry.aggregate({
        where: { meetingId },
        _avg: { confidence: true },
      }),
      prisma.transcriptEntry.findMany({
        where: { meetingId },
        select: { text: true },
      }).then(entries =>
        entries.reduce((total, entry) => total + entry.text.split(/\s+/).length, 0)
      ),
      prisma.transcriptEntry.groupBy({
        by: ['speaker'],
        where: { meetingId },
        _count: { _all: true },
        _avg: { confidence: true },
      }),
    ]);

    return {
      totalEntries,
      finalEntries,
      uniqueSpeakers: uniqueSpeakers.length,
      avgConfidence: avgConfidence._avg.confidence || 0,
      totalWords,
      speakerStats: speakerStats.map(stat => ({
        speaker: stat.speaker,
        entryCount: stat._count._all,
        avgConfidence: stat._avg.confidence || 0,
      })),
    };
  }

  /**
   * Get transcript timeline for a meeting
   */
  async getTranscriptTimeline(meetingId: string, userId: string) {
    // Verify meeting access
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, userId: true, startTime: true },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting not found');
    }

    if (meeting.userId !== userId) {
      throw new NotFoundError('Meeting not found');
    }

    // Get all final transcripts ordered by timestamp
    const transcripts = await prisma.transcriptEntry.findMany({
      where: {
        meetingId,
        isFinal: true,
      },
      orderBy: { timestamp: 'asc' },
      select: {
        id: true,
        speaker: true,
        text: true,
        timestamp: true,
        confidence: true,
      },
    });

    // Group by time intervals (e.g., 1-minute intervals)
    const timeline: any[] = [];
    const intervalMs = 60 * 1000; // 1 minute
    const startTime = meeting.startTime || (transcripts[0]?.timestamp || new Date());

    let currentInterval = new Date(Math.floor(startTime.getTime() / intervalMs) * intervalMs);
    let currentGroup: any[] = [];

    for (const transcript of transcripts) {
      const transcriptInterval = new Date(Math.floor(transcript.timestamp.getTime() / intervalMs) * intervalMs);

      if (transcriptInterval.getTime() !== currentInterval.getTime()) {
        if (currentGroup.length > 0) {
          timeline.push({
            timestamp: currentInterval,
            entries: currentGroup,
            speakerCount: new Set(currentGroup.map(t => t.speaker)).size,
            wordCount: currentGroup.reduce((sum, t) => sum + t.text.split(/\s+/).length, 0),
          });
        }

        currentInterval = transcriptInterval;
        currentGroup = [];
      }

      currentGroup.push(transcript);
    }

    // Add the last group
    if (currentGroup.length > 0) {
      timeline.push({
        timestamp: currentInterval,
        entries: currentGroup,
        speakerCount: new Set(currentGroup.map(t => t.speaker)).size,
        wordCount: currentGroup.reduce((sum, t) => sum + t.text.split(/\s+/).length, 0),
      });
    }

    return timeline;
  }

  /**
   * Export transcripts in various formats
   */
  async exportTranscripts(meetingId: string, userId: string, format: 'json' | 'txt' | 'srt' | 'vtt') {
    // Get all final transcripts
    const result = await this.getTranscriptsForMeeting(
      meetingId,
      userId,
      { isFinal: true },
      { limit: 10000, sortBy: 'timestamp', sortOrder: 'asc' }
    );

    const transcripts = result.transcripts;

    switch (format) {
      case 'json':
        return JSON.stringify(transcripts, null, 2);

      case 'txt':
        return transcripts
          .map(t => `[${t.timestamp.toISOString()}] ${t.speaker}: ${t.text}`)
          .join('\n');

      case 'srt':
        return transcripts
          .map((t, index) => {
            const start = t.timestamp;
            const end = new Date(start.getTime() + 5000); // Assume 5-second duration
            return [
              index + 1,
              `${this.formatSRTTime(start)} --> ${this.formatSRTTime(end)}`,
              `${t.speaker}: ${t.text}`,
              '',
            ].join('\n');
          })
          .join('\n');

      case 'vtt':
        const vttHeader = 'WEBVTT\n\n';
        const vttContent = transcripts
          .map(t => {
            const start = t.timestamp;
            const end = new Date(start.getTime() + 5000); // Assume 5-second duration
            return [
              `${this.formatVTTTime(start)} --> ${this.formatVTTTime(end)}`,
              `<v ${t.speaker}>${t.text}`,
              '',
            ].join('\n');
          })
          .join('\n');
        return vttHeader + vttContent;

      default:
        throw new ValidationError('Invalid export format');
    }
  }

  /**
   * Format time for SRT format
   */
  private formatSRTTime(date: Date): string {
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const milliseconds = date.getUTCMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds},${milliseconds}`;
  }

  /**
   * Format time for VTT format
   */
  private formatVTTTime(date: Date): string {
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const milliseconds = date.getUTCMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  }
}