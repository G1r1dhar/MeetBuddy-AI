import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';
import { MeetingService } from './meetingService';
import { TranscriptService } from './transcriptService';
import { SummaryService } from './summaryService';
import { prisma } from '../lib/prisma';

interface TranscriptUpdate {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
  confidence: number;
  isFinal: boolean;
}

interface MeetingStatusUpdate {
  status: 'SCHEDULED' | 'RECORDING' | 'COMPLETED' | 'CANCELLED';
  metadata?: any;
}

interface ParticipantInfo {
  userId: string;
  email: string;
  name: string;
  joinedAt: Date;
}

export class RealtimeService {
  private io: SocketIOServer;
  private meetingService: MeetingService;
  private transcriptService: TranscriptService;
  private summaryService: SummaryService;

  // Track active meeting participants
  private meetingParticipants: Map<string, Set<string>> = new Map();

  constructor(io: SocketIOServer) {
    this.io = io;
    this.meetingService = new MeetingService();
    this.transcriptService = new TranscriptService();
    this.summaryService = new SummaryService();
  }

  /**
   * Add participant to meeting room
   */
  async addParticipantToMeeting(meetingId: string, userId: string, socketId: string): Promise<void> {
    try {
      // Verify meeting exists and user has access
      const meeting = await this.meetingService.getMeetingById(meetingId, userId);

      if (!meeting) {
        throw new Error('Meeting not found or access denied');
      }

      // Add to participants tracking
      if (!this.meetingParticipants.has(meetingId)) {
        this.meetingParticipants.set(meetingId, new Set());
      }

      const wasEmpty = this.meetingParticipants.get(meetingId)!.size === 0;
      this.meetingParticipants.get(meetingId)!.add(userId);

      // Get user info
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, avatarUrl: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const participantInfo: ParticipantInfo = {
        userId: user.id,
        email: user.email,
        name: user.name,
        joinedAt: new Date(),
      };

      // Notify other participants about the new joiner
      this.io.to(`meeting:${meetingId}`).emit('participant-joined', {
        participant: {
          ...participantInfo,
          avatarUrl: user.avatarUrl,
          isOwner: meeting.userId === userId,
        },
        socketId,
        meetingId,
        timestamp: new Date().toISOString(),
      });

      // Get current meeting state including participants and capture status
      const currentParticipants = await this.getMeetingParticipants(meetingId);

      // Send comprehensive meeting state to new participant
      this.io.to(socketId).emit('meeting-state', {
        meetingId,
        meeting: {
          id: meeting.id,
          title: meeting.title,
          description: meeting.description,
          status: meeting.status,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          platform: meeting.platform,
          isOwner: meeting.userId === userId,
        },
        participants: currentParticipants.map(p => ({
          ...p,
          isOwner: meeting.userId === p.userId,
        })),
        participantCount: currentParticipants.length,
        isFirstParticipant: wasEmpty,
        timestamp: new Date().toISOString(),
      });

      // If this is the first participant, notify about meeting activation
      if (wasEmpty) {
        this.io.to(`meeting:${meetingId}`).emit('meeting-activated', {
          meetingId,
          activatedBy: userId,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info('Participant added to meeting', {
        meetingId,
        userId,
        socketId,
        participantCount: this.meetingParticipants.get(meetingId)?.size || 0,
        wasFirstParticipant: wasEmpty,
      });
    } catch (error) {
      logger.error('Failed to add participant to meeting', {
        meetingId,
        userId,
        socketId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove participant from meeting room
   */
  async removeParticipantFromMeeting(meetingId: string, userId: string, socketId: string): Promise<void> {
    try {
      // Get user info before removal
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      });

      // Remove from participants tracking
      const participants = this.meetingParticipants.get(meetingId);
      let wasLastParticipant = false;

      if (participants) {
        participants.delete(userId);
        wasLastParticipant = participants.size === 0;

        if (wasLastParticipant) {
          this.meetingParticipants.delete(meetingId);
        }
      }

      // Notify other participants about the departure
      this.io.to(`meeting:${meetingId}`).emit('participant-left', {
        participant: {
          userId,
          email: user?.email || 'Unknown',
          name: user?.name || 'Unknown User',
        },
        socketId,
        meetingId,
        leftAt: new Date().toISOString(),
        remainingParticipants: participants?.size || 0,
        wasLastParticipant,
      });

      // If this was the last participant, notify about meeting deactivation
      if (wasLastParticipant) {
        this.io.to(`meeting:${meetingId}`).emit('meeting-deactivated', {
          meetingId,
          deactivatedBy: userId,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info('Participant removed from meeting', {
        meetingId,
        userId,
        socketId,
        remainingParticipants: participants?.size || 0,
        wasLastParticipant,
      });
    } catch (error) {
      logger.error('Failed to remove participant from meeting', {
        meetingId,
        userId,
        socketId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle real-time transcript updates
   */
  async handleTranscriptUpdate(
    meetingId: string,
    userId: string,
    transcript: TranscriptUpdate
  ): Promise<void> {
    try {
      // Verify user has access to meeting
      const meeting = await this.meetingService.getMeetingById(meetingId, userId);
      if (!meeting) {
        throw new Error('Meeting not found or access denied');
      }

      // Broadcast transcript update to all meeting participants
      this.io.to(`meeting:${meetingId}`).emit('transcript-update', {
        transcript,
        fromUserId: userId,
        timestamp: new Date().toISOString(),
      });

      // Save final transcripts to database
      if (transcript.isFinal) {
        await this.transcriptService.createTranscriptEntry(userId, {
          meetingId,
          speaker: transcript.speaker,
          text: transcript.text,
          timestamp: new Date(transcript.timestamp),
          confidence: transcript.confidence,
          isFinal: true,
        });

        logger.info('Final transcript saved', {
          meetingId,
          transcriptId: transcript.id,
          speaker: transcript.speaker,
          textLength: transcript.text.length,
        });
      }

      logger.debug('Transcript update processed', {
        meetingId,
        transcriptId: transcript.id,
        isFinal: transcript.isFinal,
        participantCount: this.meetingParticipants.get(meetingId)?.size || 0,
      });
    } catch (error) {
      logger.error('Failed to handle transcript update', {
        meetingId,
        userId,
        transcriptId: transcript.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Handle meeting status updates
   */
  async handleMeetingStatusUpdate(
    meetingId: string,
    userId: string,
    statusUpdate: MeetingStatusUpdate
  ): Promise<void> {
    try {
      // Update meeting status in database
      let updatedMeeting;

      switch (statusUpdate.status) {
        case 'RECORDING':
          updatedMeeting = await this.meetingService.startMeeting(meetingId, userId);
          break;
        case 'COMPLETED':
          updatedMeeting = await this.meetingService.endMeeting(meetingId, userId);
          break;
        default:
          // For other status updates, use a generic update method
          updatedMeeting = await this.meetingService.updateMeeting(meetingId, userId, {
            // Note: status updates handled by specific methods above
          });
      }

      // Broadcast status update to all meeting participants
      this.io.to(`meeting:${meetingId}`).emit('meeting-status-update', {
        meetingId,
        status: statusUpdate.status,
        metadata: statusUpdate.metadata,
        updatedBy: userId,
        timestamp: new Date().toISOString(),
        meeting: {
          id: updatedMeeting.id,
          title: updatedMeeting.title,
          status: updatedMeeting.status,
          startTime: updatedMeeting.startTime,
          endTime: updatedMeeting.endTime,
        },
      });

      logger.info('Meeting status updated', {
        meetingId,
        userId,
        oldStatus: statusUpdate.status,
        newStatus: updatedMeeting.status,
        participantCount: this.meetingParticipants.get(meetingId)?.size || 0,
      });
    } catch (error) {
      logger.error('Failed to handle meeting status update', {
        meetingId,
        userId,
        status: statusUpdate.status,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate AI summary and broadcast to participants
   */
  async generateAndBroadcastSummary(meetingId: string, userId: string): Promise<void> {
    try {
      // Notify participants that summary generation started
      this.io.to(`meeting:${meetingId}`).emit('summary-generation-started', {
        meetingId,
        startedBy: userId,
        timestamp: new Date().toISOString(),
      });

      // Generate summary
      const summary = await this.summaryService.generateSummaryForMeeting(meetingId, userId);

      // Broadcast completed summary to all participants
      this.io.to(`meeting:${meetingId}`).emit('ai:summary-generated', {
        meetingId,
        summary: summary.overallSummary,
        topics: summary.topics,
        keyPoints: summary.keyPoints,
        actionItems: summary.actionItems,
        nextSteps: summary.nextSteps,
        generatedBy: userId,
        timestamp: new Date().toISOString(),
      });

      logger.info('AI summary generated and broadcast', {
        meetingId,
        summaryId: summary.id,
        userId,
        participantCount: this.meetingParticipants.get(meetingId)?.size || 0,
      });
    } catch (error) {
      logger.error('Failed to generate and broadcast summary', {
        meetingId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Notify participants of failure
      this.io.to(`meeting:${meetingId}`).emit('summary-generation-error', {
        meetingId,
        error: 'Failed to generate summary',
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Broadcast chat message to meeting participants
   */
  async broadcastChatMessage(
    meetingId: string,
    userId: string,
    message: string
  ): Promise<void> {
    try {
      // Verify user has access to meeting
      const meeting = await this.meetingService.getMeetingById(meetingId, userId);
      if (!meeting) {
        throw new Error('Meeting not found or access denied');
      }

      // Get user info for the message
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Broadcast chat message to all meeting participants
      this.io.to(`meeting:${meetingId}`).emit('chat-message', {
        meetingId,
        message,
        timestamp: new Date().toISOString(),
        fromUser: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });

      logger.info('Chat message broadcast', {
        meetingId,
        userId,
        messageLength: message.length,
        participantCount: this.meetingParticipants.get(meetingId)?.size || 0,
      });
    } catch (error) {
      logger.error('Failed to broadcast chat message', {
        meetingId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get current meeting participants
   */
  private async getMeetingParticipants(meetingId: string): Promise<ParticipantInfo[]> {
    const participantIds = this.meetingParticipants.get(meetingId);
    if (!participantIds || participantIds.size === 0) {
      return [];
    }

    const users = await prisma.user.findMany({
      where: {
        id: { in: Array.from(participantIds) },
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return users.map(user => ({
      userId: user.id,
      email: user.email,
      name: user.name,
      joinedAt: new Date(), // TODO: Track actual join time
    }));
  }

  /**
   * Get meeting statistics
   */
  async getMeetingStats(meetingId: string): Promise<{
    participantCount: number;
    transcriptCount: number;
    duration: number | null;
  }> {
    const participantCount = this.meetingParticipants.get(meetingId)?.size || 0;

    const transcriptResult = await this.transcriptService.getTranscriptsForMeeting(
      meetingId,
      'system', // Use system user for stats
      { isFinal: true },
      { limit: 1 }
    );

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { startTime: true, endTime: true },
    });

    let duration: number | null = null;
    if (meeting?.startTime && meeting?.endTime) {
      duration = meeting.endTime.getTime() - meeting.startTime.getTime();
    }

    return {
      participantCount,
      transcriptCount: transcriptResult.pagination.total,
      duration,
    };
  }

  /**
   * Synchronize meeting status across all participants
   */
  async synchronizeMeetingStatus(meetingId: string): Promise<void> {
    try {
      // Get current meeting from database
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (!meeting) {
        logger.warn('Cannot synchronize status for non-existent meeting', { meetingId });
        return;
      }

      // Get current participants
      const participants = await this.getMeetingParticipants(meetingId);

      // Get meeting statistics
      const stats = await this.getMeetingStats(meetingId);

      // Broadcast synchronized state to all participants
      this.io.to(`meeting:${meetingId}`).emit('meeting-status-synchronized', {
        meetingId,
        meeting: {
          id: meeting.id,
          title: meeting.title,
          description: meeting.description,
          status: meeting.status,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          platform: meeting.platform,
          owner: meeting.user,
        },
        participants,
        stats,
        timestamp: new Date().toISOString(),
      });

      logger.info('Meeting status synchronized', {
        meetingId,
        participantCount: participants.length,
        status: meeting.status,
      });
    } catch (error) {
      logger.error('Failed to synchronize meeting status', {
        meetingId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Broadcast meeting update to all participants
   */
  async broadcastMeetingUpdate(
    meetingId: string,
    updateType: 'STATUS_CHANGE' | 'METADATA_UPDATE' | 'PARTICIPANT_UPDATE' | 'CAPTURE_UPDATE',
    updateData: any
  ): Promise<void> {
    try {
      // Broadcast update to all meeting participants
      this.io.to(`meeting:${meetingId}`).emit('meeting-update-broadcast', {
        meetingId,
        updateType,
        updateData,
        timestamp: new Date().toISOString(),
      });

      // Also synchronize the full meeting status
      await this.synchronizeMeetingStatus(meetingId);

      logger.info('Meeting update broadcast', {
        meetingId,
        updateType,
        participantCount: this.meetingParticipants.get(meetingId)?.size || 0,
      });
    } catch (error) {
      logger.error('Failed to broadcast meeting update', {
        meetingId,
        updateType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get comprehensive meeting state
   */
  async getComprehensiveMeetingState(meetingId: string): Promise<{
    meeting: any;
    participants: ParticipantInfo[];
    stats: any;
    isActive: boolean;
  }> {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const participants = await this.getMeetingParticipants(meetingId);
    const stats = await this.getMeetingStats(meetingId);
    const isActive = this.meetingParticipants.has(meetingId);

    return {
      meeting: {
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        status: meeting.status,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        platform: meeting.platform,
        owner: meeting.user,
      },
      participants,
      stats,
      isActive,
    };
  }

  /**
   * Cleanup disconnected participants
   */
  cleanupDisconnectedParticipant(userId: string, socketId: string): void {
    // Find and remove participant from all meetings
    for (const [meetingId, participants] of this.meetingParticipants.entries()) {
      if (participants.has(userId)) {
        this.removeParticipantFromMeeting(meetingId, userId, socketId);
      }
    }
  }
}