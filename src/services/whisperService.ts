/**
 * Whisper Service for Real-time Transcription
 * 
 * Handles real-time audio transcription using Whisper API
 */

import { apiClient } from './apiClient';

export interface TranscriptSegment {
  text: string;
  speaker: string;
  timestamp: Date;
  confidence: number;
  isFinal: boolean;
}

export interface WhisperStatus {
  meetingId?: string;
  isTranscribing: boolean;
  whisperAvailable: boolean;
  message?: string;
}

class WhisperService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private meetingId: string | null = null;
  private chunkInterval: NodeJS.Timeout | null = null;
  private activeListenersCount = 0;
  private operationLock: Promise<void> = Promise.resolve();

  /**
   * Request appropriate permissions for the current platform
   */
  async requestPlatformPermissions(): Promise<{
    success: boolean;
    message: string;
    audioSource: 'system' | 'microphone';
  }> {
    const platformInfo = this.detectMeetingPlatform();

    try {
      // First try system audio (screen sharing with audio)
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: false,
          audio: true,
        });

        // Stop the test stream
        stream.getTracks().forEach(track => track.stop());

        return {
          success: true,
          message: `System audio access granted for ${platformInfo.platform}. This will capture meeting audio directly.`,
          audioSource: 'system',
        };
      } catch (displayError) {
        // Fallback to microphone
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        // Stop the test stream
        stream.getTracks().forEach(track => track.stop());

        return {
          success: true,
          message: `Microphone access granted. ${platformInfo.instructions}`,
          audioSource: 'microphone',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get audio permissions. Please allow microphone or screen sharing access.',
        audioSource: 'microphone',
      };
    }
  }

  /**
   * Start real-time transcription for a meeting
   */
  async startTranscription(meetingId: string): Promise<void> {
    const operation = async () => {
      try {
        this.activeListenersCount++;
        console.log(`[WhisperService] startTranscription called for meeting: ${meetingId}. Active listeners: ${this.activeListenersCount}`);

        // If already transcribing this meeting, just return
        if (this.meetingId === meetingId && this.isRecording) {
          console.log(`[WhisperService] Already transcribing meeting ${meetingId}, adding listener.`);
          return;
        }

        // If transcribing a DIFFERENT meeting, stop the old one first
        if (this.meetingId && this.meetingId !== meetingId) {
          console.warn(`[WhisperService] Already transcribing DIFFERENT meeting ${this.meetingId}. Stopping it first.`);
          await this.stopAudioCapture();
          // Reset count for new meeting since we are force-switching
          this.activeListenersCount = 1;
        }

        console.log('[WhisperService] Initializing server session for meeting:', meetingId);

        // Start transcription session on server first
        const response = await apiClient.post(`/whisper/start/${meetingId}`);

        if (!response.success) {
          throw new Error(response.message || 'Failed to start transcription session');
        }

        console.log('[WhisperService] Transcription session started on server:', response.data);

        // Now start audio capture
        this.meetingId = meetingId;
        await this.startAudioCapture();

        console.log('[WhisperService] Whisper transcription started successfully');
        return;
      } catch (error: any) {
        this.activeListenersCount = Math.max(0, this.activeListenersCount - 1);
        console.error('[WhisperService] Start transcription error:', error);
        throw new Error(error.message || 'Failed to start transcription');
      }
    };

    this.operationLock = this.operationLock.then(operation);
    return this.operationLock;
  }

  /**
   * Stop real-time transcription
   */
  async stopTranscription(force: boolean = false): Promise<void> {
    const operation = async () => {
      if (!this.meetingId) {
        this.activeListenersCount = 0;
        return;
      }

      this.activeListenersCount = Math.max(0, this.activeListenersCount - 1);
      console.log(`[WhisperService] stopTranscription called. Active listeners remaining: ${this.activeListenersCount}`);

      if (this.activeListenersCount > 0 && !force) {
        console.log('[WhisperService] Session still has active listeners, not stopping yet.');
        return;
      }

      try {
        const targetMeetingId = this.meetingId;
        console.log(`[WhisperService] Stopping transcription for meeting: ${targetMeetingId}`);

        // Stop audio capture first and wait for final chunk upload
        await this.stopAudioCapture();

        // Stop transcription on server
        try {
          const response = await apiClient.post(`/whisper/stop/${targetMeetingId}`);

          if (response.success) {
            console.log('[WhisperService] Transcription session stopped on server:', response.data);
          } else {
            console.warn('[WhisperService] Failed to stop transcription session:', response.message);
          }
        } catch (serverError) {
          console.warn('[WhisperService] Server stop transcription failed (session may not exist):', serverError);
        }

        this.meetingId = null;
        this.activeListenersCount = 0;
        console.log('[WhisperService] Transcription stopped successfully');

      } catch (error: any) {
        console.error('[WhisperService] Stop transcription error:', error);
        this.meetingId = null;
        this.activeListenersCount = 0;
        throw new Error(error.message || 'Failed to stop transcription');
      }
    };

    this.operationLock = this.operationLock.then(operation).catch(() => { });
    return this.operationLock;
  }

  /**
   * Upload and process complete audio file
   */
  async uploadAudioFile(meetingId: string, audioFile: File): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('audio', audioFile);

      const response = await apiClient.post(`/whisper/upload/${meetingId}`, formData);

      if (response.success && response.data) {
        return response.data as any;
      }

      throw new Error(response.message || 'Failed to upload audio file');
    } catch (error: any) {
      console.error('Upload audio file error:', error);
      throw new Error(error.message || 'Failed to upload audio file');
    }
  }

  /**
   * Get transcription status for a meeting
   */
  async getTranscriptionStatus(meetingId: string): Promise<WhisperStatus> {
    try {
      const response = await apiClient.get(`/whisper/status/${meetingId}`);

      if (response.data) {
        return response.data as WhisperStatus;
      }

      throw new Error(response.message || 'Failed to get transcription status');
    } catch (error: any) {
      console.error('Get transcription status error:', error);
      throw new Error(error.message || 'Failed to get transcription status');
    }
  }

  /**
   * Check if Whisper is available on the server
   */
  async checkWhisperAvailability(): Promise<boolean> {
    try {
      console.log('Making API call to /whisper/check...');
      const response = await apiClient.get('/whisper/check');
      console.log('Whisper check response:', response);
      console.log('Response data:', response.data);
      console.log('Whisper available:', (response.data as any)?.whisperAvailable);

      // The response structure is { success: boolean, message: string, data: { whisperAvailable: boolean } }
      if (response.success && response.data && typeof (response.data as any).whisperAvailable === 'boolean') {
        return (response.data as any).whisperAvailable;
      }

      return false;
    } catch (error: any) {
      console.error('Check Whisper availability error:', error);
      console.error('Error status:', error.status);
      console.error('Error message:', error.message);

      // Try direct fetch as fallback
      try {
        console.log('Trying direct fetch as fallback...');
        // @ts-ignore
        const envUrl = typeof import_meta !== 'undefined' ? (import.meta as any).env?.VITE_BACKEND_URL : undefined;
        const fetchUrl = envUrl ? `${envUrl}/api/whisper/check` : 'http://localhost:5000/api/whisper/check';
        const directResponse = await fetch(fetchUrl);
        if (directResponse.ok) {
          const data = await directResponse.json();
          console.log('Direct fetch response:', data);
          return data.data?.whisperAvailable || false;
        }
      } catch (directError) {
        console.error('Direct fetch also failed:', directError);
      }

      return false;
    }
  }

  /**
   * Start capturing audio from microphone or system audio
   */
  private async startAudioCapture(): Promise<void> {
    try {
      // Safety: Clean up existing captures if any
      if (this.chunkInterval) {
        clearInterval(this.chunkInterval);
        this.chunkInterval = null;
      }
      if (this.mediaRecorder) {
        try {
          this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
        } catch (e) { }
        this.mediaRecorder = null;
      }

      let stream: MediaStream;
      // ... same capture logic ...
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
          },
        });
        console.log('[WhisperService] System audio capture started');
      } catch (displayError) {
        console.log('[WhisperService] System audio not available, falling back to microphone');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
          },
        });
        console.log('[WhisperService] Microphone audio capture started');
      }

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: this.getSupportedMimeType(),
      });

      this.audioChunks = [];
      this.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.processAudioChunks();
      };

      this.mediaRecorder.start();

      this.chunkInterval = setInterval(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          console.log('[WhisperService] Rotating audio chunk (Interval reached)');
          this.mediaRecorder.stop();
          this.mediaRecorder.start();
        }
      }, 5000);

      console.log('[WhisperService] Audio capture interval started (5s)');

    } catch (error) {
      console.error('[WhisperService] Failed to start audio capture:', error);
      const platformInfo = this.detectMeetingPlatform();
      throw new Error(
        `Failed to access audio. For ${platformInfo.platform}: ${platformInfo.instructions} ` +
        'Please allow microphone or screen sharing permissions.'
      );
    }
  }

  /**
   * Stop audio capture
   */
  private stopAudioCapture(): Promise<void> {
    return new Promise((resolve) => {
      if (this.chunkInterval) {
        clearInterval(this.chunkInterval);
        this.chunkInterval = null;
      }

      if (this.mediaRecorder && this.isRecording) {
        // Redefine onstop to await our final chunk processing before resolving
        this.mediaRecorder.onstop = async () => {
          await this.processAudioChunks();
          resolve();
        };

        this.mediaRecorder.stop();

        // Stop all tracks to release microphone
        this.mediaRecorder.stream.getTracks().forEach(track => {
          track.stop();
        });

        this.mediaRecorder = null;
        this.isRecording = false;
        console.log('Audio capture stopped');
      } else {
        resolve();
      }
    });
  }

  /**
   * Process accumulated audio chunks
   */
  private async processAudioChunks(): Promise<void> {
    if (!this.meetingId || this.audioChunks.length === 0) {
      console.log('Skipping audio chunk processing: no meetingId or no chunks', { meetingId: this.meetingId, chunks: this.audioChunks.length });
      return;
    }

    try {
      // Capture chunks synchronously and clear the array to prevent race conditions during the long await
      const chunksToProcess = [...this.audioChunks];
      this.audioChunks = [];

      // Combine audio chunks into a single blob
      const audioBlob = new Blob(chunksToProcess, {
        type: this.getSupportedMimeType()
      });

      if (audioBlob.size < 500) {
        console.log('[WhisperService] Chunk too small, skipping upload', { size: audioBlob.size });
        return;
      }

      console.log(`[WhisperService] Processing audio chunks: Blob size = ${audioBlob.size} bytes. MIME = ${audioBlob.type}`);

      // Convert to File for upload
      const audioFile = new File([audioBlob], `audio-chunk-${Date.now()}.webm`, {
        type: audioBlob.type,
      });

      // Send to server for processing
      const formData = new FormData();
      formData.append('audio', audioFile);

      const resp = await apiClient.post(`/whisper/audio/${this.meetingId}`, formData);
      console.log('[WhisperService] Audio chunk response from server:', resp);


    } catch (error) {
      console.error('Failed to process audio chunks:', error);
      // Don't throw error to avoid stopping the recording
    }
  }

  /**
   * Get supported MIME type for MediaRecorder
   */
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/wav',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // Fallback
  }

  /**
   * Check if browser supports audio recording
   */
  static isAudioRecordingSupported(): boolean {
    return !!(navigator.mediaDevices &&
      (navigator.mediaDevices as any).getUserMedia &&
      (window as any).MediaRecorder);
  }

  /**
   * Detect current meeting platform from URL
   */
  private detectMeetingPlatform(): {
    platform: string;
    instructions: string;
  } {
    const url = window.location.href;

    if (url.includes('meet.google.com')) {
      return {
        platform: 'Google Meet',
        instructions: 'Make sure to share your screen with audio enabled for best transcription results.'
      };
    } else if (url.includes('zoom.us') || url.includes('zoom.com')) {
      return {
        platform: 'Zoom',
        instructions: 'Enable "Share computer sound" when sharing screen for accurate transcription.'
      };
    } else if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) {
      return {
        platform: 'Microsoft Teams',
        instructions: 'Use "Share system audio" option when sharing screen to capture meeting audio.'
      };
    } else if (url.includes('webex.com')) {
      return {
        platform: 'Webex',
        instructions: 'Enable audio sharing when sharing screen for transcription.'
      };
    } else {
      return {
        platform: 'Unknown',
        instructions: 'For best results, use screen sharing with audio enabled.'
      };
    }
  }

  /**
   * Get platform-specific setup instructions
   */
  getPlatformInstructions(): {
    platform: string;
    instructions: string;
    isSupported: boolean;
  } {
    const detection = this.detectMeetingPlatform();
    return {
      ...detection,
      isSupported: ['Google Meet', 'Zoom', 'Microsoft Teams', 'Webex'].includes(detection.platform),
    };
  }

  /**
   * Get current recording status
   */
  getRecordingStatus(): {
    isRecording: boolean;
    meetingId: string | null;
    platform?: string;
  } {
    const platformInfo = this.detectMeetingPlatform();
    return {
      isRecording: this.isRecording,
      meetingId: this.meetingId,
      platform: platformInfo.platform,
    };
  }
}

// Create singleton instance
export const whisperService = new WhisperService();