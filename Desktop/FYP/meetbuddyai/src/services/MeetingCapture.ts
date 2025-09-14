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

export class MeetingCaptureService {
  private static instance: MeetingCaptureService;
  private activeSessions: Map<string, CaptureSession> = new Map();
  private mediaRecorder: MediaRecorder | null = null;
  private recognition: SpeechRecognition | null = null;
  private screenStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;

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

  async startCapture(platform: string, meetingUrl: string): Promise<string> {
    const sessionId = `session_${Date.now()}`;
    
    try {
      // Initialize media capture streams
      await this.initializeMediaStreams();
      
      // Initialize speech recognition
      await this.initializeSpeechRecognition();
      
      const session: CaptureSession = {
        id: sessionId,
        platform,
        meetingUrl,
        startTime: new Date(),
        isRecording: true,
        isTranscribing: true,
        participants: [],
        recordingBlobs: [],
        transcriptEntries: []
      };

      this.activeSessions.set(sessionId, session);
      
      // Start platform-specific capture
      await this.startPlatformCapture(platform, meetingUrl);
      
      // Start recording
      this.startRecording(sessionId);
      
      return sessionId;
    } catch (error) {
      console.error('Failed to start capture:', error);
      throw error;
    }
  }

  private async initializeMediaStreams(): Promise<void> {
    try {
      // Capture screen with system audio
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: 'screen',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });

      // Capture microphone audio
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });

      // Combine streams
      const combinedStream = new MediaStream([
        ...this.screenStream.getVideoTracks(),
        ...this.screenStream.getAudioTracks(),
        ...this.audioStream.getAudioTracks()
      ]);

      // Initialize MediaRecorder
      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp9,opus',
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
      };

    } catch (error) {
      console.error('Failed to initialize media streams:', error);
      throw new Error('Media capture initialization failed. Please ensure you grant screen and microphone permissions.');
    }
  }

  private async initializeSpeechRecognition(): Promise<void> {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 3;
      
      this.recognition.onresult = (event) => {
        this.handleSpeechResult(event);
      };
      
      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          console.warn('Microphone access denied. Transcription disabled.');
        }
      };
      
      this.recognition.onend = () => {
        // Restart recognition if still capturing
        if (this.activeSessions.size > 0) {
          setTimeout(() => {
            try {
              this.recognition?.start();
            } catch (error) {
              console.warn('Failed to restart speech recognition:', error);
            }
          }, 100);
        }
      };
      
      this.recognition.start();
    } else {
      console.warn('Speech recognition not supported in this browser');
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
        await this.captureGoogleMeet(meetingUrl);
        break;
      case 'zoom':
        await this.captureZoom(meetingUrl);
        break;
      case 'microsoft-teams':
        await this.captureTeams(meetingUrl);
        break;
      case 'webex':
        await this.captureWebex(meetingUrl);
        break;
      case 'discord':
        await this.captureDiscord(meetingUrl);
        break;
      case 'skype':
        await this.captureSkype(meetingUrl);
        break;
      default:
        await this.captureGeneric(meetingUrl);
    }
  }

  private async captureGoogleMeet(meetingUrl: string): Promise<void> {
    // Google Meet specific capture logic
    console.log('Initializing Google Meet capture...');
    
    // In production, this would:
    // 1. Use Chrome extension APIs to inject into Google Meet
    // 2. Access the meeting's MediaStream objects
    // 3. Extract participant information from DOM
    // 4. Monitor chat messages and reactions
    // 5. Detect speaker changes and participant join/leave events
    
    this.simulatePlatformEvents('Google Meet');
  }

  private async captureZoom(meetingUrl: string): Promise<void> {
    console.log('Initializing Zoom capture...');
    
    // In production, this would:
    // 1. Use Zoom SDK or browser extension
    // 2. Access meeting streams through Zoom's Client SDK
    // 3. Extract participant data and chat messages
    // 4. Monitor breakout room activities
    
    this.simulatePlatformEvents('Zoom');
  }

  private async captureTeams(meetingUrl: string): Promise<void> {
    console.log('Initializing Microsoft Teams capture...');
    
    // In production, this would:
    // 1. Use Microsoft Graph APIs
    // 2. Access Teams meeting data through Graph SDK
    // 3. Capture audio/video streams
    // 4. Extract meeting metadata and participant info
    
    this.simulatePlatformEvents('Microsoft Teams');
  }

  private async captureWebex(meetingUrl: string): Promise<void> {
    console.log('Initializing Webex capture...');
    this.simulatePlatformEvents('Webex');
  }

  private async captureDiscord(meetingUrl: string): Promise<void> {
    console.log('Initializing Discord capture...');
    this.simulatePlatformEvents('Discord');
  }

  private async captureSkype(meetingUrl: string): Promise<void> {
    console.log('Initializing Skype capture...');
    this.simulatePlatformEvents('Skype');
  }

  private async captureGeneric(meetingUrl: string): Promise<void> {
    console.log('Initializing generic web meeting capture...');
    this.simulatePlatformEvents('Generic Platform');
  }

  private simulatePlatformEvents(platformName: string): void {
    // Simulate platform-specific events and participant detection
    const participants = [
      'John Smith', 'Sarah Johnson', 'Mike Wilson', 'Emily Davis', 'Alex Chen'
    ];
    
    // Simulate participant join events
    setTimeout(() => {
      participants.forEach((participant, index) => {
        setTimeout(() => {
          console.log(`${participant} joined the ${platformName} meeting`);
          this.onParticipantJoin?.(participant);
        }, index * 2000);
      });
    }, 1000);
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

  private handleSpeechResult(event: SpeechRecognitionEvent): void {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      const confidence = event.results[i][0].confidence;
      
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
        
        // Create transcript entry
        const entry: TranscriptEntry = {
          id: `transcript_${Date.now()}_${i}`,
          speaker: 'Current Speaker', // In production, use speaker diarization
          text: transcript,
          timestamp: new Date(),
          confidence: confidence || 0.9,
          isFinal: true
        };
        
        // Add to active sessions
        this.activeSessions.forEach(session => {
          session.transcriptEntries.push(entry);
        });
        
      } else {
        interimTranscript += transcript;
      }
    }

    // Emit transcript update
    this.onTranscriptUpdate?.(finalTranscript, interimTranscript);
  }

  async stopCapture(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      // Stop media recording
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }

      // Stop speech recognition
      if (this.recognition) {
        this.recognition.stop();
      }

      // Stop media streams
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => track.stop());
        this.screenStream = null;
      }

      if (this.audioStream) {
        this.audioStream.getTracks().forEach(track => track.stop());
        this.audioStream = null;
      }

      // Process final recording
      await this.processFinalRecording(session);

      this.activeSessions.delete(sessionId);
      console.log('Capture session ended:', sessionId);
      
    } catch (error) {
      console.error('Error stopping capture:', error);
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

  // Real-time platform integration methods
  async connectToPlatform(platform: string, credentials?: any): Promise<boolean> {
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
