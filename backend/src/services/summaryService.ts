import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { localAiService } from './localAiService';
import { TranscriptService } from './transcriptService';
import { googleIntegrationService } from './googleIntegrationService';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  InternalServerError
} from '../middleware/errorHandler';

interface CreateSummaryData {
  meetingId: string;
  overallSummary?: string;
  keyPoints?: string[];
  actionItems?: string[];
  nextSteps?: string[];
  topics?: string[];
}

interface UpdateSummaryData {
  overallSummary?: string;
  keyPoints?: string[];
  actionItems?: string[];
  nextSteps?: string[];
  topics?: string[];
}

export class SummaryService {
  private transcriptService: TranscriptService;

  constructor() {
    this.transcriptService = new TranscriptService();
  }

  /**
   * Generate AI summary for a meeting
   */
  async generateSummaryForMeeting(meetingId: string, userId: string): Promise<any> {
    // Verify meeting exists and user has access
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        userId: true,
        title: true,
        startTime: true,
        endTime: true,
        participants: true,
      },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting not found');
    }

    if (meeting.userId !== userId) {
      throw new AuthorizationError('Access denied to this meeting');
    }

    // Get transcripts for the meeting
    const transcriptResult = await this.transcriptService.getTranscriptsForMeeting(
      meetingId,
      userId,
      {}, // Use all transcripts (whisper saves with isFinal: false by default)
      { limit: 10000, sortBy: 'timestamp', sortOrder: 'asc' }
    );

    if (transcriptResult.transcripts.length === 0) {
      throw new ValidationError('No transcripts available for this meeting');
    }

    // Combine transcripts into a single text
    const transcript = transcriptResult.transcripts
      .map(t => `${t.speaker}: ${t.text}`)
      .join('\n');

    // Calculate meeting duration
    let duration: number | undefined;
    if (meeting.startTime && meeting.endTime) {
      duration = meeting.endTime.getTime() - meeting.startTime.getTime();
    }

    // Extract participants
    const participants = Array.isArray(meeting.participants)
      ? meeting.participants as string[]
      : [];

    try {
      // Generate AI summary
      const aiSummary = await localAiService.generateMeetingSummary({
        transcript,
        meetingTitle: meeting.title,
        ...(duration !== undefined && { meetingDuration: duration }),
        participants,
      });

      // Check if summary already exists
      const existingSummary = await prisma.summary.findFirst({
        where: { meetingId },
      });

      let summary;
      if (existingSummary) {
        // Update existing summary
        summary = await prisma.summary.update({
          where: { id: existingSummary.id },
          data: {
            overallSummary: aiSummary.overallSummary,
            keyPoints: JSON.stringify(aiSummary.keyPoints || []),
            actionItems: JSON.stringify(aiSummary.actionItems || []),
            nextSteps: JSON.stringify(aiSummary.nextSteps || []),
            topics: JSON.stringify(aiSummary.topics || []),
            generatedAt: new Date(),
          },
        });
      } else {
        // Create new summary
        summary = await prisma.summary.create({
          data: {
            meetingId,
            overallSummary: aiSummary.overallSummary,
            keyPoints: JSON.stringify(aiSummary.keyPoints || []),
            actionItems: JSON.stringify(aiSummary.actionItems || []),
            nextSteps: JSON.stringify(aiSummary.nextSteps || []),
            topics: JSON.stringify(aiSummary.topics || []),
          },
        });
      }

      logger.info('AI summary generated successfully', {
        meetingId,
        userId,
        summaryId: summary.id,
        transcriptLength: transcript.length,
        keyPointsCount: aiSummary.keyPoints.length,
        actionItemsCount: aiSummary.actionItems.length,
      });

      // Automatically dispatch to Google Ecosystem if connected
      this.dispatchGoogleEcosystemIntegrations(userId, meeting.title, aiSummary).catch(err => {
        logger.error('Failed to dispatch Google Integrations post-summary', { meetingId, userId, error: err });
      });

      return this.parseSummaryData(summary);
    } catch (error) {
      logger.error('Failed to generate AI summary', {
        meetingId,
        userId,
        error: error instanceof Error ? error.message : String(error),
        transcriptLength: transcript.length,
      });

      if (error instanceof ValidationError || error instanceof InternalServerError) {
        throw error;
      }

      throw new InternalServerError('Failed to generate meeting summary');
    }
  }

  /**
   * Dispatches Action Items to Google Tasks and Summary to Gmail
   */
  private async dispatchGoogleEcosystemIntegrations(userId: string, meetingTitle: string, aiSummary: any) {
    try {
      // 1. Create Google Tasks for Action Items (Reminders)
      if (aiSummary.actionItems && aiSummary.actionItems.length > 0) {
        const tasks = aiSummary.actionItems.map((item: string) => ({ title: item }));
        await googleIntegrationService.createActionItemTasks(userId, meetingTitle, tasks);
      }

      // 2. Send Summary Email via Gmail
      if (aiSummary.overallSummary || aiSummary.keyPoints?.length > 0) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (user && user.email) {
          const htmlContent = `
            <h2>Meeting Summary: ${meetingTitle}</h2>
            <p>${aiSummary.overallSummary || ''}</p>
            ${aiSummary.keyPoints?.length > 0 ? '<h3>Key Points:</h3><ul>' + aiSummary.keyPoints.map((k: string) => '<li>' + k + '</li>').join('') + '</ul>' : ''}
            ${aiSummary.actionItems?.length > 0 ? '<h3>Action Items:</h3><ul>' + aiSummary.actionItems.map((a: string) => '<li>' + a + '</li>').join('') + '</ul>' : ''}
          `;
          await googleIntegrationService.sendSummaryEmail(userId, user.email, `Summary: ${meetingTitle}`, htmlContent);
        }
      }
    } catch (e) {
      // Non-blocking, fails gracefully if user hasn't connected Google or scopes are missing
      logger.warn('Google Ecosystem dispatch failed (likely no integration)', { error: e });
    }
  }

  /**
   * Create a manual summary
   */
  async createSummary(userId: string, data: CreateSummaryData): Promise<any> {
    const { meetingId, overallSummary, keyPoints, actionItems, nextSteps, topics } = data;

    // Verify meeting exists and user has access
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, userId: true },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting not found');
    }

    if (meeting.userId !== userId) {
      throw new AuthorizationError('Access denied to this meeting');
    }

    // Check if summary already exists
    const existingSummary = await prisma.summary.findFirst({
      where: { meetingId },
    });

    if (existingSummary) {
      throw new ValidationError('Summary already exists for this meeting');
    }

    // Create summary
    const summary = await prisma.summary.create({
      data: {
        meetingId,
        overallSummary: overallSummary || '',
        keyPoints: JSON.stringify(keyPoints || []),
        actionItems: JSON.stringify(actionItems || []),
        nextSteps: JSON.stringify(nextSteps || []),
        topics: JSON.stringify(topics || []),
      },
    });

    logger.info('Manual summary created', {
      meetingId,
      userId,
      summaryId: summary.id,
    });

    return this.parseSummaryData(summary);
  }

  /**
   * Get summary for a meeting
   */
  async getSummaryForMeeting(meetingId: string, userId: string): Promise<any> {
    // Verify meeting access
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, userId: true },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting not found');
    }

    if (meeting.userId !== userId) {
      throw new AuthorizationError('Access denied to this meeting');
    }

    // Get summary
    const summary = await prisma.summary.findFirst({
      where: { meetingId },
      orderBy: { generatedAt: 'desc' },
    });

    if (!summary) {
      throw new NotFoundError('No summary found for this meeting');
    }

    return this.parseSummaryData(summary);
  }

  /**
   * Update an existing summary
   */
  async updateSummary(summaryId: string, userId: string, data: UpdateSummaryData): Promise<any> {
    // Get existing summary and verify access
    const existingSummary = await prisma.summary.findUnique({
      where: { id: summaryId },
      include: {
        meeting: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!existingSummary) {
      throw new NotFoundError('Summary not found');
    }

    if (existingSummary.meeting.userId !== userId) {
      throw new AuthorizationError('Access denied to this summary');
    }

    // Update summary
    const updatedSummary = await prisma.summary.update({
      where: { id: summaryId },
      data: {
        ...(data.overallSummary !== undefined && { overallSummary: data.overallSummary }),
        ...(data.keyPoints !== undefined && { keyPoints: JSON.stringify(data.keyPoints) }),
        ...(data.actionItems !== undefined && { actionItems: JSON.stringify(data.actionItems) }),
        ...(data.nextSteps !== undefined && { nextSteps: JSON.stringify(data.nextSteps) }),
        ...(data.topics !== undefined && { topics: JSON.stringify(data.topics) }),
      },
    });

    logger.info('Summary updated', {
      summaryId,
      userId,
      meetingId: existingSummary.meetingId,
      changes: Object.keys(data),
    });

    return this.parseSummaryData(updatedSummary);
  }

  /**
   * Delete a summary
   */
  async deleteSummary(summaryId: string, userId: string): Promise<{ success: boolean }> {
    // Get existing summary and verify access
    const existingSummary = await prisma.summary.findUnique({
      where: { id: summaryId },
      include: {
        meeting: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!existingSummary) {
      throw new NotFoundError('Summary not found');
    }

    if (existingSummary.meeting.userId !== userId) {
      throw new AuthorizationError('Access denied to this summary');
    }

    // Delete summary
    await prisma.summary.delete({
      where: { id: summaryId },
    });

    logger.info('Summary deleted', {
      summaryId,
      userId,
      meetingId: existingSummary.meetingId,
    });

    return { success: true };
  }

  /**
   * Regenerate summary using AI
   */
  async regenerateSummary(summaryId: string, userId: string): Promise<any> {
    // Get existing summary and verify access
    const existingSummary = await prisma.summary.findUnique({
      where: { id: summaryId },
      include: {
        meeting: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!existingSummary) {
      throw new NotFoundError('Summary not found');
    }

    if (existingSummary.meeting.userId !== userId) {
      throw new AuthorizationError('Access denied to this summary');
    }

    // Generate new summary
    const newSummary = await this.generateSummaryForMeeting(
      existingSummary.meetingId,
      userId
    );

    logger.info('Summary regenerated', {
      summaryId,
      userId,
      meetingId: existingSummary.meetingId,
    });

    return newSummary;
  }

  /**
   * Get summaries for a user (across all meetings)
   */
  async getUserSummaries(userId: string, options: { page?: number; limit?: number } = {}): Promise<any> {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const [summaries, total] = await Promise.all([
      prisma.summary.findMany({
        where: {
          meeting: { userId },
        },
        skip,
        take: limit,
        orderBy: { generatedAt: 'desc' },
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
      prisma.summary.count({
        where: {
          meeting: { userId },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      summaries: summaries.map(s => this.parseSummaryData(s)),
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
   * Helper to parse JSON string fields back to arrays
   */
  private parseSummaryData(summary: any) {
    if (!summary) return summary;

    return {
      ...summary,
      keyPoints: typeof summary.keyPoints === 'string' ? JSON.parse(summary.keyPoints || '[]') : [],
      actionItems: typeof summary.actionItems === 'string' ? JSON.parse(summary.actionItems || '[]') : [],
      nextSteps: typeof summary.nextSteps === 'string' ? JSON.parse(summary.nextSteps || '[]') : [],
      topics: typeof summary.topics === 'string' ? JSON.parse(summary.topics || '[]') : [],
    };
  }

  /**
   * Check AI service health
   */
  async checkAIServiceHealth(): Promise<boolean> {
    try {
      const healthStatus = await localAiService.healthCheck();
      return healthStatus.primary || healthStatus.fallback;
    } catch (error) {
      logger.error('AI service health check failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get AI service configuration
   */
  getAIServiceConfig() {
    return localAiService.getConfig();
  }
}