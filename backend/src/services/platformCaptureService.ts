import { Platform } from '../lib/types';
import { logger } from '../utils/logger';

// Platform constants as fallback
const PLATFORMS = {
  GOOGLE_MEET: 'GOOGLE_MEET',
  ZOOM: 'ZOOM',
  MICROSOFT_TEAMS: 'MICROSOFT_TEAMS',
  WEBEX: 'WEBEX',
  DISCORD: 'DISCORD',
  SKYPE: 'SKYPE'
} as const;

// Platform-specific configuration and metadata
interface PlatformConfig {
  name: string;
  urlPatterns: RegExp[];
  defaultAudioConfig: AudioConfig;
  defaultVideoConfig: VideoConfig;
  supportedFeatures: PlatformFeatures;
  apiEndpoints?: PlatformApiEndpoints;
}

interface AudioConfig {
  sampleRate: number;
  channels: number;
  bitRate: number;
  codec: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

interface VideoConfig {
  resolution: string;
  frameRate: number;
  bitRate: number;
  codec: string;
}

interface PlatformFeatures {
  supportsScreenShare: boolean;
  supportsRecording: boolean;
  supportsTranscription: boolean;
  supportsBreakoutRooms: boolean;
  supportsChat: boolean;
  supportsParticipantList: boolean;
  maxParticipants: number;
  requiresPlugin: boolean;
}

interface PlatformApiEndpoints {
  meetingInfo?: string;
  participantList?: string;
  recordingControl?: string;
  transcriptionControl?: string;
}

interface MeetingUrlInfo {
  platform: Platform;
  meetingId: string;
  meetingUrl: string;
  roomName?: string;
  hostId?: string;
  password?: string;
  additionalParams: Record<string, string>;
}

interface PlatformMetadata {
  platform: Platform;
  meetingId: string;
  roomName?: string;
  hostInfo?: {
    id?: string;
    name?: string;
    email?: string;
  };
  participantInfo?: {
    maxParticipants: number;
    currentParticipants: number;
    participantList?: string[];
  };
  meetingSettings?: {
    isRecordingEnabled: boolean;
    isTranscriptionEnabled: boolean;
    hasPassword: boolean;
    isWaitingRoomEnabled: boolean;
  };
  technicalInfo?: {
    serverRegion?: string;
    connectionType?: string;
    quality?: string;
  };
}

export class PlatformCaptureService {
  private platformConfigs: Map<Platform, PlatformConfig>;

  constructor() {
    this.platformConfigs = new Map();
    this.initializePlatformConfigs();
  }

  /**
   * Initialize platform-specific configurations
   */
  private initializePlatformConfigs(): void {
    // Google Meet Configuration
    this.platformConfigs.set(Platform.GOOGLE_MEET, {
      name: 'Google Meet',
      urlPatterns: [
        /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/,
        /^https:\/\/meet\.google\.com\/lookup\/[a-zA-Z0-9_-]+$/,
        /^https:\/\/apps\.googleusercontent\.com\/meet\/[a-zA-Z0-9_-]+$/,
      ],
      defaultAudioConfig: {
        sampleRate: 48000,
        channels: 1,
        bitRate: 128000,
        codec: 'opus',
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      defaultVideoConfig: {
        resolution: '720p',
        frameRate: 30,
        bitRate: 2500000,
        codec: 'vp8',
      },
      supportedFeatures: {
        supportsScreenShare: true,
        supportsRecording: true,
        supportsTranscription: true,
        supportsBreakoutRooms: true,
        supportsChat: true,
        supportsParticipantList: true,
        maxParticipants: 250,
        requiresPlugin: false,
      },
      apiEndpoints: {
        meetingInfo: 'https://meet.googleapis.com/v2/conferences',
        participantList: 'https://meet.googleapis.com/v2/conferences/{conferenceId}/participants',
      },
    });

    // Microsoft Teams Configuration
    this.platformConfigs.set(Platform.MICROSOFT_TEAMS, {
      name: 'Microsoft Teams',
      urlPatterns: [
        /^https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[a-zA-Z0-9%_-]+$/,
        /^https:\/\/teams\.live\.com\/meet\/[a-zA-Z0-9_-]+$/,
        /^https:\/\/[a-zA-Z0-9-]+\.teams\.ms\/l\/meetup-join\/[a-zA-Z0-9%_-]+$/,
      ],
      defaultAudioConfig: {
        sampleRate: 48000,
        channels: 1,
        bitRate: 128000,
        codec: 'opus',
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      defaultVideoConfig: {
        resolution: '720p',
        frameRate: 30,
        bitRate: 2000000,
        codec: 'h264',
      },
      supportedFeatures: {
        supportsScreenShare: true,
        supportsRecording: true,
        supportsTranscription: true,
        supportsBreakoutRooms: true,
        supportsChat: true,
        supportsParticipantList: true,
        maxParticipants: 1000,
        requiresPlugin: false,
      },
      apiEndpoints: {
        meetingInfo: 'https://graph.microsoft.com/v1.0/me/onlineMeetings',
        participantList: 'https://graph.microsoft.com/v1.0/communications/calls/{callId}/participants',
      },
    });

    // Zoom Configuration
    this.platformConfigs.set(Platform.ZOOM, {
      name: 'Zoom',
      urlPatterns: [
        /^https:\/\/[a-zA-Z0-9-]+\.zoom\.us\/j\/\d{9,11}(\?pwd=[a-zA-Z0-9]+)?$/,
        /^https:\/\/zoom\.us\/j\/\d{9,11}(\?pwd=[a-zA-Z0-9]+)?$/,
        /^https:\/\/us[0-9]+web\.zoom\.us\/j\/\d{9,11}(\?pwd=[a-zA-Z0-9]+)?$/,
      ],
      defaultAudioConfig: {
        sampleRate: 48000,
        channels: 1,
        bitRate: 128000,
        codec: 'opus',
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      defaultVideoConfig: {
        resolution: '720p',
        frameRate: 30,
        bitRate: 2000000,
        codec: 'h264',
      },
      supportedFeatures: {
        supportsScreenShare: true,
        supportsRecording: true,
        supportsTranscription: true,
        supportsBreakoutRooms: true,
        supportsChat: true,
        supportsParticipantList: true,
        maxParticipants: 500,
        requiresPlugin: false,
      },
      apiEndpoints: {
        meetingInfo: 'https://api.zoom.us/v2/meetings',
        participantList: 'https://api.zoom.us/v2/meetings/{meetingId}/participants',
        recordingControl: 'https://api.zoom.us/v2/meetings/{meetingId}/recordings',
      },
    });

    // WebEx Configuration
    this.platformConfigs.set(Platform.WEBEX, {
      name: 'Cisco WebEx',
      urlPatterns: [
        /^https:\/\/[a-zA-Z0-9-]+\.webex\.com\/meet\/[a-zA-Z0-9._-]+$/,
        /^https:\/\/[a-zA-Z0-9-]+\.webex\.com\/join\/[a-zA-Z0-9_-]+$/,
        /^https:\/\/webex\.com\/meet\/[a-zA-Z0-9._-]+$/,
      ],
      defaultAudioConfig: {
        sampleRate: 48000,
        channels: 1,
        bitRate: 128000,
        codec: 'opus',
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      defaultVideoConfig: {
        resolution: '720p',
        frameRate: 30,
        bitRate: 2000000,
        codec: 'h264',
      },
      supportedFeatures: {
        supportsScreenShare: true,
        supportsRecording: true,
        supportsTranscription: false,
        supportsBreakoutRooms: true,
        supportsChat: true,
        supportsParticipantList: true,
        maxParticipants: 200,
        requiresPlugin: false,
      },
    });

    // Discord Configuration
    this.platformConfigs.set(Platform.DISCORD, {
      name: 'Discord',
      urlPatterns: [
        /^https:\/\/discord\.gg\/[a-zA-Z0-9]+$/,
        /^https:\/\/discord\.com\/channels\/\d+\/\d+$/,
        /^https:\/\/discordapp\.com\/channels\/\d+\/\d+$/,
      ],
      defaultAudioConfig: {
        sampleRate: 48000,
        channels: 2,
        bitRate: 128000,
        codec: 'opus',
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
      defaultVideoConfig: {
        resolution: '720p',
        frameRate: 30,
        bitRate: 2000000,
        codec: 'h264',
      },
      supportedFeatures: {
        supportsScreenShare: true,
        supportsRecording: false,
        supportsTranscription: false,
        supportsBreakoutRooms: false,
        supportsChat: true,
        supportsParticipantList: true,
        maxParticipants: 50,
        requiresPlugin: false,
      },
    });

    // Skype Configuration
    this.platformConfigs.set(Platform.SKYPE, {
      name: 'Skype',
      urlPatterns: [
        /^https:\/\/join\.skype\.com\/[a-zA-Z0-9_-]+$/,
        /^skype:[a-zA-Z0-9._-]+\?call$/,
      ],
      defaultAudioConfig: {
        sampleRate: 48000,
        channels: 1,
        bitRate: 128000,
        codec: 'opus',
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      defaultVideoConfig: {
        resolution: '720p',
        frameRate: 30,
        bitRate: 1500000,
        codec: 'h264',
      },
      supportedFeatures: {
        supportsScreenShare: true,
        supportsRecording: true,
        supportsTranscription: false,
        supportsBreakoutRooms: false,
        supportsChat: true,
        supportsParticipantList: true,
        maxParticipants: 50,
        requiresPlugin: false,
      },
    });
  }

  /**
   * Detect platform from meeting URL
   */
  detectPlatform(meetingUrl: string): Platform | null {
    try {
      const normalizedUrl = meetingUrl.trim().toLowerCase();

      for (const [platform, config] of this.platformConfigs.entries()) {
        for (const pattern of config.urlPatterns) {
          if (pattern.test(normalizedUrl)) {
            logger.debug('Platform detected', {
              platform,
              url: meetingUrl,
              pattern: pattern.source,
            });
            return platform;
          }
        }
      }

      logger.warn('No platform detected for URL', { meetingUrl });
      return null;
    } catch (error) {
      logger.error('Error detecting platform', {
        meetingUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Parse meeting URL and extract information
   */
  parseMeetingUrl(meetingUrl: string): MeetingUrlInfo | null {
    try {
      const platform = this.detectPlatform(meetingUrl);
      if (!platform) {
        return null;
      }

      const url = new URL(meetingUrl);
      const additionalParams: Record<string, string> = {};

      // Extract query parameters
      for (const [key, value] of url.searchParams.entries()) {
        additionalParams[key] = value;
      }

      let meetingId = '';
      let roomName = '';
      const hostId = '';
      let password = '';

      switch (platform) {
        case Platform.GOOGLE_MEET:
          // Extract meeting code from Google Meet URL
          const meetPath = url.pathname;
          if (meetPath.startsWith('/lookup/')) {
            meetingId = meetPath.substring(8); // Remove '/lookup/'
            roomName = meetingId;
          } else {
            // Standard meet.google.com/xxx-yyyy-zzz format
            meetingId = meetPath.substring(1); // Remove leading '/'
            roomName = meetingId;
          }
          break;

        case Platform.MICROSOFT_TEAMS:
          // Extract meeting ID from Teams URL
          const teamsPath = url.pathname;
          if (teamsPath.includes('/meetup-join/')) {
            meetingId = teamsPath.split('/meetup-join/')[1] || '';
          } else if (teamsPath.includes('/meet/')) {
            meetingId = teamsPath.split('/meet/')[1] || '';
          }
          roomName = meetingId;
          break;

        case Platform.ZOOM:
          // Extract meeting ID from Zoom URL
          const zoomPath = url.pathname;
          const zoomMatch = zoomPath.match(/\/j\/(\d{9,11})/);
          if (zoomMatch) {
            meetingId = zoomMatch[1] || '';
            roomName = meetingId;
          }
          password = additionalParams.pwd || '';
          break;

        case Platform.WEBEX:
          // Extract meeting room from WebEx URL
          const webexPath = url.pathname;
          if (webexPath.includes('/meet/')) {
            roomName = webexPath.split('/meet/')[1] || '';
            meetingId = roomName;
          } else if (webexPath.includes('/join/')) {
            meetingId = webexPath.split('/join/')[1] || '';
            roomName = meetingId;
          }
          break;

        case Platform.DISCORD:
          // Extract server and channel IDs from Discord URL
          const discordPath = url.pathname;
          if (discordPath.includes('/channels/')) {
            const parts = discordPath.split('/');
            if (parts.length >= 4) {
              const serverId = parts[2];
              const channelId = parts[3];
              meetingId = `${serverId}/${channelId}`;
              roomName = channelId || '';
            }
          } else if (url.hostname === 'discord.gg') {
            meetingId = discordPath.substring(1); // Remove leading '/'
            roomName = meetingId;
          }
          break;

        case Platform.SKYPE:
          // Extract conversation ID from Skype URL
          if (url.protocol === 'skype:') {
            meetingId = url.pathname.replace('?call', '');
            roomName = meetingId;
          } else {
            const skypePath = url.pathname;
            meetingId = skypePath.substring(1); // Remove leading '/'
            roomName = meetingId;
          }
          break;
      }

      const meetingInfo: MeetingUrlInfo = {
        platform,
        meetingId,
        meetingUrl,
        roomName: roomName || meetingId,
        hostId: hostId || undefined,
        password: password || undefined,
        additionalParams,
      };

      logger.info('Meeting URL parsed', {
        platform,
        meetingId,
        roomName,
        hasPassword: !!password,
        paramCount: Object.keys(additionalParams).length,
      });

      return meetingInfo;
    } catch (error) {
      logger.error('Error parsing meeting URL', {
        meetingUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Validate meeting URL format
   */
  validateMeetingUrl(meetingUrl: string): { isValid: boolean; platform?: Platform; errors: string[] } {
    const errors: string[] = [];

    try {
      // Basic URL validation
      new URL(meetingUrl);
    } catch {
      errors.push('Invalid URL format');
      return { isValid: false, errors };
    }

    // Platform detection
    const platform = this.detectPlatform(meetingUrl);
    if (!platform) {
      errors.push('Unsupported meeting platform');
      return { isValid: false, errors };
    }

    // Platform-specific validation
    const config = this.platformConfigs.get(platform);
    if (!config) {
      errors.push('Platform configuration not found');
      return { isValid: false, errors };
    }

    // Parse and validate meeting info
    const meetingInfo = this.parseMeetingUrl(meetingUrl);
    if (!meetingInfo) {
      errors.push('Unable to parse meeting information from URL');
      return { isValid: false, errors };
    }

    if (!meetingInfo.meetingId) {
      errors.push('Meeting ID could not be extracted from URL');
    }

    return {
      isValid: errors.length === 0,
      platform,
      errors,
    };
  }

  /**
   * Get platform configuration
   */
  getPlatformConfig(platform: Platform): PlatformConfig | null {
    return this.platformConfigs.get(platform) || null;
  }

  /**
   * Get platform-specific capture configuration
   */
  getPlatformCaptureConfig(platform: Platform, customConfig?: Partial<AudioConfig & VideoConfig>): {
    audioConfig: AudioConfig;
    videoConfig: VideoConfig;
    features: PlatformFeatures;
  } | null {
    const config = this.platformConfigs.get(platform);
    if (!config) {
      return null;
    }

    return {
      audioConfig: {
        ...config.defaultAudioConfig,
        ...(customConfig ? {
          sampleRate: customConfig.sampleRate || config.defaultAudioConfig.sampleRate,
          channels: customConfig.channels || config.defaultAudioConfig.channels,
          bitRate: customConfig.bitRate || config.defaultAudioConfig.bitRate,
          codec: customConfig.codec || config.defaultAudioConfig.codec,
        } : {}),
      },
      videoConfig: {
        ...config.defaultVideoConfig,
        ...(customConfig ? {
          resolution: customConfig.resolution || config.defaultVideoConfig.resolution,
          frameRate: customConfig.frameRate || config.defaultVideoConfig.frameRate,
        } : {}),
      },
      features: config.supportedFeatures,
    };
  }

  /**
   * Extract platform-specific metadata from meeting URL and context
   */
  async extractPlatformMetadata(
    meetingUrl: string,
    accessToken?: string,
    additionalContext?: Record<string, any>
  ): Promise<PlatformMetadata | null> {
    try {
      const meetingInfo = this.parseMeetingUrl(meetingUrl);
      if (!meetingInfo) {
        return null;
      }

      const config = this.platformConfigs.get(meetingInfo.platform);
      if (!config) {
        return null;
      }

      const metadata: PlatformMetadata = {
        platform: meetingInfo.platform,
        meetingId: meetingInfo.meetingId,
        roomName: meetingInfo.roomName,
        meetingSettings: {
          isRecordingEnabled: config.supportedFeatures.supportsRecording,
          isTranscriptionEnabled: config.supportedFeatures.supportsTranscription,
          hasPassword: !!meetingInfo.password,
          isWaitingRoomEnabled: false, // Default, would need API call to determine
        },
      };

      // Add platform-specific metadata extraction
      switch (meetingInfo.platform) {
        case Platform.GOOGLE_MEET:
          metadata.technicalInfo = {
            serverRegion: 'auto',
            connectionType: 'webrtc',
            quality: 'hd',
          };
          break;

        case Platform.MICROSOFT_TEAMS:
          metadata.technicalInfo = {
            serverRegion: 'auto',
            connectionType: 'webrtc',
            quality: 'hd',
          };
          break;

        case Platform.ZOOM:
          metadata.participantInfo = {
            maxParticipants: config.supportedFeatures.maxParticipants,
            currentParticipants: 0,
          };
          break;

        case Platform.WEBEX:
          metadata.technicalInfo = {
            serverRegion: 'auto',
            connectionType: 'webrtc',
            quality: 'hd',
          };
          break;

        case Platform.DISCORD:
          // Discord-specific metadata would go here
          break;

        case Platform.SKYPE:
          // Skype-specific metadata would go here
          break;
      }

      // If access token is provided, make API calls for additional metadata
      if (accessToken && config.apiEndpoints) {
        try {
          const apiMetadata = await this.fetchApiMetadata(meetingInfo, config, accessToken);
          if (apiMetadata) {
            Object.assign(metadata, apiMetadata);
          }
        } catch (error) {
          logger.warn('Failed to fetch API metadata', {
            platform: meetingInfo.platform,
            meetingId: meetingInfo.meetingId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('Platform metadata extracted', {
        platform: meetingInfo.platform,
        meetingId: meetingInfo.meetingId,
        hasApiData: !!accessToken,
      });

      return metadata;
    } catch (error) {
      logger.error('Error extracting platform metadata', {
        meetingUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Fetch additional metadata from platform APIs
   */
  private async fetchApiMetadata(
    meetingInfo: MeetingUrlInfo,
    config: PlatformConfig,
    accessToken: string
  ): Promise<Partial<PlatformMetadata> | null> {
    if (!config.apiEndpoints) {
      return null;
    }

    const metadata: Partial<PlatformMetadata> = {};

    try {
      // Fetch meeting info if endpoint is available
      if (config.apiEndpoints.meetingInfo) {
        const meetingInfoUrl = config.apiEndpoints.meetingInfo.replace(
          '{meetingId}',
          meetingInfo.meetingId
        );

        const response = await fetch(meetingInfoUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const apiData: any = await response.json();

          // Platform-specific API response parsing
          switch (meetingInfo.platform) {
            case Platform.GOOGLE_MEET:
              metadata.hostInfo = {
                id: apiData.creator?.id,
                name: apiData.creator?.displayName,
                email: apiData.creator?.email,
              };
              break;

            case Platform.MICROSOFT_TEAMS:
              metadata.hostInfo = {
                id: apiData.organizer?.identity?.user?.id,
                name: apiData.organizer?.identity?.user?.displayName,
                email: apiData.organizer?.identity?.user?.email,
              };
              break;

            case Platform.ZOOM:
              metadata.hostInfo = {
                id: apiData.host_id,
                name: apiData.host_email,
                email: apiData.host_email,
              };
              metadata.participantInfo = {
                maxParticipants: apiData.settings?.participant_video || 500,
                currentParticipants: apiData.participants || 0,
              };
              break;
          }
        }
      }

      // Fetch participant list if endpoint is available
      if (config.apiEndpoints.participantList) {
        const participantUrl = config.apiEndpoints.participantList
          .replace('{meetingId}', meetingInfo.meetingId)
          .replace('{conferenceId}', meetingInfo.meetingId)
          .replace('{callId}', meetingInfo.meetingId);

        const response = await fetch(participantUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const participantData: any = await response.json();

          if (!metadata.participantInfo) {
            metadata.participantInfo = {
              maxParticipants: config.supportedFeatures.maxParticipants,
              currentParticipants: 0,
            };
          }

          // Update participant count based on API response
          if (participantData.participants) {
            metadata.participantInfo.currentParticipants = participantData.participants.length;
            metadata.participantInfo.participantList = participantData.participants.map(
              (p: any) => p.displayName || p.name || p.email
            );
          }
        }
      }

      return metadata;
    } catch (error) {
      logger.error('Error fetching API metadata', {
        platform: meetingInfo.platform,
        meetingId: meetingInfo.meetingId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get supported platforms
   */
  getSupportedPlatforms(): Platform[] {
    return Array.from(this.platformConfigs.keys());
  }

  /**
   * Check if platform supports specific feature
   */
  platformSupportsFeature(platform: Platform, feature: keyof PlatformFeatures): any {
    const config = this.platformConfigs.get(platform);
    return config ? config.supportedFeatures[feature] : false;
  }

  /**
   * Get platform display name
   */
  getPlatformDisplayName(platform: Platform): string {
    const config = this.platformConfigs.get(platform);
    return config ? config.name : platform.toString();
  }

  /**
   * Generate platform-specific capture instructions
   */
  generateCaptureInstructions(platform: Platform): {
    setup: string[];
    permissions: string[];
    troubleshooting: string[];
  } {
    const config = this.platformConfigs.get(platform);
    if (!config) {
      return {
        setup: ['Platform not supported'],
        permissions: [],
        troubleshooting: [],
      };
    }

    const instructions = {
      setup: [
        `Join your ${config.name} meeting`,
        'Ensure your microphone and camera are working',
        'Start the MeetBuddy capture when ready',
      ],
      permissions: [
        'Allow microphone access for audio capture',
        'Allow screen sharing for meeting content capture',
      ],
      troubleshooting: [
        'Check that your browser supports WebRTC',
        'Ensure microphone permissions are granted',
        'Try refreshing the page if capture fails to start',
      ],
    };

    // Add platform-specific instructions
    switch (platform) {
      case Platform.GOOGLE_MEET:
        instructions.setup.push('Make sure you are the meeting host or have recording permissions');
        instructions.troubleshooting.push('Check Google Meet recording settings in your admin console');
        break;

      case Platform.MICROSOFT_TEAMS:
        instructions.setup.push('Ensure Teams recording is enabled for your organization');
        instructions.troubleshooting.push('Verify Teams app permissions in your browser');
        break;

      case Platform.ZOOM:
        instructions.setup.push('Enable "Allow participants to record locally" in meeting settings');
        instructions.permissions.push('Grant local recording permission if prompted');
        break;

      case Platform.WEBEX:
        instructions.setup.push('Check that WebEx recording is available for your account');
        break;

      case Platform.DISCORD:
        instructions.setup.push('Make sure you have appropriate permissions in the Discord server');
        instructions.troubleshooting.push('Discord may require additional bot permissions for recording');
        break;

      case Platform.SKYPE:
        instructions.setup.push('Skype recording may require all participants to be notified');
        break;
    }

    return instructions;
  }
}