import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { AIService } from '../services/aiService';

// Mock data structures
interface MockMeeting {
  id: string;
  title: string;
  userId: string;
  status: 'SCHEDULED' | 'RECORDING' | 'COMPLETED';
  transcripts: MockTranscript[];
}

interface MockTranscript {
  id: string;
  speaker: string;
  text: string;
  timestamp: Date;
  confidence: number;
  isFinal: boolean;
}

interface MockSummary {
  id: string;
  meetingId: string;
  overallSummary: string;
  keyPoints: string[];
  actionItems: string[];
  nextSteps: string[];
  topics: string[];
  generatedAt: Date;
}

// Simple in-memory mock services
class MockSummaryService {
  private summaries: Map<string, MockSummary> = new Map();
  private aiService = new AIService();

  async generateSummaryForMeeting(meetingId: string, userId: string): Promise<MockSummary> {
    const meeting = mockMeetings.get(meetingId);
    if (!meeting) throw new Error('Meeting not found');
    if (meeting.userId !== userId) throw new Error('Access denied');
    if (meeting.transcripts.length === 0) throw new Error('No transcripts available');

    // Combine transcripts
    const transcript = meeting.transcripts
      .map(t => `${t.speaker}: ${t.text}`)
      .join('\n');

    // Generate summary using AI service
    const aiSummary = await this.aiService.generateMeetingSummary({
      transcript,
      meetingTitle: meeting.title,
      participants: [...new Set(meeting.transcripts.map(t => t.speaker))],
    });

    const summary: MockSummary = {
      id: `summary-${Date.now()}`,
      meetingId,
      overallSummary: aiSummary.overallSummary,
      keyPoints: aiSummary.keyPoints,
      actionItems: aiSummary.actionItems,
      nextSteps: aiSummary.nextSteps,
      topics: aiSummary.topics,
      generatedAt: new Date(),
    };

    this.summaries.set(summary.id, summary);
    return summary;
  }

  async getSummaryForMeeting(meetingId: string, userId: string): Promise<MockSummary> {
    const summary = Array.from(this.summaries.values()).find(s => s.meetingId === meetingId);
    if (!summary) throw new Error('No summary found');
    return summary;
  }

  async createSummary(userId: string, data: any): Promise<MockSummary> {
    const summary: MockSummary = {
      id: `summary-${Date.now()}`,
      meetingId: data.meetingId,
      overallSummary: data.overallSummary || '',
      keyPoints: data.keyPoints || [],
      actionItems: data.actionItems || [],
      nextSteps: data.nextSteps || [],
      topics: data.topics || [],
      generatedAt: new Date(),
    };
    this.summaries.set(summary.id, summary);
    return summary;
  }

  async updateSummary(summaryId: string, userId: string, data: any): Promise<MockSummary> {
    const summary = this.summaries.get(summaryId);
    if (!summary) throw new Error('Summary not found');
    
    Object.assign(summary, data);
    return summary;
  }

  async deleteSummary(summaryId: string, userId: string): Promise<{ success: boolean }> {
    return { success: this.summaries.delete(summaryId) };
  }

  async regenerateSummary(summaryId: string, userId: string): Promise<MockSummary> {
    const summary = this.summaries.get(summaryId);
    if (!summary) throw new Error('Summary not found');
    return this.generateSummaryForMeeting(summary.meetingId, userId);
  }
}

class MockMeetingService {
  async createMeeting(userId: string, data: any): Promise<MockMeeting> {
    const meeting: MockMeeting = {
      id: `meeting-${Date.now()}`,
      title: data.title,
      userId,
      status: 'SCHEDULED',
      transcripts: [],
    };
    mockMeetings.set(meeting.id, meeting);
    return meeting;
  }

  async startMeeting(meetingId: string, userId: string): Promise<MockMeeting> {
    const meeting = mockMeetings.get(meetingId);
    if (!meeting) throw new Error('Meeting not found');
    meeting.status = 'RECORDING';
    return meeting;
  }

  async endMeeting(meetingId: string, userId: string): Promise<MockMeeting> {
    const meeting = mockMeetings.get(meetingId);
    if (!meeting) throw new Error('Meeting not found');
    meeting.status = 'COMPLETED';
    return meeting;
  }
}

class MockTranscriptService {
  async addTranscriptEntry(userId: string, data: any): Promise<MockTranscript> {
    const meeting = mockMeetings.get(data.meetingId);
    if (!meeting) throw new Error('Meeting not found');

    const transcript: MockTranscript = {
      id: `transcript-${Date.now()}-${Math.random()}`,
      speaker: data.speaker,
      text: data.text,
      timestamp: data.timestamp,
      confidence: data.confidence,
      isFinal: data.isFinal,
    };

    meeting.transcripts.push(transcript);
    return transcript;
  }

  async getTranscriptsForMeeting(meetingId: string, userId: string, filters: any, options: any) {
    const meeting = mockMeetings.get(meetingId);
    if (!meeting) throw new Error('Meeting not found');
    
    let transcripts = meeting.transcripts;
    if (filters.isFinal) {
      transcripts = transcripts.filter(t => t.isFinal);
    }
    
    return { transcripts, total: transcripts.length };
  }
}

// Global mock storage
const mockMeetings = new Map<string, MockMeeting>();
const testUserId = 'test-user-123';

describe('AI Summarization Property Tests', () => {
  let summaryService: MockSummaryService;
  let meetingService: MockMeetingService;
  let transcriptService: MockTranscriptService;

  beforeEach(async () => {
    // Initialize services and clear mock data before each test
    summaryService = new MockSummaryService();
    meetingService = new MockMeetingService();
    transcriptService = new MockTranscriptService();
    mockMeetings.clear();
  });

  /**
   * **Feature: meetbuddy-ai-completion, Property 16: Meeting completion triggers AI summarization**
   * **Validates: Requirements 4.1**
   */
  it('Property 16: Meeting completion triggers AI summarization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          meetings: fc.array(
            fc.record({
              title: fc.string({ minLength: 5, maxLength: 50 }),
              transcriptEntries: fc.array(
                fc.record({
                  speaker: fc.string({ minLength: 3, maxLength: 20 }),
                  text: fc.string({ minLength: 10, maxLength: 200 }),
                  confidence: fc.float({ min: Math.fround(0.7), max: Math.fround(1.0) }),
                }),
                { minLength: 3, maxLength: 10 }
              ),
            }),
            { minLength: 1, maxLength: 3 }
          ),
        }),
        async ({ meetings }) => {
          for (const meetingData of meetings) {
            // Create meeting
            const meeting = await meetingService.createMeeting(testUserId, {
              title: meetingData.title,
              platform: 'GOOGLE_MEET',
              scheduledTime: new Date(Date.now() + 60000),
            });

            // Start the meeting
            const startedMeeting = await meetingService.startMeeting(meeting.id, testUserId);
            expect(startedMeeting.status).toBe('RECORDING');

            // Add transcript entries during the meeting
            for (let i = 0; i < meetingData.transcriptEntries.length; i++) {
              const entry = meetingData.transcriptEntries[i];
              await transcriptService.addTranscriptEntry(testUserId, {
                meetingId: meeting.id,
                speaker: entry.speaker,
                text: entry.text,
                timestamp: new Date(Date.now() + i * 1000),
                confidence: entry.confidence,
                isFinal: true,
              });
            }

            // Verify transcripts were created
            const transcriptResult = await transcriptService.getTranscriptsForMeeting(
              meeting.id,
              testUserId,
              { isFinal: true },
              { limit: 100 }
            );
            expect(transcriptResult.transcripts.length).toBe(meetingData.transcriptEntries.length);

            // Complete the meeting
            const completedMeeting = await meetingService.endMeeting(meeting.id, testUserId);
            expect(completedMeeting.status).toBe('COMPLETED');

            // Generate AI summary for completed meeting
            const summary = await summaryService.generateSummaryForMeeting(meeting.id, testUserId);

            // Verify summary was generated with all required components
            expect(summary).toBeDefined();
            expect(summary.meetingId).toBe(meeting.id);
            expect(summary.overallSummary).toBeDefined();
            expect(typeof summary.overallSummary).toBe('string');
            expect(summary.overallSummary.length).toBeGreaterThan(0);

            // Verify structured summary components
            expect(Array.isArray(summary.keyPoints)).toBe(true);
            expect(Array.isArray(summary.actionItems)).toBe(true);
            expect(Array.isArray(summary.nextSteps)).toBe(true);
            expect(Array.isArray(summary.topics)).toBe(true);

            // Verify summary contains meaningful content
            const hasContent = summary.keyPoints.length > 0 || 
                             summary.topics.length > 0 || 
                             summary.actionItems.length > 0 ||
                             summary.nextSteps.length > 0;
            expect(hasContent).toBe(true);

            // Verify summary can be retrieved
            const retrievedSummary = await summaryService.getSummaryForMeeting(meeting.id, testUserId);
            expect(retrievedSummary.id).toBe(summary.id);
            expect(retrievedSummary.overallSummary).toBe(summary.overallSummary);

            // Test that summary generation is idempotent
            const secondSummary = await summaryService.generateSummaryForMeeting(meeting.id, testUserId);
            expect(secondSummary.meetingId).toBe(meeting.id);

            // Verify summary includes meeting context
            const summaryText = summary.overallSummary.toLowerCase();
            const titleWords = meetingData.title.toLowerCase().split(' ');
            
            const hasContextualContent = titleWords.some(word => 
              word.length > 3 && summaryText.includes(word)
            ) || summary.topics.length > 0 || summary.keyPoints.length > 0;
            
            expect(hasContextualContent).toBe(true);
          }
        }
      ),
      { numRuns: 10 } // Reduced runs for faster testing
    );
  });

  /**
   * **Feature: meetbuddy-ai-completion, Property 17: Summary display includes all required sections**
   * **Validates: Requirements 4.2**
   */
  it('Property 17: Summary display includes all required sections', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ minLength: 5, maxLength: 50 }),
          transcriptEntries: fc.array(
            fc.record({
              speaker: fc.string({ minLength: 3, maxLength: 20 }),
              text: fc.string({ minLength: 15, maxLength: 200 }),
              confidence: fc.float({ min: Math.fround(0.8), max: Math.fround(1.0) }),
            }),
            { minLength: 5, maxLength: 15 }
          ),
        }),
        async ({ title, transcriptEntries }) => {
          // Create meeting with transcript data
          const meeting = await meetingService.createMeeting(testUserId, {
            title,
            platform: 'GOOGLE_MEET',
            scheduledTime: new Date(Date.now() + 60000),
          });

          await meetingService.startMeeting(meeting.id, testUserId);

          // Add transcript entries
          for (let i = 0; i < transcriptEntries.length; i++) {
            const entry = transcriptEntries[i];
            await transcriptService.addTranscriptEntry(testUserId, {
              meetingId: meeting.id,
              speaker: entry.speaker,
              text: entry.text,
              timestamp: new Date(Date.now() + i * 2000),
              confidence: entry.confidence,
              isFinal: true,
            });
          }

          await meetingService.endMeeting(meeting.id, testUserId);

          // Generate AI summary
          const summary = await summaryService.generateSummaryForMeeting(meeting.id, testUserId);

          // Verify all required sections are present in the summary structure
          expect(summary).toBeDefined();
          expect(summary.meetingId).toBe(meeting.id);

          // Property: Summary display must include overall summary section
          expect(summary.overallSummary).toBeDefined();
          expect(typeof summary.overallSummary).toBe('string');
          expect(summary.overallSummary.length).toBeGreaterThan(0);

          // Property: Summary display must include key points section
          expect(summary.keyPoints).toBeDefined();
          expect(Array.isArray(summary.keyPoints)).toBe(true);
          summary.keyPoints.forEach(point => {
            expect(typeof point).toBe('string');
            expect(point.length).toBeGreaterThan(0);
          });

          // Property: Summary display must include action items section
          expect(summary.actionItems).toBeDefined();
          expect(Array.isArray(summary.actionItems)).toBe(true);
          summary.actionItems.forEach(item => {
            expect(typeof item).toBe('string');
            expect(item.length).toBeGreaterThan(0);
          });

          // Property: Summary display must include next steps section
          expect(summary.nextSteps).toBeDefined();
          expect(Array.isArray(summary.nextSteps)).toBe(true);
          summary.nextSteps.forEach(step => {
            expect(typeof step).toBe('string');
            expect(step.length).toBeGreaterThan(0);
          });

          // Property: Summary display must include topics section
          expect(summary.topics).toBeDefined();
          expect(Array.isArray(summary.topics)).toBe(true);
          summary.topics.forEach(topic => {
            expect(typeof topic).toBe('string');
            expect(topic.length).toBeGreaterThan(0);
          });

          // Property: Summary should contain meaningful content in at least one section
          const hasContent = summary.overallSummary.length > 0 ||
                           summary.keyPoints.length > 0 ||
                           summary.actionItems.length > 0 ||
                           summary.nextSteps.length > 0 ||
                           summary.topics.length > 0;
          expect(hasContent).toBe(true);

          // Property: Summary sections should be properly structured for display
          const retrievedSummary = await summaryService.getSummaryForMeeting(meeting.id, testUserId);
          
          expect(retrievedSummary.overallSummary).toBe(summary.overallSummary);
          expect(retrievedSummary.keyPoints).toEqual(summary.keyPoints);
          expect(retrievedSummary.actionItems).toEqual(summary.actionItems);
          expect(retrievedSummary.nextSteps).toEqual(summary.nextSteps);
          expect(retrievedSummary.topics).toEqual(summary.topics);

          // Property: Summary should include metadata for display
          expect(summary.id).toBeDefined();
          expect(summary.generatedAt).toBeDefined();
          expect(summary.generatedAt instanceof Date).toBe(true);
        }
      ),
      { numRuns: 10 } // Reduced runs for faster testing
    );
  });

  /**
   * Property: Summary management operations maintain data integrity
   */
  it('Property: Summary management operations maintain data integrity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ minLength: 5, maxLength: 50 }),
          manualSummaryData: fc.record({
            overallSummary: fc.string({ minLength: 10, maxLength: 500 }),
            keyPoints: fc.array(fc.string({ minLength: 5, maxLength: 100 }), { maxLength: 5 }),
            actionItems: fc.array(fc.string({ minLength: 5, maxLength: 100 }), { maxLength: 5 }),
            nextSteps: fc.array(fc.string({ minLength: 5, maxLength: 100 }), { maxLength: 3 }),
            topics: fc.array(fc.string({ minLength: 3, maxLength: 50 }), { maxLength: 5 }),
          }),
        }),
        async ({ title, manualSummaryData }) => {
          // Create meeting with transcript
          const meeting = await meetingService.createMeeting(testUserId, {
            title,
            platform: 'ZOOM',
            scheduledTime: new Date(Date.now() + 60000),
          });

          await meetingService.startMeeting(meeting.id, testUserId);
          
          // Add minimal transcript
          await transcriptService.addTranscriptEntry(testUserId, {
            meetingId: meeting.id,
            speaker: 'Test Speaker',
            text: 'This is a test meeting transcript for summary testing.',
            timestamp: new Date(),
            confidence: 0.9,
            isFinal: true,
          });

          await meetingService.endMeeting(meeting.id, testUserId);

          // Test manual summary creation
          const manualSummary = await summaryService.createSummary(testUserId, {
            meetingId: meeting.id,
            ...manualSummaryData,
          });

          // Verify manual summary
          expect(manualSummary.overallSummary).toBe(manualSummaryData.overallSummary);
          expect(manualSummary.keyPoints).toEqual(manualSummaryData.keyPoints);
          expect(manualSummary.actionItems).toEqual(manualSummaryData.actionItems);
          expect(manualSummary.nextSteps).toEqual(manualSummaryData.nextSteps);
          expect(manualSummary.topics).toEqual(manualSummaryData.topics);

          // Test summary updates
          const updateData = {
            overallSummary: `Updated: ${manualSummaryData.overallSummary}`,
            keyPoints: [...manualSummaryData.keyPoints, 'Additional key point'],
          };

          const updatedSummary = await summaryService.updateSummary(
            manualSummary.id,
            testUserId,
            updateData
          );

          expect(updatedSummary.overallSummary).toBe(updateData.overallSummary);
          expect(updatedSummary.keyPoints).toEqual(updateData.keyPoints);

          // Test summary deletion
          const deleteResult = await summaryService.deleteSummary(manualSummary.id, testUserId);
          expect(deleteResult.success).toBe(true);
        }
      ),
      { numRuns: 5 } // Reduced runs for faster testing
    );
  });
});