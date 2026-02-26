import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformCaptureService } from '../services/platformCaptureService';
import { Platform } from '../lib/types';

describe('Platform Capture Service Tests', () => {
  let platformCaptureService: PlatformCaptureService;

  beforeEach(() => {
    platformCaptureService = new PlatformCaptureService();
  });

  describe('Platform Detection', () => {
    it('should detect Google Meet URLs correctly', () => {
      const googleMeetUrls = [
        'https://meet.google.com/abc-defg-hij',
        'https://meet.google.com/lookup/meeting123',
      ];

      for (const url of googleMeetUrls) {
        const platform = platformCaptureService.detectPlatform(url);
        expect(platform).toBe(Platform.GOOGLE_MEET);
      }
    });

    it('should detect Microsoft Teams URLs correctly', () => {
      const teamsUrls = [
        'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123',
        'https://teams.live.com/meet/meeting123',
      ];

      for (const url of teamsUrls) {
        const platform = platformCaptureService.detectPlatform(url);
        expect(platform).toBe(Platform.MICROSOFT_TEAMS);
      }
    });

    it('should detect Zoom URLs correctly', () => {
      const zoomUrls = [
        'https://zoom.us/j/1234567890',
        'https://company.zoom.us/j/1234567890?pwd=abc123',
        'https://us02web.zoom.us/j/1234567890',
      ];

      for (const url of zoomUrls) {
        const platform = platformCaptureService.detectPlatform(url);
        expect(platform).toBe(Platform.ZOOM);
      }
    });

    it('should detect WebEx URLs correctly', () => {
      const webexUrls = [
        'https://company.webex.com/meet/john.doe',
        'https://company.webex.com/join/meeting123',
      ];

      for (const url of webexUrls) {
        const platform = platformCaptureService.detectPlatform(url);
        expect(platform).toBe(Platform.WEBEX);
      }
    });

    it('should detect Discord URLs correctly', () => {
      const discordUrls = [
        'https://discord.gg/abc123',
        'https://discord.com/channels/123456789/987654321',
      ];

      for (const url of discordUrls) {
        const platform = platformCaptureService.detectPlatform(url);
        expect(platform).toBe(Platform.DISCORD);
      }
    });

    it('should detect Skype URLs correctly', () => {
      const skypeUrls = [
        'https://join.skype.com/abc123def456',
      ];

      for (const url of skypeUrls) {
        const platform = platformCaptureService.detectPlatform(url);
        expect(platform).toBe(Platform.SKYPE);
      }
    });

    it('should return null for unsupported URLs', () => {
      const unsupportedUrls = [
        'https://example.com/meeting',
        'https://invalid-platform.com/join/123',
        'not-a-url',
      ];

      for (const url of unsupportedUrls) {
        const platform = platformCaptureService.detectPlatform(url);
        expect(platform).toBeNull();
      }
    });
  });

  describe('URL Parsing', () => {
    it('should parse Google Meet URLs correctly', () => {
      const url = 'https://meet.google.com/abc-defg-hij';
      const meetingInfo = platformCaptureService.parseMeetingUrl(url);

      expect(meetingInfo).toBeDefined();
      expect(meetingInfo!.platform).toBe(Platform.GOOGLE_MEET);
      expect(meetingInfo!.meetingId).toBe('abc-defg-hij');
      expect(meetingInfo!.roomName).toBe('abc-defg-hij');
      expect(meetingInfo!.meetingUrl).toBe(url);
    });

    it('should parse Zoom URLs with password correctly', () => {
      const url = 'https://zoom.us/j/1234567890?pwd=abc123';
      const meetingInfo = platformCaptureService.parseMeetingUrl(url);

      expect(meetingInfo).toBeDefined();
      expect(meetingInfo!.platform).toBe(Platform.ZOOM);
      expect(meetingInfo!.meetingId).toBe('1234567890');
      expect(meetingInfo!.password).toBe('abc123');
      expect(meetingInfo!.additionalParams.pwd).toBe('abc123');
    });

    it('should parse Discord channel URLs correctly', () => {
      const url = 'https://discord.com/channels/123456789/987654321';
      const meetingInfo = platformCaptureService.parseMeetingUrl(url);

      expect(meetingInfo).toBeDefined();
      expect(meetingInfo!.platform).toBe(Platform.DISCORD);
      expect(meetingInfo!.meetingId).toBe('123456789/987654321');
      expect(meetingInfo!.roomName).toBe('987654321');
    });

    it('should return null for invalid URLs', () => {
      const invalidUrls = [
        'https://example.com/meeting',
        'not-a-url',
        '',
      ];

      for (const url of invalidUrls) {
        const meetingInfo = platformCaptureService.parseMeetingUrl(url);
        expect(meetingInfo).toBeNull();
      }
    });
  });

  describe('URL Validation', () => {
    it('should validate correct meeting URLs', () => {
      const validUrls = [
        'https://meet.google.com/abc-defg-hij',
        'https://zoom.us/j/1234567890',
        'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123',
      ];

      for (const url of validUrls) {
        const validation = platformCaptureService.validateMeetingUrl(url);
        expect(validation.isValid).toBe(true);
        expect(validation.platform).toBeDefined();
        expect(validation.errors).toHaveLength(0);
      }
    });

    it('should reject invalid meeting URLs', () => {
      const invalidUrls = [
        'https://example.com/meeting',
        'not-a-url',
        '',
        'https://meet.google.com/', // Missing meeting ID
      ];

      for (const url of invalidUrls) {
        const validation = platformCaptureService.validateMeetingUrl(url);
        expect(validation.isValid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Platform Configuration', () => {
    it('should return configuration for supported platforms', () => {
      const supportedPlatforms = platformCaptureService.getSupportedPlatforms();
      
      expect(supportedPlatforms).toContain(Platform.GOOGLE_MEET);
      expect(supportedPlatforms).toContain(Platform.ZOOM);
      expect(supportedPlatforms).toContain(Platform.MICROSOFT_TEAMS);

      for (const platform of supportedPlatforms) {
        const config = platformCaptureService.getPlatformConfig(platform);
        expect(config).toBeDefined();
        expect(config!.name).toBeTruthy();
        expect(config!.urlPatterns.length).toBeGreaterThan(0);
        expect(config!.defaultAudioConfig).toBeDefined();
        expect(config!.defaultVideoConfig).toBeDefined();
        expect(config!.supportedFeatures).toBeDefined();
      }
    });

    it('should return capture configuration for platforms', () => {
      const platforms = [Platform.GOOGLE_MEET, Platform.ZOOM, Platform.MICROSOFT_TEAMS];

      for (const platform of platforms) {
        const captureConfig = platformCaptureService.getPlatformCaptureConfig(platform);
        expect(captureConfig).toBeDefined();
        expect(captureConfig!.audioConfig).toBeDefined();
        expect(captureConfig!.videoConfig).toBeDefined();
        expect(captureConfig!.features).toBeDefined();
      }
    });

    it('should allow custom configuration overrides', () => {
      const customConfig = {
        sampleRate: 44100,
        channels: 2,
        resolution: '1080p',
      };

      const captureConfig = platformCaptureService.getPlatformCaptureConfig(
        Platform.GOOGLE_MEET,
        customConfig
      );

      expect(captureConfig).toBeDefined();
      expect(captureConfig!.audioConfig.sampleRate).toBe(44100);
      expect(captureConfig!.audioConfig.channels).toBe(2);
      expect(captureConfig!.videoConfig.resolution).toBe('1080p');
    });
  });

  describe('Feature Support', () => {
    it('should correctly report feature support for platforms', () => {
      // Google Meet supports recording
      expect(
        platformCaptureService.platformSupportsFeature(Platform.GOOGLE_MEET, 'supportsRecording')
      ).toBe(true);

      // Discord does not support recording
      expect(
        platformCaptureService.platformSupportsFeature(Platform.DISCORD, 'supportsRecording')
      ).toBe(false);

      // All platforms should support screen sharing
      const platforms = platformCaptureService.getSupportedPlatforms();
      for (const platform of platforms) {
        expect(
          platformCaptureService.platformSupportsFeature(platform, 'supportsScreenShare')
        ).toBe(true);
      }
    });
  });

  describe('Platform Display Names', () => {
    it('should return correct display names for platforms', () => {
      expect(platformCaptureService.getPlatformDisplayName(Platform.GOOGLE_MEET)).toBe('Google Meet');
      expect(platformCaptureService.getPlatformDisplayName(Platform.ZOOM)).toBe('Zoom');
      expect(platformCaptureService.getPlatformDisplayName(Platform.MICROSOFT_TEAMS)).toBe('Microsoft Teams');
      expect(platformCaptureService.getPlatformDisplayName(Platform.WEBEX)).toBe('Cisco WebEx');
      expect(platformCaptureService.getPlatformDisplayName(Platform.DISCORD)).toBe('Discord');
      expect(platformCaptureService.getPlatformDisplayName(Platform.SKYPE)).toBe('Skype');
    });
  });

  describe('Capture Instructions', () => {
    it('should generate instructions for all supported platforms', () => {
      const platforms = platformCaptureService.getSupportedPlatforms();

      for (const platform of platforms) {
        const instructions = platformCaptureService.generateCaptureInstructions(platform);
        
        expect(instructions).toBeDefined();
        expect(instructions.setup).toBeDefined();
        expect(instructions.permissions).toBeDefined();
        expect(instructions.troubleshooting).toBeDefined();
        
        expect(instructions.setup.length).toBeGreaterThan(0);
        expect(instructions.permissions.length).toBeGreaterThan(0);
        expect(instructions.troubleshooting.length).toBeGreaterThan(0);
      }
    });

    it('should include platform-specific instructions', () => {
      const zoomInstructions = platformCaptureService.generateCaptureInstructions(Platform.ZOOM);
      // Check that Zoom has platform-specific setup instructions
      expect(zoomInstructions.setup.length).toBeGreaterThan(3); // Should have base + platform-specific
      
      const teamsInstructions = platformCaptureService.generateCaptureInstructions(Platform.MICROSOFT_TEAMS);
      // Check that Teams has platform-specific setup instructions  
      expect(teamsInstructions.setup.length).toBeGreaterThan(3); // Should have base + platform-specific
      
      // Verify instructions are different between platforms
      expect(zoomInstructions.setup).not.toEqual(teamsInstructions.setup);
    });
  });
});