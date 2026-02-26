export interface PlatformIntegration {
  id: string;
  name: string;
  status: 'connected' | 'ready' | 'disconnected';
  icon: string;
  capabilities: {
    videoCapture: boolean;
    audioCapture: boolean;
    screenCapture: boolean;
    transcription: boolean;
  };
}

export interface CaptureSession {
  id: string;
  platform: string;
  meetingUrl: string;
  startTime: Date;
  isRecording: boolean;
  isTranscribing: boolean;
  participants: string[];
  recordingBlobs: Blob[];
  transcriptEntries: TranscriptEntry[];
}

export interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: Date;
  confidence: number;
  isFinal: boolean;
}

// Import our local whisper service
import { whisperService } from './whisperService';

export class MeetingCaptureService {
  private static instance: MeetingCaptureService;
  private activeSessions: Map<string, CaptureSession> = new Map();
  private mediaRecorder: MediaRecorder | null = null;
  private screenStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;
  private demoTranscriptInterval: NodeJS.Timeout | null = null;
  private currentMeetingId: string | null = null;

  // Legacy speech recognition properties (to be removed)
  private recognition: any = null;

  // private networkErrorCount: number = 0;

  static getInstance(): MeetingCaptureService {
    if (!MeetingCaptureService.instance) {
      MeetingCaptureService.instance = new MeetingCaptureService();
    }
    return MeetingCaptureService.instance;
  }

  async initializePlatformIntegrations(): Promise<PlatformIntegration[]> {
    return [
      {
        id: 'google-meet',
        name: 'Google Meet',
        status: 'connected',
        icon: '🎥',
        capabilities: {
          videoCapture: true,
          audioCapture: true,
          screenCapture: true,
          transcription: true
        }
      },
      {
        id: 'zoom',
        name: 'Zoom',
        status: 'ready',
        icon: '📹',
        capabilities: {
          videoCapture: true,
          audioCapture: true,
          screenCapture: true,
          transcription: true
        }
      },
      {
        id: 'microsoft-teams',
        name: 'Microsoft Teams',
        status: 'ready',
        icon: '💼',
        capabilities: {
          videoCapture: true,
          audioCapture: true,
          screenCapture: true,
          transcription: true
        }
      },
      {
        id: 'webex',
        name: 'Cisco Webex',
        status: 'ready',
        icon: '🌐',
        capabilities: {
          videoCapture: true,
          audioCapture: true,
          screenCapture: true,
          transcription: true
        }
      },
      {
        id: 'discord',
        name: 'Discord',
        status: 'ready',
        icon: '🎮',
        capabilities: {
          videoCapture: true,
          audioCapture: true,
          screenCapture: true,
          transcription: true
        }
      },
      {
        id: 'skype',
        name: 'Skype',
        status: 'ready',
        icon: '📞',
        capabilities: {
          videoCapture: true,
          audioCapture: true,
          screenCapture: false,
          transcription: true
        }
      }
    ];
  }

  async startCapture(meetingId: string, platform: string, meetingUrl: string, speechOnly: boolean = false): Promise<string> {
    const sessionId = `session_${Date.now()}`;

    try {
      console.log('DEBUG: startCapture called with:', { meetingId, platform, meetingUrl });
      this.currentMeetingId = meetingId;
      console.log('DEBUG: currentMeetingId set to:', this.currentMeetingId);

      // Initialize media capture streams (skip if speech-only mode)
      if (!speechOnly) {
        await this.initializeMediaStreams();
      }

      // Initialize speech recognition
      await this.initializeSpeechRecognition();

      const session: CaptureSession = {
        id: sessionId,
        platform,
        meetingUrl,
        startTime: new Date(),
        isRecording: !speechOnly, // Only record if not speech-only mode
        isTranscribing: true,
        participants: [],
        recordingBlobs: [],
        transcriptEntries: []
      };

      this.activeSessions.set(sessionId, session);

      // Start platform-specific capture
      await this.startPlatformCapture(platform, meetingUrl);

      // Start recording (skip if speech-only mode)
      if (!speechOnly) {
        this.startRecording(sessionId);
      }

      return sessionId;
    } catch (error) {
      console.error('Failed to start capture:', error);
      throw error;
    }
  }

  private async initializeMediaStreams(): Promise<void> {
    try {
      // Check for media device support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Screen capture is not supported in this browser. Please use Chrome, Firefox, or Edge.');
      }

      // Request permissions first
      await this.requestPermissions();

      // Capture screen with system audio
      try {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 30, max: 60 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 }
          }
        });

        // Handle screen share cancellation
        this.screenStream.getVideoTracks()[0].addEventListener('ended', () => {
          this.onScreenShareEnded?.();
          console.log('Screen sharing was stopped by user');
        });

      } catch (screenError) {
        if (screenError instanceof DOMException) {
          switch (screenError.name) {
            case 'NotAllowedError':
              throw new Error('Screen sharing permission denied. Please allow screen sharing to continue.');
            case 'NotFoundError':
              throw new Error('No screen available for sharing.');
            case 'NotSupportedError':
              throw new Error('Screen sharing is not supported in this browser.');
            case 'AbortError':
              throw new Error('Screen sharing was cancelled by user.');
            default:
              throw new Error(`Screen sharing failed: ${screenError.message}`);
          }
        }
        throw screenError;
      }

      // Capture microphone audio with fallback
      try {
        this.audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 2 }
          }
        });
      } catch (audioError) {
        console.warn('Microphone access failed, continuing without microphone:', audioError);
        // Continue without microphone - screen audio might still be available
        if (audioError instanceof DOMException && audioError.name === 'NotAllowedError') {
          this.onPermissionDenied?.('microphone');
        }
      }

      // Combine available streams
      const tracks: MediaStreamTrack[] = [];

      if (this.screenStream) {
        tracks.push(...this.screenStream.getVideoTracks());
        tracks.push(...this.screenStream.getAudioTracks());
      }

      if (this.audioStream) {
        tracks.push(...this.audioStream.getAudioTracks());
      }

      if (tracks.length === 0) {
        throw new Error('No media tracks available. Please ensure you grant the necessary permissions.');
      }

      const combinedStream = new MediaStream(tracks);

      // Initialize MediaRecorder with fallback options
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error('No supported video format found for recording.');
      }

      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 128000
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.handleRecordingData(event.data);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        this.onRecordingError?.(event.error || new Error('Recording failed'));
      };

      this.mediaRecorder.onstart = () => {
        console.log('Recording started successfully');
        this.onRecordingStarted?.();
      };

      this.mediaRecorder.onstop = () => {
        console.log('Recording stopped');
        this.onRecordingStopped?.();
      };

    } catch (error) {
      console.error('Failed to initialize media streams:', error);

      // Clean up any partial streams
      this.cleanupStreams();

      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error('Media capture initialization failed. Please check your browser permissions and try again.');
      }
    }
  }

  private async requestPermissions(): Promise<void> {
    try {
      // Check if permissions API is available
      if ('permissions' in navigator) {
        // Check camera permission (for screen sharing)
        try {
          const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (cameraPermission.state === 'denied') {
            throw new Error('Camera permission is required for screen sharing. Please enable it in your browser settings.');
          }
        } catch (permError) {
          // Permission query might not be supported for all permission types
          console.warn('Could not query camera permission:', permError);
        }

        // Check microphone permission
        try {
          const micPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (micPermission.state === 'denied') {
            console.warn('Microphone permission denied. Audio capture will be limited to system audio.');
          }
        } catch (permError) {
          console.warn('Could not query microphone permission:', permError);
        }
      }
    } catch (error) {
      console.warn('Permission check failed:', error);
      // Continue anyway - actual permission requests will happen during media access
    }
  }

  private cleanupStreams(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => {
        track.stop();
        track.removeEventListener('ended', () => { });
      });
      this.screenStream = null;
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
  }

  private async initializeSpeechRecognition(): Promise<void> {
    // Always start with browser Web Speech API — it's free, instant, and reliable.
    // We do NOT rely on Whisper availability check because the OpenAI quota can be
    // exceeded while whisperAvailable still returns true, leading to silent empty results.
    console.log('🎤 Starting browser Web Speech API transcription (primary)...');
    this.startDemoTranscription();

    // Also attempt to start a Whisper server session in the background for storage,
    // but do NOT block or error if it fails.
    if (this.currentMeetingId && this.currentMeetingId !== 'undefined' && this.currentMeetingId !== 'null') {
      whisperService.startTranscription(this.currentMeetingId).then(() => {
        console.log('✅ Whisper server session started (background)');
      }).catch((err: Error) => {
        // Non-fatal — Web Speech API already running
        console.warn('Whisper server session failed (quota/network), using Web Speech API only:', err.message);
      });
    }
  }

  private startRecording(sessionId: string): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
      this.mediaRecorder.start(1000); // Capture chunks every second
      console.log('Recording started for session:', sessionId);
    }
  }

  private async startPlatformCapture(platform: string, meetingUrl: string): Promise<void> {
    console.log(`Starting ${platform} capture for:`, meetingUrl);

    // Platform-specific integration logic
    switch (platform) {
      case 'google-meet':
        await this.captureGoogleMeet();
        break;
      case 'zoom':
        await this.captureZoom();
        break;
      case 'microsoft-teams':
        await this.captureTeams();
        break;
      case 'webex':
        await this.captureWebex();
        break;
      case 'discord':
        await this.captureDiscord();
        break;
      case 'skype':
        await this.captureSkype();
        break;
      default:
        await this.captureGeneric();
    }
  }

  private async captureGoogleMeet(): Promise<void> {
    // Google Meet specific capture logic
    console.log('Initializing Google Meet capture...');

    // In production, this would:
    // 1. Use Chrome extension APIs to inject into Google Meet
    // 2. Access the meeting's MediaStream objects
    // 3. Extract participant information from DOM
    // 4. Monitor chat messages and reactions
    // 5. Detect speaker changes and participant join/leave events
    console.log('Google Meet capture initialized.');
  }

  private async captureZoom(): Promise<void> {
    console.log('Initializing Zoom capture...');

    // In production, this would:
    // 1. Use Zoom SDK or browser extension
    // 2. Access meeting streams through Zoom's Client SDK
    // 3. Extract participant data and chat messages
    // 4. Monitor breakout room activities
    // Focus on direct zoom capture in future versions
    console.log(`Zoom capture initialized.`);
  }

  private async captureTeams(): Promise<void> {
    console.log('Initializing Microsoft Teams capture...');

    // In production, this would:
    // 1. Use Microsoft Graph APIs
    // 2. Access Teams meeting data through Graph SDK
    // 3. Capture audio/video streams
    // 4. Extract meeting metadata and participant info
    // Native Graph SDK integration stubbed.
    console.log(`Teams capture initialized.`);
  }

  private async captureWebex(): Promise<void> {
    console.log('Initializing Webex capture...');
  }

  private async captureDiscord(): Promise<void> {
    console.log('Initializing Discord capture...');
  }

  private async captureSkype(): Promise<void> {
    console.log('Initializing Skype capture...');
  }

  private async captureGeneric(): Promise<void> {
    console.log('Initializing generic web meeting capture...');
  }

  private handleRecordingData(data: Blob): void {
    // Store recording chunk
    this.activeSessions.forEach(session => {
      session.recordingBlobs.push(data);
    });

    console.log('Recording chunk captured:', data.size, 'bytes');

    // In production, this would:
    // 1. Upload chunks to cloud storage (AWS S3, Google Cloud Storage)
    // 2. Process for real-time AI analysis
    // 3. Generate video thumbnails and previews
    // 4. Compress and optimize for storage
  }

  private handleSpeechResult(event: any): void {
    let finalTranscript = '';
    let interimTranscript = '';

    try {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence || 0.8;

        console.log('✅ Speech result received:', {
          isFinal: result.isFinal,
          transcript,
          confidence,
          resultIndex: i
        });

        if (result.isFinal) {
          finalTranscript += transcript;

          // Enhanced speaker identification
          const speaker = this.identifySpeaker(transcript, confidence);

          // Create transcript entry with enhanced metadata
          const entry: TranscriptEntry = {
            id: `transcript_${Date.now()}_${i}`,
            speaker: speaker,
            text: transcript.trim(),
            timestamp: new Date(),
            confidence: confidence,
            isFinal: true
          };

          // Add to active sessions
          this.activeSessions.forEach(session => {
            session.transcriptEntries.push(entry);

            // Update participant list if new speaker detected
            if (!session.participants.includes(speaker)) {
              session.participants.push(speaker);
              this.onParticipantJoin?.(speaker);
            }
          });

          console.log('🎯 Emitting final transcript:', finalTranscript);
          // Emit final transcript
          this.onTranscriptUpdate?.(finalTranscript.trim(), '');

        } else {
          interimTranscript += transcript;
          console.log('⏳ Emitting interim transcript:', interimTranscript);
          // Emit interim transcript
          this.onTranscriptUpdate?.(finalTranscript, interimTranscript);
        }
      }
    } catch (error) {
      console.error('Error processing speech result:', error);
      this.onTranscriptionError?.(error instanceof Error ? error.message : 'Speech processing error');
    }
  }


  private identifySpeaker(_transcript: string, confidence: number): string {
    // For now, if confidence is high, assume it's the primary speaker
    if (confidence > 0.9) {
      return 'Primary Speaker';
    } else if (confidence > 0.7) {
      return 'Secondary Speaker';
    } else {
      return 'Unknown Speaker';
    }
  }

  async stopCapture(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.warn(`No active session found with ID: ${sessionId}`);
      return;
    }

    try {
      console.log(`DEBUG: stopCapture called for sessionId: ${sessionId}, meetingId was: ${this.currentMeetingId}`);
      console.log(`Stopping capture session: ${sessionId}`);

      // Update session status
      session.isRecording = false;
      session.isTranscribing = false;

      // Stop media recording gracefully
      if (this.mediaRecorder) {
        if (this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.stop();
          // Wait for the stop event to complete
          await new Promise<void>((resolve) => {
            const handleStop = () => {
              this.mediaRecorder?.removeEventListener('stop', handleStop);
              resolve();
            };
            this.mediaRecorder?.addEventListener('stop', handleStop);

            // Fallback timeout
            setTimeout(resolve, 5000);
          });
        }
        this.mediaRecorder = null;
      }

      // Stop speech recognition
      if (this.recognition) {
        try {
          console.log('Stopping speech recognition...');

          // Remove event listeners to prevent further events
          this.recognition.onresult = null;
          this.recognition.onerror = null;
          this.recognition.onstart = null;
          this.recognition.onend = null;

          // Stop recognition
          this.recognition.stop();
          this.recognition = null;
          console.log('Speech recognition stopped successfully');
        } catch (recognitionError) {
          console.warn('Error stopping speech recognition:', recognitionError);
        }
      }

      // Stop WhisperX transcription service
      if (this.currentMeetingId) {
        try {
          console.log('Stopping WhisperX transcription service...');
          await whisperService.stopTranscription();
          console.log('WhisperX transcription stopped successfully');
        } catch (whisperError) {
          console.warn('Error stopping WhisperX transcription:', whisperError);
        }
        this.currentMeetingId = null;
      }

      // Stop demo transcription if running
      this.stopDemoTranscription();

      // Reset network error count
      // this.networkErrorCount = 0;

      // Clean up media streams
      this.cleanupStreams();

      // Process final recording
      try {
        await this.processFinalRecording(session);
      } catch (processingError) {
        console.error('Error processing final recording:', processingError);
        // Continue with cleanup even if processing fails
      }

      // Remove session
      this.activeSessions.delete(sessionId);
      console.log('Capture session ended successfully:', sessionId);

      // Notify completion
      this.onRecordingStopped?.();

    } catch (error) {
      console.error('Error stopping capture:', error);

      // Force cleanup even if there were errors
      this.cleanupStreams();
      this.activeSessions.delete(sessionId);

      // Notify error
      this.onRecordingError?.(error instanceof Error ? error : new Error('Failed to stop capture'));

      throw error;
    }
  }

  async pauseCapture(sessionId: string): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      console.log('Recording paused for session:', sessionId);
    }
  }

  async resumeCapture(sessionId: string): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      console.log('Recording resumed for session:', sessionId);
    }
  }

  private async processFinalRecording(session: CaptureSession): Promise<void> {
    if (session.recordingBlobs.length === 0) return;

    // Combine all recording blobs
    const finalBlob = new Blob(session.recordingBlobs, { type: 'video/webm' });
    const recordingUrl = URL.createObjectURL(finalBlob);

    console.log('Final recording created:', recordingUrl);
    console.log('Total transcript entries:', session.transcriptEntries.length);

    // In production, this would:
    // 1. Upload final video to cloud storage
    // 2. Process transcript for AI analysis
    // 3. Generate meeting summary and topics
    // 4. Create mind map visualization
    // 5. Send notifications to participants

    this.onRecordingComplete?.(recordingUrl, session.transcriptEntries);
  }

  getActiveSession(sessionId: string): CaptureSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  getAllActiveSessions(): CaptureSession[] {
    return Array.from(this.activeSessions.values());
  }

  // Event callbacks
  onTranscriptUpdate?: (final: string, interim: string) => void;
  onParticipantJoin?: (participant: string) => void;
  onRecordingComplete?: (recordingUrl: string, transcript: TranscriptEntry[]) => void;
  onPermissionDenied?: (permission: 'microphone' | 'camera' | 'screen') => void;
  onRecordingError?: (error: Error) => void;
  onRecordingStarted?: () => void;
  onRecordingStopped?: () => void;
  onScreenShareEnded?: () => void;
  onTranscriptionError?: (error: string) => void;
  onTranscriptionStarted?: () => void;

  private startDemoTranscription(): void {
    // Use browser's native Web Speech API for real transcription (free, no API key)
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.warn('Web Speech API not supported in this browser. Cannot transcribe.');
      this.onTranscriptionError?.('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    console.log('🎤 Starting browser Web Speech API transcription...');

    // Create recognition instance
    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    // Wire in shared result handler
    this.recognition.onresult = (event: any) => this.handleSpeechResult(event);

    this.recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return; // Normal, ignore
      }
      console.warn('Speech recognition error:', event.error);
    };

    this.recognition.onend = () => {
      // Auto-restart to keep continuous capture going
      if (this.activeSessions.size > 0 && this.recognition) {
        try {
          this.recognition.start();
        } catch {
          // Already started or stopped
        }
      }
    };

    try {
      this.recognition.start();
      this.onTranscriptionStarted?.();
      console.log('✅ Web Speech API transcription started successfully');
    } catch (err) {
      console.error('Failed to start Web Speech API:', err);
      this.onTranscriptionError?.('Could not start microphone. Please allow microphone access and try again.');
    }
  }

  private stopDemoTranscription(): void {
    if (this.demoTranscriptInterval) {
      clearInterval(this.demoTranscriptInterval);
      this.demoTranscriptInterval = null;
    }
    if (this.recognition) {
      try {
        this.recognition.onend = null; // Prevent auto-restart loop
        this.recognition.stop();
        this.recognition = null;
        console.log('🎤 Web Speech API transcription stopped');
      } catch {
        // Already stopped
      }
    }
  }

  // Real-time platform integration methods
  async connectToPlatform(platform: string, _credentials?: any): Promise<boolean> {
    console.log(`Connecting to ${platform}...`);

    // Simulate connection process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // In production, this would handle OAuth flows and API authentication
    return true;
  }

  async extractMeetingMetadata(meetingUrl: string): Promise<any> {
    // Extract meeting ID, title, and other metadata from URL
    const urlPatterns = {
      'google-meet': /meet\.google\.com\/([a-z-]+)/,
      'zoom': /zoom\.us\/j\/(\d+)/,
      'microsoft-teams': /teams\.microsoft\.com.*meetup-join\/(\w+)/,
      'webex': /webex\.com.*\/(\w+)/
    };

    for (const [platform, pattern] of Object.entries(urlPatterns)) {
      const match = meetingUrl.match(pattern);
      if (match) {
        return {
          platform,
          meetingId: match[1],
          extractedAt: new Date()
        };
      }
    }

    return null;
  }

  // Advanced features for real-time processing
  async enableSpeakerDiarization(): Promise<void> {
    // In production, this would use advanced ML models for speaker identification
    console.log('Speaker diarization enabled');
  }

  async enableRealTimeTranslation(targetLanguage: string): Promise<void> {
    // Real-time translation of transcripts
    console.log(`Real-time translation enabled for: ${targetLanguage}`);
  }

  async enableSentimentAnalysis(): Promise<void> {
    // Real-time sentiment analysis of conversation
    console.log('Sentiment analysis enabled');
  }
}

// Global speech recognition types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
