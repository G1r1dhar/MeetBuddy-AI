/**
 * Socket Service
 * 
 * Handles real-time communication with the backend using Socket.io
 * Manages meeting status updates, transcript streaming, and participant management
 */

import { io, Socket } from 'socket.io-client';
import type { TranscriptEntry, Meeting } from './meetingService';

export interface SocketEvents {
  // Meeting events
  'meeting:joined': (data: { meetingId: string; userId: string; userName: string }) => void;
  'meeting:left': (data: { meetingId: string; userId: string; userName: string }) => void;
  'meeting:status-changed': (data: { meetingId: string; status: Meeting['status'] }) => void;
  'meeting:participant-joined': (data: { meetingId: string; participant: string }) => void;
  'meeting:participant-left': (data: { meetingId: string; participant: string }) => void;

  // Transcript events
  'transcript:new-entry': (data: { meetingId: string; entry: TranscriptEntry }) => void;
  'transcript:interim': (data: { meetingId: string; text: string; speaker: string }) => void;
  'transcript:speaker-changed': (data: { meetingId: string; speaker: string }) => void;

  // AI events
  'ai:summary-generated': (data: { meetingId: string; summary: string; topics: string[] }) => void;
  'ai:mindmap-generated': (data: { meetingId: string; mindMap: any }) => void;

  // System events
  'system:notification': (data: { type: string; message: string; meetingId?: string }) => void;
  'system:error': (data: { error: string; meetingId?: string }) => void;
}

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;

  // Event listeners
  private eventListeners: Map<keyof SocketEvents, Set<Function>> = new Map();

  async connect(token: string): Promise<void> {
    if (this.socket?.connected || this.isConnecting) {
      return;
    }

    try {
      this.isConnecting = true;

      const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
      console.log('[SocketService] Connecting to:', socketUrl);

      this.socket = io(socketUrl, {
        auth: {
          token,
        },
        transports: ['websocket', 'polling'], // Allow fallback to polling
        timeout: 20000,                       // Increase timeout to 20 seconds
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        forceNew: true,                       // Ensure a new connection is established
        path: '/socket.io',
      });

      // Set up connection event handlers
      this.setupConnectionHandlers();

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const error = new Error(`Socket connection timeout (20s). URL: ${import.meta.env.VITE_SOCKET_URL || 'default'}`);
          console.error('[SocketService] Connection timed out', {
            url: socketUrl,
            reconnectAttempts: this.reconnectAttempts
          });
          reject(error);
        }, 20000);

        this.socket!.on('connect', () => {
          clearTimeout(timeout);
          this.reconnectAttempts = 0;
          console.log('Socket connected successfully');
          resolve();
        });

        this.socket!.on('connect_error', (error) => {
          clearTimeout(timeout);
          console.error('Socket connection error:', error);
          reject(error);
        });
      });

    } catch (error) {
      console.error('Failed to connect socket:', error);
      this.isConnecting = false;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private setupConnectionHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.reconnectAttempts = 0;
      this.emit('system:notification', {
        type: 'success',
        message: 'Real-time connection established',
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.emit('system:notification', {
        type: 'warning',
        message: 'Real-time connection lost',
      });
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      this.emit('system:notification', {
        type: 'success',
        message: 'Real-time connection restored',
      });
    });

    this.socket.on('reconnect_error', (error) => {
      this.reconnectAttempts++;
      console.error('Socket reconnection error:', error);

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emit('system:error', {
          error: 'Failed to reconnect to real-time service',
        });
      }
    });

    // Set up event forwarding
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    if (!this.socket) return;

    // Meeting events
    this.socket.on('meeting:joined', (data) => this.emit('meeting:joined', data));
    this.socket.on('meeting:left', (data) => this.emit('meeting:left', data));
    this.socket.on('meeting:status-changed', (data) => this.emit('meeting:status-changed', data));
    this.socket.on('meeting:participant-joined', (data) => this.emit('meeting:participant-joined', data));
    this.socket.on('meeting:participant-left', (data) => this.emit('meeting:participant-left', data));

    // Transcript events
    this.socket.on('transcript:new-entry', (data) => this.emit('transcript:new-entry', data));
    this.socket.on('transcript:interim', (data) => this.emit('transcript:interim', data));
    this.socket.on('transcript:speaker-changed', (data) => this.emit('transcript:speaker-changed', data));

    // AI events
    this.socket.on('ai:summary-generated', (data) => this.emit('ai:summary-generated', data));
    this.socket.on('ai:mindmap-generated', (data) => this.emit('ai:mindmap-generated', data));

    // System events
    this.socket.on('system:notification', (data) => this.emit('system:notification', data));
    this.socket.on('system:error', (data) => this.emit('system:error', data));
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.eventListeners.clear();
    console.log('Socket disconnected');
  }

  // Event emission and listening
  private emit<K extends keyof SocketEvents>(event: K, data: Parameters<SocketEvents[K]>[0]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in socket event listener for ${event}:`, error);
        }
      });
    }
  }

  on<K extends keyof SocketEvents>(event: K, listener: SocketEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  off<K extends keyof SocketEvents>(event: K, listener: SocketEvents[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  // Meeting-specific methods
  joinMeetingRoom(meetingId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('join-meeting', { meetingId });
    }
  }

  leaveMeetingRoom(meetingId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('leave-meeting', { meetingId });
    }
  }

  sendTranscriptEntry(meetingId: string, entry: Omit<TranscriptEntry, 'id'>): void {
    if (this.socket?.connected) {
      const transcriptData = {
        id: `transcript_${Date.now()}`,
        speaker: entry.speaker,
        text: entry.text,
        timestamp: entry.timestamp.toISOString(),
        confidence: entry.confidence,
        isFinal: (entry as any).isFinal || true,
      };
      this.socket.emit('transcript-update', { meetingId, transcript: transcriptData });
    }
  }

  sendInterimTranscript(meetingId: string, text: string, speaker: string): void {
    if (this.socket?.connected) {
      const transcriptData = {
        id: `interim_${Date.now()}`,
        speaker,
        text,
        timestamp: new Date().toISOString(),
        confidence: 0.5,
        isFinal: false,
      };
      this.socket.emit('transcript-update', { meetingId, transcript: transcriptData });
    }
  }

  updateMeetingStatus(meetingId: string, status: Meeting['status']): void {
    if (this.socket?.connected) {
      this.socket.emit('meeting-status-update', { meetingId, status: status.toUpperCase() });
    }
  }

  // Utility methods
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getConnectionState(): 'connected' | 'connecting' | 'disconnected' {
    if (this.isConnecting) return 'connecting';
    if (this.socket?.connected) return 'connected';
    return 'disconnected';
  }

  // Participant management
  addParticipant(meetingId: string, participant: string): void {
    if (this.socket?.connected) {
      this.socket.emit('meeting:add-participant', { meetingId, participant });
    }
  }

  removeParticipant(meetingId: string, participant: string): void {
    if (this.socket?.connected) {
      this.socket.emit('meeting:remove-participant', { meetingId, participant });
    }
  }

  // AI integration
  requestSummary(meetingId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('generate-summary', { meetingId });
    }
  }

  requestMindMap(meetingId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('generate-mindmap', { meetingId });
    }
  }
}

// Create singleton instance
export const socketService = new SocketService();