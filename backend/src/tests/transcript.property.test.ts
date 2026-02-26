import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fc from 'fast-check';
import { prisma } from '../lib/prisma';
import { MeetingService } from '../services/meetingService';
import { TranscriptService } from '../services/transcriptService';
import { Platform } from '../lib/types';
import bcrypt from 'bcryptjs';

describe('Transcript Service Property Tests', () => {
  let meetingService: MeetingService;
  let transcriptService: TranscriptService;
  let testUserId: string;
  let testMeetingId: string;

  beforeAll(async () => {
    meetingService = new MeetingService();
    transcriptService = new TranscriptService();
    
    // Create a test user
    const hashedPassword = await bcrypt.hash('testpassword123!', 12);
    const testUser = await prisma.user.create({
      data: {
        email: 'transcript-test@example.com',
        password: hashedPassword,
        name: 'Transcript Test User',
        subscription: 'PRO',
      },
    });
    testUserId = testUser.id;

    // Create a test meeting
    const testMeeting = await meetingService.createMeeting(testUserId, {
      title: 'Test Meeting for Transcripts',
      platform: Platform.GOOGLE_MEET,
      scheduledTime: new Date(Date.now() + 60000),
    });
    testMeetingId = testMeeting.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.transcriptEntry.deleteMany({
      where: { meeting: { userId: testUserId } },
    });
    await prisma.summary.deleteMany({
      where: { meeting: { userId: testUserId } },
    });
    await prisma.meeting.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.user.delete({
      where: { id: testUserId },
    });
  });

  beforeEach(async () => {
    // Clean up transcripts before each test
    await prisma.transcriptEntry.deleteMany({
      where: { meetingId: testMeetingId },
    });
  });

  /**
   * Property 14: Capture completion persists all data
   * Validates: Requirements 3.4
   */
  it('Property 14: Capture completion persists all data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            speaker: fc.string({ minLength: 1, maxLength: 50 }),
            text: fc.string({ minLength: 1, maxLength: 500 }),
            confidence: fc.float({ min: 0, max: 1 }),
            isFinal: fc.boolean(),
            timestamp: fc.date({ 
              min: new Date(Date.now() - 3600000), // 1 hour ago
              max: new Date() 
            }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (transcriptEntries) => {
          // Create transcript entries
          const createdEntries = [];
          for (const entry of transcriptEntries) {
            const created = await transcriptService.createTranscriptEntry(testUserId, {
              meetingId: testMeetingId,
              ...entry,
            });
            createdEntries.push(created);
          }

          // Retrieve all transcripts
          const retrieved = await transcriptService.getTranscriptsForMeeting(
            testMeetingId,
            testUserId,
            {},
            { limit: 1000 }
          );

          // Verify all data is persisted
          expect(retrieved.transcripts.length).toBe(transcriptEntries.length);

          for (let i = 0; i < transcriptEntries.length; i++) {
            const original = transcriptEntries[i];
            const persisted = retrieved.transcripts.find(t => 
              t.speaker === original.speaker && 
              t.text === original.text
            );

            expect(persisted).toBeDefined();
            expect(persisted!.speaker).toBe(original.speaker);
            expect(persisted!.text).toBe(original.text);
            expect(persisted!.confidence.toNumber()).toBeCloseTo(original.confidence, 2);
            expect(persisted!.isFinal).toBe(original.isFinal);
            expect(persisted!.timestamp).toEqual(original.timestamp);
            expect(persisted!.meetingId).toBe(testMeetingId);
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Transcript CRUD operations maintain data integrity
   */
  it('Property: Transcript CRUD operations maintain data integrity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          speaker: fc.string({ minLength: 1, maxLength: 50 }),
          text: fc.string({ minLength: 1, maxLength: 500 }),
          confidence: fc.float({ min: 0, max: 1 }),
          isFinal: fc.boolean(),
          timestamp: fc.date({ 
            min: new Date(Date.now() - 3600000),
            max: new Date() 
          }),
        }),
        async (transcriptData) => {
          // Create transcript
          const created = await transcriptService.createTranscriptEntry(testUserId, {
            meetingId: testMeetingId,
            ...transcriptData,
          });

          // Verify creation
          expect(created.speaker).toBe(transcriptData.speaker);
          expect(created.text).toBe(transcriptData.text);
          expect(created.confidence.toNumber()).toBeCloseTo(transcriptData.confidence, 2);
          expect(created.isFinal).toBe(transcriptData.isFinal);
          expect(created.timestamp).toEqual(transcriptData.timestamp);
          expect(created.meetingId).toBe(testMeetingId);

          // Update transcript
          const updateData = {
            speaker: `Updated ${transcriptData.speaker}`,
            text: `Updated ${transcriptData.text}`,
            confidence: Math.min(transcriptData.confidence + 0.1, 1),
            isFinal: !transcriptData.isFinal,
          };

          const updated = await transcriptService.updateTranscriptEntry(
            created.id,
            testUserId,
            updateData
          );

          expect(updated.speaker).toBe(updateData.speaker);
          expect(updated.text).toBe(updateData.text);
          expect(updated.confidence.toNumber()).toBeCloseTo(updateData.confidence, 2);
          expect(updated.isFinal).toBe(updateData.isFinal);
          expect(updated.timestamp).toEqual(transcriptData.timestamp); // Unchanged

          // Delete transcript
          const deleteResult = await transcriptService.deleteTranscriptEntry(
            created.id,
            testUserId
          );
          expect(deleteResult.success).toBe(true);

          // Verify deletion
          const afterDelete = await transcriptService.getTranscriptsForMeeting(
            testMeetingId,
            testUserId
          );
          expect(afterDelete.transcripts.find(t => t.id === created.id)).toBeUndefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Transcript filtering returns correct subsets
   */
  it('Property: Transcript filtering returns correct subsets', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          transcripts: fc.array(
            fc.record({
              speaker: fc.constantFrom('Alice', 'Bob', 'Charlie', 'Diana'),
              text: fc.string({ minLength: 10, maxLength: 100 }),
              confidence: fc.float({ min: 0.5, max: 1 }),
              isFinal: fc.boolean(),
              timestamp: fc.date({ 
                min: new Date(Date.now() - 3600000),
                max: new Date() 
              }),
            }),
            { minLength: 5, maxLength: 15 }
          ),
        }),
        async ({ transcripts }) => {
          // Create transcripts
          const createdTranscripts = [];
          for (const transcript of transcripts) {
            const created = await transcriptService.createTranscriptEntry(testUserId, {
              meetingId: testMeetingId,
              ...transcript,
            });
            createdTranscripts.push(created);
          }

          // Test speaker filtering
          const speakers = [...new Set(transcripts.map(t => t.speaker))];
          for (const speaker of speakers) {
            const filtered = await transcriptService.getTranscriptsForMeeting(
              testMeetingId,
              testUserId,
              { speaker },
              { limit: 1000 }
            );

            expect(filtered.transcripts.length).toBeGreaterThan(0);
            for (const transcript of filtered.transcripts) {
              expect(transcript.speaker.toLowerCase()).toContain(speaker.toLowerCase());
            }
          }

          // Test confidence filtering
          const minConfidence = 0.8;
          const confidenceFiltered = await transcriptService.getTranscriptsForMeeting(
            testMeetingId,
            testUserId,
            { minConfidence },
            { limit: 1000 }
          );

          for (const transcript of confidenceFiltered.transcripts) {
            expect(transcript.confidence.toNumber()).toBeGreaterThanOrEqual(minConfidence);
          }

          // Test final status filtering
          const finalFiltered = await transcriptService.getTranscriptsForMeeting(
            testMeetingId,
            testUserId,
            { isFinal: true },
            { limit: 1000 }
          );

          for (const transcript of finalFiltered.transcripts) {
            expect(transcript.isFinal).toBe(true);
          }

          const nonFinalFiltered = await transcriptService.getTranscriptsForMeeting(
            testMeetingId,
            testUserId,
            { isFinal: false },
            { limit: 1000 }
          );

          for (const transcript of nonFinalFiltered.transcripts) {
            expect(transcript.isFinal).toBe(false);
          }

          // Total should equal sum of final and non-final
          const totalTranscripts = await transcriptService.getTranscriptsForMeeting(
            testMeetingId,
            testUserId,
            {},
            { limit: 1000 }
          );

          expect(totalTranscripts.transcripts.length).toBe(
            finalFiltered.transcripts.length + nonFinalFiltered.transcripts.length
          );
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Transcript search finds relevant entries
   */
  it('Property: Transcript search finds relevant entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          searchTerms: fc.array(fc.string({ minLength: 3, maxLength: 10 }), { minLength: 1, maxLength: 3 }),
          transcripts: fc.array(
            fc.record({
              speaker: fc.constantFrom('Alice', 'Bob', 'Charlie'),
              baseText: fc.string({ minLength: 10, maxLength: 50 }),
              confidence: fc.float({ min: 0.7, max: 1 }),
              timestamp: fc.date({ 
                min: new Date(Date.now() - 3600000),
                max: new Date() 
              }),
            }),
            { minLength: 3, maxLength: 10 }
          ),
        }),
        async ({ searchTerms, transcripts }) => {
          // Create transcripts with embedded search terms
          const createdTranscripts = [];
          for (let i = 0; i < transcripts.length; i++) {
            const transcript = transcripts[i];
            const searchTerm = searchTerms[i % searchTerms.length];
            
            const created = await transcriptService.createTranscriptEntry(testUserId, {
              meetingId: testMeetingId,
              speaker: transcript.speaker,
              text: `${transcript.baseText} ${searchTerm}`,
              confidence: transcript.confidence,
              isFinal: true,
              timestamp: transcript.timestamp,
            });
            createdTranscripts.push(created);
          }

          // Test search functionality
          for (const searchTerm of searchTerms) {
            const searchResults = await transcriptService.searchTranscripts(
              testUserId,
              searchTerm
            );

            // Should find transcripts containing the search term
            expect(searchResults.transcripts.length).toBeGreaterThan(0);

            // All results should contain the search term in text or speaker
            for (const result of searchResults.transcripts) {
              const textMatch = result.text.toLowerCase().includes(searchTerm.toLowerCase());
              const speakerMatch = result.speaker.toLowerCase().includes(searchTerm.toLowerCase());
              expect(textMatch || speakerMatch).toBe(true);
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Transcript statistics are accurate
   */
  it('Property: Transcript statistics are accurate', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          speakers: fc.array(fc.constantFrom('Alice', 'Bob', 'Charlie'), { minLength: 2, maxLength: 3 }),
          entriesPerSpeaker: fc.integer({ min: 2, max: 5 }),
        }),
        async ({ speakers, entriesPerSpeaker }) => {
          // Create transcripts for each speaker
          const allTranscripts = [];
          for (const speaker of speakers) {
            for (let i = 0; i < entriesPerSpeaker; i++) {
              const transcript = await transcriptService.createTranscriptEntry(testUserId, {
                meetingId: testMeetingId,
                speaker,
                text: `This is entry ${i} from ${speaker}`,
                confidence: 0.8 + (i * 0.05), // Varying confidence
                isFinal: i % 2 === 0, // Alternate final status
                timestamp: new Date(Date.now() - (i * 60000)), // 1 minute apart
              });
              allTranscripts.push(transcript);
            }
          }

          // Get statistics
          const stats = await transcriptService.getTranscriptStats(testMeetingId, testUserId);

          // Verify statistics
          expect(stats.totalEntries).toBe(speakers.length * entriesPerSpeaker);
          expect(stats.uniqueSpeakers).toBe(speakers.length);
          
          // Count final entries
          const expectedFinalEntries = speakers.length * Math.ceil(entriesPerSpeaker / 2);
          expect(stats.finalEntries).toBe(expectedFinalEntries);

          // Verify speaker stats
          expect(stats.speakerStats.length).toBe(speakers.length);
          for (const speakerStat of stats.speakerStats) {
            expect(speakers).toContain(speakerStat.speaker);
            expect(speakerStat.entryCount).toBe(entriesPerSpeaker);
            expect(speakerStat.avgConfidence).toBeGreaterThan(0.8);
          }

          // Verify average confidence
          expect(stats.avgConfidence).toBeGreaterThan(0.8);
          expect(stats.avgConfidence).toBeLessThan(1);

          // Verify word count
          expect(stats.totalWords).toBeGreaterThan(0);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Transcript export formats are consistent
   */
  it('Property: Transcript export formats are consistent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            speaker: fc.constantFrom('Alice', 'Bob'),
            text: fc.string({ minLength: 10, maxLength: 100 }),
            timestamp: fc.date({ 
              min: new Date(Date.now() - 3600000),
              max: new Date() 
            }),
          }),
          { minLength: 3, maxLength: 8 }
        ),
        async (transcriptData) => {
          // Create final transcripts
          const createdTranscripts = [];
          for (const data of transcriptData) {
            const transcript = await transcriptService.createTranscriptEntry(testUserId, {
              meetingId: testMeetingId,
              speaker: data.speaker,
              text: data.text,
              confidence: 0.9,
              isFinal: true,
              timestamp: data.timestamp,
            });
            createdTranscripts.push(transcript);
          }

          // Test different export formats
          const formats = ['json', 'txt', 'srt', 'vtt'] as const;
          
          for (const format of formats) {
            const exported = await transcriptService.exportTranscripts(
              testMeetingId,
              testUserId,
              format
            );

            expect(exported).toBeDefined();
            expect(typeof exported).toBe('string');
            expect(exported.length).toBeGreaterThan(0);

            // Format-specific validations
            switch (format) {
              case 'json':
                expect(() => JSON.parse(exported)).not.toThrow();
                const parsed = JSON.parse(exported);
                expect(Array.isArray(parsed)).toBe(true);
                expect(parsed.length).toBe(transcriptData.length);
                break;

              case 'txt':
                // Should contain speaker names and text
                for (const data of transcriptData) {
                  expect(exported).toContain(data.speaker);
                  expect(exported).toContain(data.text);
                }
                break;

              case 'srt':
                // Should contain SRT format markers
                expect(exported).toMatch(/\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
                break;

              case 'vtt':
                // Should start with WEBVTT header
                expect(exported).toMatch(/^WEBVTT/);
                expect(exported).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/);
                break;
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});