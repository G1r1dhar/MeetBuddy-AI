import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';
import { MeetingService } from './meetingService';
import { RealtimeService } from './realtimeService';
import { PlatformCaptureService } from './platformCaptureService';
import { prisma } from '../lib/prisma';
import { Platform } from '../lib/types';

interface CaptureSession {
  id: string;
  meetingId: string;
  userId: string;
  status: 'INITIALIZING' | 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'ERROR';
  startTime: Date;
  endTime?: Date;
  metadata: {
    platform?: string;
    deviceInfo?: any;
    audioConfig?: any;
    videoConfig?: any;
  };
}

interface CaptureEvent {
  type: 'AUDIO_CHUNK' | 'VIDEO_CHUNK' | 'TRANSCRIPT_SEGMENT' | 'STATUS_UPDATE' | 'ERROR';
  timestamp: Date;
  data: any;
  sessionId: string;
}

export class CaptureService {
  private io: SocketIOServer;
  private meetingService: MeetingService;
  private realtimeService: RealtimeService;
  private platformCaptureService: PlatformCaptureService;

  // Track active capture sessions
  private activeSessions: Map<string, CaptureSession> = new Map();
  private sessionsByMeeting: Map<string, Set<string>> = new Map();

  // Track capture coordinators (users who can control capture)
  private captureCoordinators: Map<string, Set<string>> = new Map(); // meetingId -> Set<userId>

  // Track capture permissions and states
  private capturePermissions: Map<string, {
    allowMultipleCaptures: boolean;
    requiresApproval: boolean;
    coordinatorOnly: boolean;
  }> = new Map(); // meetingId -> permissions

  constructor(io: SocketIOServer) {
    this.io = io;
    this.meetingService = new MeetingService();
    this.realtimeService = new RealtimeService(io);
    this.platformCaptureService = new PlatformCaptureService();
  }

  /**
   * Set capture coordinator for a meeting
   */
  async setCaptureCoordinator(meetingId: string, userId: string, coordinatorId: string): Promise<void> {
    try {
      // Verify meeting exists and user has access
      const meeting = await this.meetingService.getMeetingById(meetingId, userId);
      if (!meeting) {
        throw new Error('Meeting not found or access denied');
      }

      // Only meeting owner or existing coordinators can set new coordinators
      const isOwner = meeting.userId === userId;
      const isCoordinator = this.captureCoordinators.get(meetingId)?.has(userId) || false;

      if (!isOwner && !isCoordinator) {
        throw new Error('Only meeting owner or coordinators can set capture coordinators');
      }

      // Add coordinator
      if (!this.captureCoordinators.has(meetingId)) {
        this.captureCoordinators.set(meetingId, new Set());
      }
      this.captureCoordinators.get(meetingId)!.add(coordinatorId);

      // Notify meeting participants
      this.io.to(`meeting:${meetingId}`).emit('capture-coordinator-added', {
        meetingId,
        coordinatorId,
        addedBy: userId,
        timestamp: new Date().toISOString(),
      });

      logger.info('Capture coordinator added', {
        meetingId,
        coordinatorId,
        addedBy: userId,
      });
    } catch (error) {
      logger.error('Failed to set capture coordinator', {
        meetingId,
        userId,
        coordinatorId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove capture coordinator for a meeting
   */
  async removeCaptureCoordinator(meetingId: string, userId: string, coordinatorId: string): Promise<void> {
    try {
      // Verify meeting exists and user has access
      const meeting = await this.meetingService.getMeetingById(meetingId, userId);
      if (!meeting) {
        throw new Error('Meeting not found or access denied');
      }

      // Only meeting owner can remove coordinators
      if (meeting.userId !== userId) {
        throw new Error('Only meeting owner can remove capture coordinators');
      }

      // Remove coordinator
      const coordinators = this.captureCoordinators.get(meetingId);
      if (coordinators) {
        coordinators.delete(coordinatorId);
        if (coordinators.size === 0) {
          this.captureCoordinators.delete(meetingId);
        }
      }

      // Notify meeting participants
      this.io.to(`meeting:${meetingId}`).emit('capture-coordinator-removed', {
        meetingId,
        coordinatorId,
        removedBy: userId,
        timestamp: new Date().toISOString(),
      });

      logger.info('Capture coordinator removed', {
        meetingId,
        coordinatorId,
        removedBy: userId,
      });
    } catch (error) {
      logger.error('Failed to remove capture coordinator', {
        meetingId,
        userId,
        coordinatorId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Set capture permissions for a meeting
   */
  async setCapturePermissions(
    meetingId: string,
    userId: string,
    permissions: {
      allowMultipleCaptures?: boolean;
      requiresApproval?: boolean;
      coordinatorOnly?: boolean;
    }
  ): Promise<void> {
    try {
      // Verify meeting exists and user has access
      const meeting = await this.meetingService.getMeetingById(meetingId, userId);
      if (!meeting) {
        throw new Error('Meeting not found or access denied');
      }

      // Only meeting owner or coordinators can set permissions
      const isOwner = meeting.userId === userId;
      const isCoordinator = this.captureCoordinators.get(meetingId)?.has(userId) || false;

      if (!isOwner && !isCoordinator) {
        throw new Error('Only meeting owner or coordinators can set capture permissions');
      }

      // Update permissions
      const currentPermissions = this.capturePermissions.get(meetingId) || {
        allowMultipleCaptures: false,
        requiresApproval: false,
        coordinatorOnly: false,
      };

      const updatedPermissions = {
        ...currentPermissions,
        ...permissions,
      };

      this.capturePermissions.set(meetingId, updatedPermissions);

      // Notify meeting participants
      this.io.to(`meeting:${meetingId}`).emit('capture-permissions-updated', {
        meetingId,
        permissions: updatedPermissions,
        updatedBy: userId,
        timestamp: new Date().toISOString(),
      });

      logger.info('Capture permissions updated', {
        meetingId,
        permissions: updatedPermissions,
        updatedBy: userId,
      });
    } catch (error) {
      logger.error('Failed to set capture permissions', {
        meetingId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Request capture approval from coordinators
   */
  async requestCaptureApproval(
    meetingId: string,
    userId: string,
    captureConfig: {
      platform?: string;
      deviceInfo?: any;
      audioConfig?: any;
      videoConfig?: any;
    }
  ): Promise<{ requestId: string; requiresApproval: boolean }> {
    try {
      // Verify meeting exists and user has access
      const meeting = await this.meetingService.getMeetingById(meetingId, userId);
      if (!meeting) {
        throw new Error('Meeting not found or access denied');
      }

      const permissions = this.capturePermissions.get(meetingId);
      const requiresApproval = permissions?.requiresApproval || false;

      if (!requiresApproval) {
        return { requestId: '', requiresApproval: false };
      }

      // Generate request ID
      const requestId = `capture_request_${meetingId}_${userId}_${Date.now()}`;

      // Get coordinators
      const coordinators = this.captureCoordinators.get(meetingId) || new Set();

      // If no coordinators, default to meeting owner
      if (coordinators.size === 0) {
        coordinators.add(meeting.userId);
      }

      // Send approval request to coordinators
      for (const coordinatorId of coordinators) {
        this.io.to(`user:${coordinatorId}`).emit('capture-approval-request', {
          requestId,
          meetingId,
          requesterId: userId,
          captureConfig,
          timestamp: new Date().toISOString(),
        });
      }

      // Notify requester
      this.io.to(`user:${userId}`).emit('capture-approval-requested', {
        requestId,
        meetingId,
        coordinators: Array.from(coordinators),
        timestamp: new Date().toISOString(),
      });

      logger.info('Capture approval requested', {
        requestId,
        meetingId,
        userId,
        coordinators: Array.from(coordinators),
      });

      return { requestId, requiresApproval: true };
    } catch (error) {
      logger.error('Failed to request capture approval', {
        meetingId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Approve or deny capture request
   */
  async respondToCaptureRequest(
    requestId: string,
    coordinatorId: string,
    approved: boolean,
    reason?: string
  ): Promise<void> {
    try {
      // Parse request ID to get meeting and user info
      const parts = requestId.split('_');
      if (parts.length < 4) {
        throw new Error('Invalid request ID format');
      }

      const meetingId = parts[2] || '';
      const requesterId = parts[3] || '';
      if (!meetingId || !requesterId) throw new Error('Invalid request ID format');

      // Verify coordinator has permission
      const meeting = await this.meetingService.getMeetingById(meetingId, coordinatorId);
      if (!meeting) {
        throw new Error('Meeting not found or access denied');
      }

      const isOwner = meeting.userId === coordinatorId;
      const isCoordinator = this.captureCoordinators.get(meetingId)?.has(coordinatorId) || false;

      if (!isOwner && !isCoordinator) {
        throw new Error('Only meeting owner or coordinators can approve capture requests');
      }

      // Send response to requester
      this.io.to(`user:${requesterId}`).emit('capture-approval-response', {
        requestId,
        meetingId,
        approved,
        reason,
        respondedBy: coordinatorId,
        timestamp: new Date().toISOString(),
      });

      // Notify other coordinators
      const coordinators = this.captureCoordinators.get(meetingId) || new Set();
      for (const otherCoordinatorId of coordinators) {
        if (otherCoordinatorId !== coordinatorId) {
          this.io.to(`user:${otherCoordinatorId}`).emit('capture-approval-decided', {
            requestId,
            meetingId,
            requesterId,
            approved,
            decidedBy: coordinatorId,
            timestamp: new Date().toISOString(),
          });
        }
      }

      logger.info('Capture request responded', {
        requestId,
        meetingId,
        requesterId,
        coordinatorId,
        approved,
        reason,
      });
    } catch (error) {
      logger.error('Failed to respond to capture request', {
        requestId,
        coordinatorId,
        approved,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if user can start capture
   */
  private canUserStartCapture(meetingId: string, userId: string): boolean {
    const permissions = this.capturePermissions.get(meetingId);

    // If coordinator-only mode is enabled
    if (permissions?.coordinatorOnly) {
      const coordinators = this.captureCoordinators.get(meetingId) || new Set();
      return coordinators.has(userId);
    }

    // If multiple captures are not allowed, check if any session is active
    if (permissions?.allowMultipleCaptures === false) {
      const activeSessions = this.getActiveSessions(meetingId);
      const hasActiveSession = activeSessions.some(session =>
        session.status === 'ACTIVE' || session.status === 'INITIALIZING'
      );

      if (hasActiveSession) {
        return false;
      }
    }

    // Default to allowing capture if no specific restrictions
    return true;
  }

  /**
   * Validate meeting URL and extract platform information
   */
  async validateMeetingUrl(meetingUrl: string): Promise<{
    isValid: boolean;
    platform?: Platform;
    meetingInfo?: any;
    errors: string[];
  }> {
    try {
      const validation = this.platformCaptureService.validateMeetingUrl(meetingUrl);

      if (!validation.isValid) {
        return validation;
      }

      const meetingInfo = this.platformCaptureService.parseMeetingUrl(meetingUrl);

      return {
        isValid: true,
        platform: validation.platform,
        meetingInfo,
        errors: [],
      };
    } catch (error) {
      logger.error('Error validating meeting URL', {
        meetingUrl,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isValid: false,
        errors: ['Failed to validate meeting URL'],
      };
    }
  }

  /**
   * Get platform-specific capture configuration
   */
  getPlatformCaptureConfig(platform: Platform, customConfig?: any): {
    audioConfig: any;
    videoConfig: any;
    features: any;
    instructions: any;
  } | null {
    try {
      const config = this.platformCaptureService.getPlatformCaptureConfig(platform, customConfig);
      if (!config) {
        return null;
      }

      const instructions = this.platformCaptureService.generateCaptureInstructions(platform);

      return {
        ...config,
        instructions,
      };
    } catch (error) {
      logger.error('Error getting platform capture config', {
        platform,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Extract platform metadata for a meeting
   */
  async extractPlatformMetadata(
    meetingUrl: string,
    accessToken?: string,
    additionalContext?: Record<string, any>
  ): Promise<any> {
    try {
      return await this.platformCaptureService.extractPlatformMetadata(
        meetingUrl,
        accessToken,
        additionalContext
      );
    } catch (error) {
      logger.error('Error extracting platform metadata', {
        meetingUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Initialize a new capture session for a meeting
   */
  async initializeCaptureSession(
    meetingId: string,
    userId: string,
    captureConfig: {
      platform?: string;
      meetingUrl?: string;
      deviceInfo?: any;
      audioConfig?: any;
      videoConfig?: any;
    }
  ): Promise<CaptureSession> {
    try {
      // Verify meeting exists and user has access
      const meeting = await this.meetingService.getMeetingById(meetingId, userId);
      if (!meeting) {
        throw new Error('Meeting not found or access denied');
      }

      // Validate meeting URL if provided and extract platform information
      let platformMetadata = null;
      let detectedPlatform = meeting.platform;

      if (captureConfig.meetingUrl) {
        const urlValidation = await this.validateMeetingUrl(captureConfig.meetingUrl);
        if (!urlValidation.isValid) {
          throw new Error(`Invalid meeting URL: ${urlValidation.errors.join(', ')}`);
        }

        detectedPlatform = urlValidation.platform || meeting.platform;
        platformMetadata = await this.extractPlatformMetadata(captureConfig.meetingUrl);
      }

      // Get platform-specific configuration
      const platformConfig = this.getPlatformCaptureConfig(detectedPlatform as Platform, {
        ...captureConfig.audioConfig,
        ...captureConfig.videoConfig,
      });

      if (!platformConfig) {
        throw new Error(`Unsupported platform: ${detectedPlatform}`);
      }

      // Check platform-specific requirements
      if (!this.platformCaptureService.platformSupportsFeature(detectedPlatform as Platform, 'supportsRecording')) {
        logger.warn('Platform does not support recording', {
          platform: detectedPlatform,
          meetingId,
        });
      }

      // Check if user can start capture based on coordination rules
      if (!this.canUserStartCapture(meetingId, userId)) {
        throw new Error('Cannot start capture: permission denied or active session exists');
      }

      // Check if approval is required
      const permissions = this.capturePermissions.get(meetingId);
      if (permissions?.requiresApproval) {
        const approvalResult = await this.requestCaptureApproval(meetingId, userId, captureConfig);
        if (approvalResult.requiresApproval) {
          throw new Error(`Capture approval required. Request ID: ${approvalResult.requestId}`);
        }
      }

      // Generate unique session ID
      const sessionId = `capture_${meetingId}_${userId}_${Date.now()}`;

      // Merge platform-specific configuration with user config
      const enhancedConfig = {
        ...captureConfig,
        platform: detectedPlatform,
        platformMetadata,
        audioConfig: platformConfig.audioConfig,
        videoConfig: platformConfig.videoConfig,
        supportedFeatures: platformConfig.features,
        instructions: platformConfig.instructions,
      };

      // Create capture session
      const session: CaptureSession = {
        id: sessionId,
        meetingId,
        userId,
        status: 'INITIALIZING',
        startTime: new Date(),
        metadata: enhancedConfig,
      };

      // Store session
      this.activeSessions.set(sessionId, session);

      // Track by meeting
      if (!this.sessionsByMeeting.has(meetingId)) {
        this.sessionsByMeeting.set(meetingId, new Set());
      }
      this.sessionsByMeeting.get(meetingId)!.add(sessionId);

      // Notify meeting participants about new capture session
      this.io.to(`meeting:${meetingId}`).emit('capture-session-initialized', {
        sessionId,
        meetingId,
        userId,
        timestamp: new Date().toISOString(),
        config: captureConfig,
        permissions: permissions || {},
      });

      // Notify coordinators about new capture session
      const coordinators = this.captureCoordinators.get(meetingId) || new Set();
      for (const coordinatorId of coordinators) {
        this.io.to(`user:${coordinatorId}`).emit('capture-session-started-by-user', {
          sessionId,
          meetingId,
          userId,
          timestamp: new Date().toISOString(),
          config: captureConfig,
        });
      }

      logger.info('Capture session initialized', {
        sessionId,
        meetingId,
        userId,
        platform: captureConfig.platform,
        coordinators: Array.from(coordinators),
      });

      return session;
    } catch (error) {
      logger.error('Failed to initialize capture session', {
        meetingId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start active capture for a session
   */
  async startCapture(sessionId: string, userId: string): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Capture session not found');
      }

      if (session.userId !== userId) {
        throw new Error('Access denied to capture session');
      }

      if (session.status !== 'INITIALIZING' && session.status !== 'PAUSED') {
        throw new Error(`Cannot start capture from status: ${session.status}`);
      }

      // Update session status
      session.status = 'ACTIVE';
      session.startTime = new Date();

      // Start the meeting if not already started
      await this.meetingService.startMeeting(session.meetingId, userId);

      // Notify participants
      this.io.to(`meeting:${session.meetingId}`).emit('capture-started', {
        sessionId,
        meetingId: session.meetingId,
        userId,
        timestamp: new Date().toISOString(),
      });

      logger.info('Capture started', {
        sessionId,
        meetingId: session.meetingId,
        userId,
      });
    } catch (error) {
      await this.handleCaptureError(sessionId, error);
      throw error;
    }
  }

  /**
   * Pause capture for a session
   */
  async pauseCapture(sessionId: string, userId: string): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Capture session not found');
      }

      if (session.userId !== userId) {
        throw new Error('Access denied to capture session');
      }

      if (session.status !== 'ACTIVE') {
        throw new Error(`Cannot pause capture from status: ${session.status}`);
      }

      // Update session status
      session.status = 'PAUSED';

      // Notify participants
      this.io.to(`meeting:${session.meetingId}`).emit('capture-paused', {
        sessionId,
        meetingId: session.meetingId,
        userId,
        timestamp: new Date().toISOString(),
      });

      logger.info('Capture paused', {
        sessionId,
        meetingId: session.meetingId,
        userId,
      });
    } catch (error) {
      await this.handleCaptureError(sessionId, error);
      throw error;
    }
  }

  /**
   * Stop capture and finalize session
   */
  async stopCapture(sessionId: string, userId: string): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Capture session not found');
      }

      if (session.userId !== userId) {
        throw new Error('Access denied to capture session');
      }

      if (session.status === 'STOPPED') {
        return; // Already stopped
      }

      // Update session status
      session.status = 'STOPPED';
      session.endTime = new Date();

      // End the meeting
      await this.meetingService.endMeeting(session.meetingId, userId);

      // Notify participants
      this.io.to(`meeting:${session.meetingId}`).emit('capture-stopped', {
        sessionId,
        meetingId: session.meetingId,
        userId,
        timestamp: new Date().toISOString(),
        duration: session.endTime.getTime() - session.startTime.getTime(),
      });

      // Clean up session
      this.cleanupSession(sessionId);

      logger.info('Capture stopped', {
        sessionId,
        meetingId: session.meetingId,
        userId,
        duration: session.endTime.getTime() - session.startTime.getTime(),
      });
    } catch (error) {
      await this.handleCaptureError(sessionId, error);
      throw error;
    }
  }

  /**
   * Process capture events (audio, video, transcripts)
   */
  async processCaptureEvent(
    sessionId: string,
    userId: string,
    event: Omit<CaptureEvent, 'sessionId'>
  ): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Capture session not found');
      }

      if (session.userId !== userId) {
        throw new Error('Access denied to capture session');
      }

      if (session.status !== 'ACTIVE') {
        logger.warn('Received capture event for inactive session', {
          sessionId,
          status: session.status,
          eventType: event.type,
        });
        return;
      }

      const captureEvent: CaptureEvent = {
        ...event,
        sessionId,
      };

      // Process different event types
      switch (event.type) {
        case 'TRANSCRIPT_SEGMENT':
          await this.processTranscriptSegment(session, captureEvent);
          break;

        case 'AUDIO_CHUNK':
          await this.processAudioChunk(session, captureEvent);
          break;

        case 'VIDEO_CHUNK':
          await this.processVideoChunk(session, captureEvent);
          break;

        case 'STATUS_UPDATE':
          await this.processStatusUpdate(session, captureEvent);
          break;

        case 'ERROR':
          await this.handleCaptureError(sessionId, new Error(event.data.message || 'Capture error'));
          break;

        default:
          logger.warn('Unknown capture event type', {
            sessionId,
            eventType: event.type,
          });
      }

      logger.debug('Capture event processed', {
        sessionId,
        eventType: event.type,
        timestamp: event.timestamp,
      });
    } catch (error) {
      logger.error('Failed to process capture event', {
        sessionId,
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.handleCaptureError(sessionId, error);
    }
  }

  /**
   * Get active capture sessions for a meeting
   */
  getActiveSessions(meetingId: string): CaptureSession[] {
    const sessionIds = this.sessionsByMeeting.get(meetingId) || new Set();
    return Array.from(sessionIds)
      .map(id => this.activeSessions.get(id))
      .filter((session): session is CaptureSession => session !== undefined);
  }

  /**
   * Get capture session by ID
   */
  getSession(sessionId: string): CaptureSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Process transcript segment from capture
   */
  private async processTranscriptSegment(
    session: CaptureSession,
    event: CaptureEvent
  ): Promise<void> {
    const { speaker, text, confidence, isFinal } = event.data;

    // Create transcript update for realtime service
    const transcriptUpdate = {
      id: `${session.id}_${event.timestamp.getTime()}`,
      speaker: speaker || 'Unknown',
      text: text || '',
      timestamp: event.timestamp.toISOString(),
      confidence: confidence || 0.8,
      isFinal: isFinal || false,
    };

    // Send to realtime service for processing and broadcasting
    await this.realtimeService.handleTranscriptUpdate(
      session.meetingId,
      session.userId,
      transcriptUpdate
    );
  }

  /**
   * Process audio chunk from capture
   */
  private async processAudioChunk(
    session: CaptureSession,
    event: CaptureEvent
  ): Promise<void> {
    // For now, just broadcast to participants for real-time audio sharing
    // In a full implementation, this would be processed for transcription
    this.io.to(`meeting:${session.meetingId}`).emit('audio-chunk', {
      sessionId: session.id,
      timestamp: event.timestamp.toISOString(),
      data: event.data,
    });
  }

  /**
   * Process video chunk from capture
   */
  private async processVideoChunk(
    session: CaptureSession,
    event: CaptureEvent
  ): Promise<void> {
    // For now, just broadcast to participants for real-time video sharing
    // In a full implementation, this would be stored or processed
    this.io.to(`meeting:${session.meetingId}`).emit('video-chunk', {
      sessionId: session.id,
      timestamp: event.timestamp.toISOString(),
      data: event.data,
    });
  }

  /**
   * Process status update from capture
   */
  private async processStatusUpdate(
    session: CaptureSession,
    event: CaptureEvent
  ): Promise<void> {
    const { status, metadata } = event.data;

    // Update session metadata if provided
    if (metadata) {
      session.metadata = { ...session.metadata, ...metadata };
    }

    // Broadcast status update to participants
    this.io.to(`meeting:${session.meetingId}`).emit('capture-status-update', {
      sessionId: session.id,
      status,
      metadata,
      timestamp: event.timestamp.toISOString(),
    });
  }

  /**
   * Handle capture errors
   */
  private async handleCaptureError(sessionId: string, error: unknown): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update session status
    session.status = 'ERROR';

    // Notify participants
    this.io.to(`meeting:${session.meetingId}`).emit('capture-error', {
      sessionId,
      meetingId: session.meetingId,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    logger.error('Capture session error', {
      sessionId,
      meetingId: session.meetingId,
      userId: session.userId,
      error: errorMessage,
    });
  }

  /**
   * Clean up session resources
   */
  private cleanupSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    // Remove from meeting sessions
    const meetingSessions = this.sessionsByMeeting.get(session.meetingId);
    if (meetingSessions) {
      meetingSessions.delete(sessionId);
      if (meetingSessions.size === 0) {
        this.sessionsByMeeting.delete(session.meetingId);
      }
    }

    logger.debug('Capture session cleaned up', {
      sessionId,
      meetingId: session.meetingId,
    });
  }

  /**
   * Clean up all sessions for a user (on disconnect)
   */
  cleanupUserSessions(userId: string): void {
    const userSessions = Array.from(this.activeSessions.values())
      .filter(session => session.userId === userId);

    for (const session of userSessions) {
      this.cleanupSession(session.id);
    }

    logger.info('Cleaned up user capture sessions', {
      userId,
      sessionCount: userSessions.length,
    });
  }

  /**
   * Get capture coordinators for a meeting
   */
  getCaptureCoordinators(meetingId: string): string[] {
    return Array.from(this.captureCoordinators.get(meetingId) || new Set());
  }

  /**
   * Get capture permissions for a meeting
   */
  getCapturePermissions(meetingId: string): {
    allowMultipleCaptures: boolean;
    requiresApproval: boolean;
    coordinatorOnly: boolean;
  } {
    return this.capturePermissions.get(meetingId) || {
      allowMultipleCaptures: false,
      requiresApproval: false,
      coordinatorOnly: false,
    };
  }

  /**
   * Check if user is a capture coordinator
   */
  isCaptureCoordinator(meetingId: string, userId: string): boolean {
    return this.captureCoordinators.get(meetingId)?.has(userId) || false;
  }

  /**
   * Get meeting capture status
   */
  getMeetingCaptureStatus(meetingId: string): {
    hasActiveSessions: boolean;
    sessionCount: number;
    coordinators: string[];
    permissions: {
      allowMultipleCaptures: boolean;
      requiresApproval: boolean;
      coordinatorOnly: boolean;
    };
  } {
    const sessions = this.getActiveSessions(meetingId);
    const hasActiveSessions = sessions.some(session =>
      session.status === 'ACTIVE' || session.status === 'INITIALIZING'
    );

    return {
      hasActiveSessions,
      sessionCount: sessions.length,
      coordinators: this.getCaptureCoordinators(meetingId),
      permissions: this.getCapturePermissions(meetingId),
    };
  }

  /**
   * Cleanup meeting coordination data
   */
  cleanupMeetingCoordination(meetingId: string): void {
    this.captureCoordinators.delete(meetingId);
    this.capturePermissions.delete(meetingId);

    // Clean up all sessions for the meeting
    const sessionIds = this.sessionsByMeeting.get(meetingId) || new Set();
    for (const sessionId of sessionIds) {
      this.cleanupSession(sessionId);
    }

    logger.info('Meeting coordination data cleaned up', {
      meetingId,
      sessionCount: sessionIds.size,
    });
  }

  /**
   * Get supported platforms
   */
  getSupportedPlatforms(): Platform[] {
    return this.platformCaptureService.getSupportedPlatforms();
  }

  /**
   * Get platform display name
   */
  getPlatformDisplayName(platform: Platform): string {
    return this.platformCaptureService.getPlatformDisplayName(platform);
  }

  /**
   * Check if platform supports specific feature
   */
  platformSupportsFeature(platform: Platform, feature: string): boolean {
    return this.platformCaptureService.platformSupportsFeature(platform, feature as any);
  }

  /**
   * Generate platform-specific capture instructions
   */
  generateCaptureInstructions(platform: Platform): {
    setup: string[];
    permissions: string[];
    troubleshooting: string[];
  } {
    return this.platformCaptureService.generateCaptureInstructions(platform);
  }

  /**
   * Detect platform from meeting URL
   */
  detectPlatformFromUrl(meetingUrl: string): Platform | null {
    return this.platformCaptureService.detectPlatform(meetingUrl);
  }

  /**
   * Parse meeting URL information
   */
  parseMeetingUrl(meetingUrl: string): any {
    return this.platformCaptureService.parseMeetingUrl(meetingUrl);
  }

  /**
   * Get capture statistics
   */
  getCaptureStats(): {
    activeSessions: number;
    activeMeetings: number;
    totalSessions: number;
    coordinatedMeetings: number;
    supportedPlatforms: Platform[];
  } {
    return {
      activeSessions: this.activeSessions.size,
      activeMeetings: this.sessionsByMeeting.size,
      totalSessions: Array.from(this.activeSessions.values()).length,
      coordinatedMeetings: this.captureCoordinators.size,
      supportedPlatforms: this.getSupportedPlatforms(),
    };
  }
}