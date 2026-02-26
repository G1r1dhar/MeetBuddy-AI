import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { socketAuthMiddleware, getSocketUser } from '../middleware/socketAuth';
import { RealtimeService } from '../services/realtimeService';
import { CaptureService } from '../services/captureService';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  meetingId?: string;
}

export const setupSocketHandlers = (io: SocketIOServer): void => {
  // Initialize services
  const realtimeService = new RealtimeService(io);
  const captureService = new CaptureService(io);

  // Authentication middleware for Socket.IO
  io.use(socketAuthMiddleware);

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = getSocketUser(socket);
    
    logger.info('Authenticated client connected', { 
      socketId: socket.id,
      userId: user.userId,
      email: user.email,
      role: user.role,
    });

    // Send authentication confirmation
    socket.emit('authenticated', { 
      success: true,
      user: {
        id: user.userId,
        email: user.email,
        role: user.role,
      },
    });

    // Handle joining meeting rooms
    socket.on('join-meeting', async (data: { meetingId: string }) => {
      try {
        const { meetingId } = data;
        const user = getSocketUser(socket);
        
        socket.meetingId = meetingId;
        socket.join(`meeting:${meetingId}`);
        
        await realtimeService.addParticipantToMeeting(meetingId, user.userId, socket.id);
        
        socket.emit('join-meeting-success', { meetingId });
      } catch (error) {
        logger.error('Failed to join meeting', {
          socketId: socket.id,
          userId: socket.userId,
          meetingId: data.meetingId,
          error: error instanceof Error ? error.message : String(error),
        });
        
        socket.emit('join-meeting-error', {
          meetingId: data.meetingId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Handle leaving meeting rooms
    socket.on('leave-meeting', async (data: { meetingId: string }) => {
      try {
        const { meetingId } = data;
        const user = getSocketUser(socket);
        
        socket.leave(`meeting:${meetingId}`);
        await realtimeService.removeParticipantFromMeeting(meetingId, user.userId, socket.id);
        
        delete socket.meetingId;
        socket.emit('leave-meeting-success', { meetingId });
      } catch (error) {
        logger.error('Failed to leave meeting', {
          socketId: socket.id,
          userId: socket.userId,
          meetingId: data.meetingId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Handle real-time transcript updates
    socket.on('transcript-update', async (data: {
      meetingId: string;
      transcript: {
        id: string;
        speaker: string;
        text: string;
        timestamp: string;
        confidence: number;
        isFinal: boolean;
      };
    }) => {
      try {
        const { meetingId, transcript } = data;
        const user = getSocketUser(socket);
        
        await realtimeService.handleTranscriptUpdate(meetingId, user.userId, transcript);
        
        socket.emit('transcript-update-success', {
          meetingId,
          transcriptId: transcript.id,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to handle transcript update', {
          socketId: socket.id,
          userId: socket.userId,
          meetingId: data.meetingId,
          error: errorMessage,
        });
        
        socket.emit('transcript-update-error', {
          meetingId: data.meetingId,
          transcriptId: data.transcript.id,
          error: errorMessage,
        });
      }
    });

    // Handle meeting status updates
    socket.on('meeting-status-update', async (data: {
      meetingId: string;
      status: 'SCHEDULED' | 'RECORDING' | 'COMPLETED' | 'CANCELLED';
      metadata?: any;
    }) => {
      try {
        const { meetingId, status, metadata } = data;
        const user = getSocketUser(socket);
        
        await realtimeService.handleMeetingStatusUpdate(meetingId, user.userId, {
          status,
          metadata,
        });
        
        socket.emit('meeting-status-update-success', {
          meetingId,
          status,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to handle meeting status update', {
          socketId: socket.id,
          userId: socket.userId,
          meetingId: data.meetingId,
          error: errorMessage,
        });
        
        socket.emit('meeting-status-update-error', {
          meetingId: data.meetingId,
          error: errorMessage,
        });
      }
    });

    // Handle AI summary generation requests
    socket.on('generate-summary', async (data: { meetingId: string }) => {
      try {
        const { meetingId } = data;
        const user = getSocketUser(socket);
        
        // Generate and broadcast summary (this is async and will emit events)
        await realtimeService.generateAndBroadcastSummary(meetingId, user.userId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to generate summary', {
          socketId: socket.id,
          userId: socket.userId,
          meetingId: data.meetingId,
          error: errorMessage,
        });
        
        socket.emit('summary-generation-error', {
          meetingId: data.meetingId,
          error: errorMessage,
        });
      }
    });

    // Handle chat messages
    socket.on('chat-message', async (data: {
      meetingId: string;
      message: string;
    }) => {
      try {
        const { meetingId, message } = data;
        const user = getSocketUser(socket);
        
        await realtimeService.broadcastChatMessage(meetingId, user.userId, message);
        
        socket.emit('chat-message-success', {
          meetingId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to broadcast chat message', {
          socketId: socket.id,
          userId: socket.userId,
          meetingId: data.meetingId,
          error: errorMessage,
        });
        
        socket.emit('chat-message-error', {
          meetingId: data.meetingId,
          error: errorMessage,
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      const user = getSocketUser(socket);
      
      logger.info('Client disconnected', {
        socketId: socket.id,
        userId: user.userId,
        reason,
      });

      // Clean up participant from all meetings
      realtimeService.cleanupDisconnectedParticipant(user.userId, socket.id);
      
      // Clean up capture sessions
      captureService.cleanupUserSessions(user.userId);
    });

    // Handle errors
    socket.on('error', (error) => {
      const user = getSocketUser(socket);
      
      logger.error('Socket error', {
        socketId: socket.id,
        userId: user.userId,
        error: error.message,
        stack: error.stack,
      });
    });

    // Handle meeting stats requests
    socket.on('get-meeting-stats', async (data: { meetingId: string }) => {
      try {
        const { meetingId } = data;
        const stats = await realtimeService.getMeetingStats(meetingId);
        
        socket.emit('meeting-stats', {
          meetingId,
          stats,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get meeting stats', {
          socketId: socket.id,
          meetingId: data.meetingId,
          error: errorMessage,
        });
        
        socket.emit('meeting-stats-error', {
          meetingId: data.meetingId,
          error: errorMessage,
        });
      }
    });

    // Handle capture session initialization
    socket.on('initialize-capture', async (data: {
      meetingId: string;
      captureConfig: {
        platform?: string;
        deviceInfo?: any;
        audioConfig?: any;
        videoConfig?: any;
      };
    }) => {
      try {
        const { meetingId, captureConfig } = data;
        const user = getSocketUser(socket);
        
        const session = await captureService.initializeCaptureSession(
          meetingId,
          user.userId,
          captureConfig
        );
        
        socket.emit('capture-initialized', {
          sessionId: session.id,
          meetingId,
          status: session.status,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to initialize capture', {
          socketId: socket.id,
          userId: socket.userId,
          meetingId: data.meetingId,
          error: errorMessage,
        });
        
        socket.emit('capture-initialization-error', {
          meetingId: data.meetingId,
          error: errorMessage,
        });
      }
    });

    // Handle capture start
    socket.on('start-capture', async (data: { sessionId: string }) => {
      try {
        const { sessionId } = data;
        const user = getSocketUser(socket);
        
        await captureService.startCapture(sessionId, user.userId);
        
        socket.emit('capture-start-success', {
          sessionId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to start capture', {
          socketId: socket.id,
          userId: socket.userId,
          sessionId: data.sessionId,
          error: errorMessage,
        });
        
        socket.emit('capture-start-error', {
          sessionId: data.sessionId,
          error: errorMessage,
        });
      }
    });

    // Handle capture pause
    socket.on('pause-capture', async (data: { sessionId: string }) => {
      try {
        const { sessionId } = data;
        const user = getSocketUser(socket);
        
        await captureService.pauseCapture(sessionId, user.userId);
        
        socket.emit('capture-pause-success', {
          sessionId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to pause capture', {
          socketId: socket.id,
          userId: socket.userId,
          sessionId: data.sessionId,
          error: errorMessage,
        });
        
        socket.emit('capture-pause-error', {
          sessionId: data.sessionId,
          error: errorMessage,
        });
      }
    });

    // Handle capture stop
    socket.on('stop-capture', async (data: { sessionId: string }) => {
      try {
        const { sessionId } = data;
        const user = getSocketUser(socket);
        
        await captureService.stopCapture(sessionId, user.userId);
        
        socket.emit('capture-stop-success', {
          sessionId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to stop capture', {
          socketId: socket.id,
          userId: socket.userId,
          sessionId: data.sessionId,
          error: errorMessage,
        });
        
        socket.emit('capture-stop-error', {
          sessionId: data.sessionId,
          error: errorMessage,
        });
      }
    });

    // Handle capture events (audio, video, transcripts)
    socket.on('capture-event', async (data: {
      sessionId: string;
      event: {
        type: 'AUDIO_CHUNK' | 'VIDEO_CHUNK' | 'TRANSCRIPT_SEGMENT' | 'STATUS_UPDATE' | 'ERROR';
        timestamp: string;
        data: any;
      };
    }) => {
      try {
        const { sessionId, event } = data;
        const user = getSocketUser(socket);
        
        await captureService.processCaptureEvent(sessionId, user.userId, {
          type: event.type,
          timestamp: new Date(event.timestamp),
          data: event.data,
        });
        
        socket.emit('capture-event-processed', {
          sessionId,
          eventType: event.type,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to process capture event', {
          socketId: socket.id,
          userId: socket.userId,
          sessionId: data.sessionId,
          eventType: data.event.type,
          error: errorMessage,
        });
        
        socket.emit('capture-event-error', {
          sessionId: data.sessionId,
          eventType: data.event.type,
          error: errorMessage,
        });
      }
    });

    // Handle get active capture sessions
    socket.on('get-capture-sessions', async (data: { meetingId: string }) => {
      try {
        const { meetingId } = data;
        const sessions = captureService.getActiveSessions(meetingId);
        
        socket.emit('capture-sessions', {
          meetingId,
          sessions: sessions.map(session => ({
            id: session.id,
            status: session.status,
            startTime: session.startTime,
            endTime: session.endTime,
            metadata: session.metadata,
          })),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get capture sessions', {
          socketId: socket.id,
          meetingId: data.meetingId,
          error: errorMessage,
        });
        
        socket.emit('capture-sessions-error', {
          meetingId: data.meetingId,
          error: errorMessage,
        });
      }
    });

    // Handle set capture coordinator
    socket.on('set-capture-coordinator', async (data: { 
      meetingId: string; 
      coordinatorId: string; 
    }) => {
      try {
        const { meetingId, coordinatorId } = data;
        const user = getSocketUser(socket);
        
        await captureService.setCaptureCoordinator(meetingId, user.userId, coordinatorId);
        
        socket.emit('capture-coordinator-set-success', {
          meetingId,
          coordinatorId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to set capture coordinator', {
          socketId: socket.id,
          meetingId: data.meetingId,
          coordinatorId: data.coordinatorId,
          error: errorMessage,
        });
        
        socket.emit('capture-coordinator-set-error', {
          meetingId: data.meetingId,
          coordinatorId: data.coordinatorId,
          error: errorMessage,
        });
      }
    });

    // Handle remove capture coordinator
    socket.on('remove-capture-coordinator', async (data: { 
      meetingId: string; 
      coordinatorId: string; 
    }) => {
      try {
        const { meetingId, coordinatorId } = data;
        const user = getSocketUser(socket);
        
        await captureService.removeCaptureCoordinator(meetingId, user.userId, coordinatorId);
        
        socket.emit('capture-coordinator-removed-success', {
          meetingId,
          coordinatorId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to remove capture coordinator', {
          socketId: socket.id,
          meetingId: data.meetingId,
          coordinatorId: data.coordinatorId,
          error: errorMessage,
        });
        
        socket.emit('capture-coordinator-removed-error', {
          meetingId: data.meetingId,
          coordinatorId: data.coordinatorId,
          error: errorMessage,
        });
      }
    });

    // Handle set capture permissions
    socket.on('set-capture-permissions', async (data: { 
      meetingId: string; 
      permissions: {
        allowMultipleCaptures?: boolean;
        requiresApproval?: boolean;
        coordinatorOnly?: boolean;
      };
    }) => {
      try {
        const { meetingId, permissions } = data;
        const user = getSocketUser(socket);
        
        await captureService.setCapturePermissions(meetingId, user.userId, permissions);
        
        socket.emit('capture-permissions-set-success', {
          meetingId,
          permissions,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to set capture permissions', {
          socketId: socket.id,
          meetingId: data.meetingId,
          error: errorMessage,
        });
        
        socket.emit('capture-permissions-set-error', {
          meetingId: data.meetingId,
          error: errorMessage,
        });
      }
    });

    // Handle capture approval response
    socket.on('respond-capture-request', async (data: { 
      requestId: string; 
      approved: boolean; 
      reason?: string; 
    }) => {
      try {
        const { requestId, approved, reason } = data;
        const user = getSocketUser(socket);
        
        await captureService.respondToCaptureRequest(requestId, user.userId, approved, reason);
        
        socket.emit('capture-request-responded-success', {
          requestId,
          approved,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to respond to capture request', {
          socketId: socket.id,
          requestId: data.requestId,
          approved: data.approved,
          error: errorMessage,
        });
        
        socket.emit('capture-request-responded-error', {
          requestId: data.requestId,
          error: errorMessage,
        });
      }
    });

    // Handle get meeting capture status
    socket.on('get-meeting-capture-status', async (data: { meetingId: string }) => {
      try {
        const { meetingId } = data;
        const user = getSocketUser(socket);
        
        // Verify user has access to meeting
        const meeting = await realtimeService.getMeetingStats(meetingId);
        const captureStatus = captureService.getMeetingCaptureStatus(meetingId);
        
        socket.emit('meeting-capture-status', {
          meetingId,
          ...captureStatus,
          isCoordinator: captureService.isCaptureCoordinator(meetingId, user.userId),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get meeting capture status', {
          socketId: socket.id,
          meetingId: data.meetingId,
          error: errorMessage,
        });
        
        socket.emit('meeting-capture-status-error', {
          meetingId: data.meetingId,
          error: errorMessage,
        });
      }
    });

    // Handle synchronize meeting status
    socket.on('synchronize-meeting', async (data: { meetingId: string }) => {
      try {
        const { meetingId } = data;
        const user = getSocketUser(socket);
        
        // Verify user has access to meeting
        const { MeetingService } = await import('../services/meetingService');
        const meetingService = new MeetingService();
        const meeting = await meetingService.getMeetingById(meetingId, user.userId);
        
        if (!meeting) {
          throw new Error('Meeting not found or access denied');
        }

        await realtimeService.synchronizeMeetingStatus(meetingId);
        
        socket.emit('meeting-synchronized', {
          meetingId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to synchronize meeting', {
          socketId: socket.id,
          meetingId: data.meetingId,
          error: errorMessage,
        });
        
        socket.emit('meeting-synchronization-error', {
          meetingId: data.meetingId,
          error: errorMessage,
        });
      }
    });

    // Handle get comprehensive meeting state
    socket.on('get-meeting-state', async (data: { meetingId: string }) => {
      try {
        const { meetingId } = data;
        const user = getSocketUser(socket);
        
        // Verify user has access to meeting
        const { MeetingService } = await import('../services/meetingService');
        const meetingService = new MeetingService();
        const meeting = await meetingService.getMeetingById(meetingId, user.userId);
        
        if (!meeting) {
          throw new Error('Meeting not found or access denied');
        }

        const state = await realtimeService.getComprehensiveMeetingState(meetingId);
        const captureStatus = captureService.getMeetingCaptureStatus(meetingId);
        
        socket.emit('meeting-state-response', {
          meetingId,
          ...state,
          captureStatus,
          userRole: {
            isOwner: meeting.userId === user.userId,
            isCoordinator: captureService.isCaptureCoordinator(meetingId, user.userId),
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to get meeting state', {
          socketId: socket.id,
          meetingId: data.meetingId,
          error: errorMessage,
        });
        
        socket.emit('meeting-state-error', {
          meetingId: data.meetingId,
          error: errorMessage,
        });
      }
    });

    // Handle broadcast meeting update
    socket.on('broadcast-meeting-update', async (data: { 
      meetingId: string; 
      updateType: 'STATUS_CHANGE' | 'METADATA_UPDATE' | 'PARTICIPANT_UPDATE' | 'CAPTURE_UPDATE';
      updateData: any;
    }) => {
      try {
        const { meetingId, updateType, updateData } = data;
        const user = getSocketUser(socket);
        
        // Verify user has access to meeting
        const { MeetingService } = await import('../services/meetingService');
        const meetingService = new MeetingService();
        const meeting = await meetingService.getMeetingById(meetingId, user.userId);
        
        if (!meeting) {
          throw new Error('Meeting not found or access denied');
        }

        await realtimeService.broadcastMeetingUpdate(meetingId, updateType, {
          ...updateData,
          updatedBy: user.userId,
        });
        
        socket.emit('meeting-update-broadcast-success', {
          meetingId,
          updateType,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to broadcast meeting update', {
          socketId: socket.id,
          meetingId: data.meetingId,
          updateType: data.updateType,
          error: errorMessage,
        });
        
        socket.emit('meeting-update-broadcast-error', {
          meetingId: data.meetingId,
          updateType: data.updateType,
          error: errorMessage,
        });
      }
    });
  });

  // Export services for use in other parts of the application
  (io as any).realtimeService = realtimeService;
  (io as any).captureService = captureService;
};