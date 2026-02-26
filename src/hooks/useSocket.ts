/**
 * Socket Hook
 * 
 * Custom React hook for managing Socket.io connection and events
 * Provides a clean interface for components to interact with real-time features
 */

import { useEffect, useRef, useCallback } from 'react';
import { socketService, type SocketEvents } from '../services/socketService';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/authService';

interface UseSocketOptions {
  autoConnect?: boolean;
  meetingId?: string;
}

interface UseSocketReturn {
  isConnected: boolean;
  connectionState: 'connected' | 'connecting' | 'disconnected';
  connect: () => Promise<void>;
  disconnect: () => void;
  joinMeeting: (meetingId: string) => void;
  leaveMeeting: (meetingId: string) => void;
  on: <K extends keyof SocketEvents>(event: K, listener: SocketEvents[K]) => void;
  off: <K extends keyof SocketEvents>(event: K, listener: SocketEvents[K]) => void;
  emit: {
    transcriptUpdate: (meetingId: string, entry: any) => void;
    meetingStatusUpdate: (meetingId: string, status: string) => void;
    chatMessage: (meetingId: string, message: string) => void;
    generateSummary: (meetingId: string) => void;
    generateMindMap: (meetingId: string) => void;
  };
}

export const useSocket = (options: UseSocketOptions = {}): UseSocketReturn => {
  const { autoConnect = true, meetingId } = options;
  const { user } = useAuth();
  const connectionAttempted = useRef(false);
  const currentMeetingId = useRef<string | null>(null);

  // Connect to socket when user is authenticated
  const connect = useCallback(async () => {
    if (!user || socketService.isConnected() || connectionAttempted.current) {
      return;
    }

    try {
      connectionAttempted.current = true;
      const token = authService.getToken();
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      await socketService.connect(token);
      console.log('Socket connected successfully');
    } catch (error) {
      console.error('Failed to connect socket:', error);
      connectionAttempted.current = false;
      throw error;
    }
  }, [user]);

  // Disconnect from socket
  const disconnect = useCallback(() => {
    socketService.disconnect();
    connectionAttempted.current = false;
    currentMeetingId.current = null;
  }, []);

  // Join a meeting room
  const joinMeeting = useCallback((meetingId: string) => {
    if (socketService.isConnected()) {
      socketService.joinMeetingRoom(meetingId);
      currentMeetingId.current = meetingId;
    }
  }, []);

  // Leave a meeting room
  const leaveMeeting = useCallback((meetingId: string) => {
    if (socketService.isConnected()) {
      socketService.leaveMeetingRoom(meetingId);
      if (currentMeetingId.current === meetingId) {
        currentMeetingId.current = null;
      }
    }
  }, []);

  // Event listener management
  const on = useCallback(<K extends keyof SocketEvents>(
    event: K,
    listener: SocketEvents[K]
  ) => {
    socketService.on(event, listener);
  }, []);

  const off = useCallback(<K extends keyof SocketEvents>(
    event: K,
    listener: SocketEvents[K]
  ) => {
    socketService.off(event, listener);
  }, []);

  // Emit events
  const emit = {
    transcriptUpdate: useCallback((meetingId: string, entry: any) => {
      socketService.sendTranscriptEntry(meetingId, entry);
    }, []),

    meetingStatusUpdate: useCallback((meetingId: string, status: string) => {
      socketService.updateMeetingStatus(meetingId, status as any);
    }, []),

    chatMessage: useCallback((meetingId: string, message: string) => {
      // This would be implemented if chat functionality is added
      console.log('Chat message:', { meetingId, message });
    }, []),

    generateSummary: useCallback((meetingId: string) => {
      socketService.requestSummary(meetingId);
    }, []),

    generateMindMap: useCallback((meetingId: string) => {
      socketService.requestMindMap(meetingId);
    }, []),
  };

  // Auto-connect when user is available
  useEffect(() => {
    if (autoConnect && user && !socketService.isConnected() && !connectionAttempted.current) {
      connect().catch(error => {
        console.error('Auto-connect failed:', error);
      });
    }
  }, [autoConnect, user, connect]);

  // Auto-join meeting if meetingId is provided
  useEffect(() => {
    if (meetingId && socketService.isConnected() && currentMeetingId.current !== meetingId) {
      joinMeeting(meetingId);
    }
  }, [meetingId, joinMeeting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentMeetingId.current) {
        leaveMeeting(currentMeetingId.current);
      }
    };
  }, [leaveMeeting]);

  return {
    isConnected: socketService.isConnected(),
    connectionState: socketService.getConnectionState(),
    connect,
    disconnect,
    joinMeeting,
    leaveMeeting,
    on,
    off,
    emit,
  };
};