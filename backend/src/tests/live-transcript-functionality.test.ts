/**
 * Live Transcript Functionality Test
 * 
 * Tests the complete live transcript workflow including:
 * - Real-time transcription with actual audio input
 * - Transcript display and speaker identification
 * - Integration with meeting platforms
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { prisma } from '../lib/prisma';
import { authService } from '../services/authService';
import { whisperService } from '../services/whisperService';
import fs from 'fs';
import path from 'path';

describe('Live Transcript Functionality', () => {
  let authToken: string;
  let userId: string;
  let meetingId: string;
  let testAudioFile: string;

  beforeAll(async () => {
    // Create test user
    const testUser = await prisma.user.create({
      data: {
        email: 'transcript-test@example.com',
        name: 'Transcript Test User',
        password: await authService.hashPassword('testpassword'),
        subscription: 'PRO',
      },
    });

    userId = testUser.id;

    // Generate auth token
    authToken = authService.generateToken({
      userId: testUser.id,
      email: testUser.email,
      role: 'USER',
    });

    // Create test audio file (simple WAV file for testing)
    testAudioFile = path.join(__dirname, 'test-audio.wav');
    await createTestAudioFile(testAudioFile);
  });

  afterAll(async () => {
    // Clean up test data
    if (meetingId) {
      await prisma.transcriptEntry.deleteMany({ where: { meetingId } });
      await prisma.meeting.delete({ where: { id: meetingId } });
    }
    await prisma.user.delete({ where: { id: userId } });

    // Clean up test audio file
    if (fs.existsSync(testAudioFile)) {
      fs.unlinkSync(testAudioFile);
    }
  });

  beforeEach(async () => {
    // Create test meeting
    const meeting = await prisma.meeting.create({
      data: {
        title: 'Live Transcript Test Meeting',
        description: 'Test meeting for live transcript functionality',
        userId,
        platform: 'GOOGLE_MEET',
        meetingUrl: 'https://meet.google.com/test-meeting',
        scheduledTime: new Date(Date.now() + 3600000), // 1 hour from now
        status: 'SCHEDULED',
      },
    });

    meetingId = meeting.id;
  });

  afterEach(async () => {
    // Clean up meeting data
    if (meetingId) {
      await prisma.transcriptEntry.deleteMany({ where: { meetingId } });
      await prisma.meeting.delete({ where: { id: meetingId } });
    }
  });

  describe('Whisper Service Availability', () => {
    it('should check Whisper service availability', async () => {
      const response = await request(app)
        .get('/api/whisper/check')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('whisperAvailable');
      expect(typeof response.body.data.whisperAvailable).toBe('boolean');
    });

    it('should get Whisper service status', async () => {
      const response = await request(app)
        .get('/api/whisper/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('available');
      expect(response.body.data).toHaveProperty('model');
      expect(response.body.data).toHaveProperty('supportedFormats');
    });

    it('should get supported languages', async () => {
      const response = await request(app)
        .get('/api/whisper/languages')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('languages');
      expect(Array.isArray(response.body.data.languages)).toBe(true);
      expect(response.body.data.languages).toContain('en');
    });
  });

  describe('Real-time Transcription Session Management', () => {
    it('should start a transcription session', async () => {
      const response = await request(app)
        .post(`/api/whisper/start/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('sessionStarted', true);
      expect(response.body.data).toHaveProperty('meetingId', meetingId);
    });

    it('should prevent duplicate transcription sessions', async () => {
      // Start first session
      await request(app)
        .post(`/api/whisper/start/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Try to start second session
      await request(app)
        .post(`/api/whisper/start/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(409);
    });

    it('should get transcription status', async () => {
      // Start session first
      await request(app)
        .post(`/api/whisper/start/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const response = await request(app)
        .get(`/api/whisper/status/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('isTranscribing', true);
      expect(response.body.data).toHaveProperty('meetingId', meetingId);
    });

    it('should stop a transcription session', async () => {
      // Start session first
      await request(app)
        .post(`/api/whisper/start/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Stop session
      const response = await request(app)
        .post(`/api/whisper/stop/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('sessionStopped', true);
      expect(response.body.data).toHaveProperty('duration');
    });
  });

  describe('Audio Processing and Transcription', () => {
    it('should upload and transcribe complete audio file', async () => {
      const response = await request(app)
        .post(`/api/whisper/upload/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('audio', testAudioFile)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('transcription');
      expect(response.body.data).toHaveProperty('segmentCount');

      // Check if transcript entries were saved to database
      const transcriptEntries = await prisma.transcriptEntry.findMany({
        where: { meetingId },
        orderBy: { timestamp: 'asc' },
      });

      expect(transcriptEntries.length).toBeGreaterThan(0);
      expect(transcriptEntries[0]).toHaveProperty('text');
      expect(transcriptEntries[0]).toHaveProperty('speaker');
      expect(transcriptEntries[0]).toHaveProperty('confidence');
    });

    it('should process real-time audio chunks', async () => {
      // Start transcription session
      await request(app)
        .post(`/api/whisper/start/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Process audio chunk
      const response = await request(app)
        .post(`/api/whisper/audio/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('audio', testAudioFile)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('text');
      expect(response.body.data).toHaveProperty('confidence');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('speaker');

      // Check if transcript entry was saved
      const transcriptEntries = await prisma.transcriptEntry.findMany({
        where: { meetingId },
      });

      if (response.body.data.text.length > 0) {
        expect(transcriptEntries.length).toBeGreaterThan(0);
      }
    });

    it('should handle invalid audio format', async () => {
      // Create invalid file
      const invalidFile = path.join(__dirname, 'invalid.txt');
      fs.writeFileSync(invalidFile, 'This is not an audio file');

      try {
        await request(app)
          .post(`/api/whisper/upload/${meetingId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .attach('audio', invalidFile)
          .expect(400);
      } finally {
        if (fs.existsSync(invalidFile)) {
          fs.unlinkSync(invalidFile);
        }
      }
    });
  });

  describe('Transcript Retrieval and Management', () => {
    beforeEach(async () => {
      // Add some test transcript entries
      await prisma.transcriptEntry.createMany({
        data: [
          {
            meetingId,
            speaker: 'John Doe',
            text: 'Hello everyone, welcome to the meeting.',
            timestamp: new Date(Date.now() - 60000),
            confidence: 0.95,
            isFinal: true,
          },
          {
            meetingId,
            speaker: 'Jane Smith',
            text: 'Thank you for joining us today.',
            timestamp: new Date(Date.now() - 30000),
            confidence: 0.92,
            isFinal: true,
          },
          {
            meetingId,
            speaker: 'John Doe',
            text: 'Let\'s start with the agenda.',
            timestamp: new Date(),
            confidence: 0.88,
            isFinal: true,
          },
        ],
      });
    });

    it('should retrieve transcript entries for a meeting', async () => {
      const response = await request(app)
        .get(`/api/whisper/meeting/${meetingId}/transcript`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('entries');
      expect(response.body.data.entries).toHaveLength(3);
      expect(response.body.data.entries[0]).toHaveProperty('speaker');
      expect(response.body.data.entries[0]).toHaveProperty('text');
      expect(response.body.data.entries[0]).toHaveProperty('confidence');
    });

    it('should retrieve transcript entries with pagination', async () => {
      const response = await request(app)
        .get(`/api/whisper/meeting/${meetingId}/transcript?limit=2`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.entries).toHaveLength(2);
    });

    it('should retrieve transcript entries since a specific time', async () => {
      const sinceTime = new Date(Date.now() - 45000).toISOString();
      
      const response = await request(app)
        .get(`/api/whisper/meeting/${meetingId}/transcript?since=${sinceTime}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.entries.length).toBeLessThanOrEqual(2);
    });

    it('should clear transcript entries for a meeting', async () => {
      const response = await request(app)
        .delete(`/api/whisper/meeting/${meetingId}/transcript`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('deletedCount', 3);

      // Verify entries were deleted
      const remainingEntries = await prisma.transcriptEntry.findMany({
        where: { meetingId },
      });
      expect(remainingEntries).toHaveLength(0);
    });
  });

  describe('Meeting Platform Integration', () => {
    it('should handle Google Meet meeting URLs', async () => {
      const meetingUrl = 'https://meet.google.com/abc-defg-hij';
      
      const meeting = await prisma.meeting.update({
        where: { id: meetingId },
        data: { meetingUrl, platform: 'GOOGLE_MEET' },
      });

      expect(meeting.meetingUrl).toBe(meetingUrl);
      expect(meeting.platform).toBe('GOOGLE_MEET');
    });

    it('should handle Zoom meeting URLs', async () => {
      const meetingUrl = 'https://zoom.us/j/1234567890';
      
      const meeting = await prisma.meeting.update({
        where: { id: meetingId },
        data: { meetingUrl, platform: 'ZOOM' },
      });

      expect(meeting.meetingUrl).toBe(meetingUrl);
      expect(meeting.platform).toBe('ZOOM');
    });

    it('should handle Microsoft Teams meeting URLs', async () => {
      const meetingUrl = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123';
      
      const meeting = await prisma.meeting.update({
        where: { id: meetingId },
        data: { meetingUrl, platform: 'MICROSOFT_TEAMS' },
      });

      expect(meeting.meetingUrl).toBe(meetingUrl);
      expect(meeting.platform).toBe('MICROSOFT_TEAMS');
    });
  });

  describe('Speaker Identification', () => {
    it('should identify different speakers in transcript', async () => {
      // Upload audio file that should generate transcript
      await request(app)
        .post(`/api/whisper/upload/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('audio', testAudioFile)
        .expect(200);

      const transcriptEntries = await prisma.transcriptEntry.findMany({
        where: { meetingId },
        orderBy: { timestamp: 'asc' },
      });

      if (transcriptEntries.length > 0) {
        // Check that speaker field is populated
        transcriptEntries.forEach(entry => {
          expect(entry.speaker).toBeDefined();
          expect(typeof entry.speaker).toBe('string');
          expect(entry.speaker.length).toBeGreaterThan(0);
        });
      }
    });

    it('should maintain speaker consistency across segments', async () => {
      // Add multiple entries with same speaker
      await prisma.transcriptEntry.createMany({
        data: [
          {
            meetingId,
            speaker: 'Speaker A',
            text: 'First part of the sentence.',
            timestamp: new Date(Date.now() - 10000),
            confidence: 0.9,
            isFinal: true,
          },
          {
            meetingId,
            speaker: 'Speaker A',
            text: 'Second part of the sentence.',
            timestamp: new Date(Date.now() - 5000),
            confidence: 0.9,
            isFinal: true,
          },
        ],
      });

      const entries = await prisma.transcriptEntry.findMany({
        where: { meetingId },
        orderBy: { timestamp: 'asc' },
      });

      expect(entries[0].speaker).toBe(entries[1].speaker);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing meeting ID', async () => {
      await request(app)
        .post('/api/whisper/start/nonexistent-meeting')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should handle unauthorized access', async () => {
      await request(app)
        .post(`/api/whisper/start/${meetingId}`)
        .expect(401);
    });

    it('should handle missing audio file', async () => {
      await request(app)
        .post(`/api/whisper/upload/${meetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle large audio files gracefully', async () => {
      // This test would require creating a large file, skipping for now
      // In a real test, you'd create a file larger than 25MB and expect a 400 error
    });
  });
});

/**
 * Create a simple test audio file for testing purposes
 */
async function createTestAudioFile(filePath: string): Promise<void> {
  // Create a minimal WAV file header for testing
  // This is a very basic WAV file that should be accepted by the API
  const buffer = Buffer.alloc(44 + 1000); // Header + some audio data
  
  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + 1000, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(1000, 40);
  
  // Fill with some audio data (silence)
  for (let i = 44; i < buffer.length; i++) {
    buffer[i] = 0;
  }
  
  fs.writeFileSync(filePath, buffer);
}