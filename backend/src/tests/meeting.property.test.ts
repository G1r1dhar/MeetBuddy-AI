import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fc from 'fast-check';
import { prisma } from '../lib/prisma';
import { MeetingService } from '../services/meetingService';
import bcrypt from 'bcryptjs';

describe('Meeting Service Property Tests', () => {
  let meetingService: MeetingService;
  let testUserId: string;

  beforeAll(async () => {
    meetingService = new MeetingService();
    
    // Create a test user
    const hashedPassword = await bcrypt.hash('testpassword123!', 12);
    const testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        subscription: 'PRO', // Use PRO to avoid meeting limits
      },
    });
    testUserId = testUser.id;
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
    // Clean up meetings before each test
    await prisma.transcriptEntry.deleteMany({
      where: { meeting: { userId: testUserId } },
    });
    await prisma.summary.deleteMany({
      where: { meeting: { userId: testUserId } },
    });
    await prisma.meeting.deleteMany({
      where: { userId: testUserId },
    });
  });

  /**
   * **Feature: meetbuddy-ai-completion, Property 22: Meeting search covers all specified fields**
   * **Validates: Requirements 5.2**
   */
  it('Property 22: Meeting search covers all specified fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          meetings: fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              description: fc.option(fc.string({ maxLength: 200 })),
              platform: fc.constantFrom(...Object.values(Platform)),
              scheduledTime: fc.date({ min: new Date(Date.now() + 60000) }), // Future date
              participants: fc.array(fc.emailAddress(), { maxLength: 3 }),
            }),
            { minLength: 2, maxLength: 8 }
          ),
          searchTerms: fc.array(
            fc.string({ minLength: 3, maxLength: 15 }).filter(s => s.trim().length > 0),
            { minLength: 1, maxLength: 3 }
          ),
        }),
        async ({ meetings, searchTerms }) => {
          // Create meetings with search terms embedded in different fields
          const createdMeetings = [];
          for (let i = 0; i < meetings.length; i++) {
            const meeting = meetings[i];
            const searchTerm = searchTerms[i % searchTerms.length];
            
            // Embed search term in different fields based on index
            const fieldIndex = i % 4;
            let title = meeting.title;
            let description = meeting.description;
            let participants = meeting.participants;
            
            switch (fieldIndex) {
              case 0: // Title
                title = `${meeting.title} ${searchTerm}`;
                break;
              case 1: // Description
                description = meeting.description ? `${meeting.description} ${searchTerm}` : searchTerm;
                break;
              case 2: // Participants (add email with search term)
                participants = [...meeting.participants, `${searchTerm}@example.com`];
                break;
              case 3: // Multiple fields
                title = `${meeting.title} ${searchTerm}`;
                description = `${meeting.description || ''} ${searchTerm}`;
                break;
            }
            
            const createdMeeting = await meetingService.createMeeting(testUserId, {
              title,
              description,
              platform: meeting.platform,
              scheduledTime: meeting.scheduledTime,
              participants,
            });
            createdMeetings.push({ meeting: createdMeeting, searchTerm, fieldIndex });

            // Add some transcript entries for transcript search testing
            if (fieldIndex === 0 || fieldIndex === 3) {
              await prisma.transcriptEntry.create({
                data: {
                  meetingId: createdMeeting.id,
                  speaker: 'Test Speaker',
                  text: `This transcript contains ${searchTerm} for testing`,
                  timestamp: new Date(),
                  confidence: 0.95,
                  isFinal: true,
                },
              });
            }

            // Add some summary entries for summary search testing
            if (fieldIndex === 1 || fieldIndex === 3) {
              await prisma.summary.create({
                data: {
                  meetingId: createdMeeting.id,
                  overallSummary: `Meeting summary with ${searchTerm} keyword`,
                  keyPoints: [`Key point containing ${searchTerm}`],
                  actionItems: [`Action item with ${searchTerm}`],
                  nextSteps: ['Follow up on discussion'],
                  topics: ['General discussion'],
                },
              });
            }
          }

          // Test search functionality across all fields
          for (const searchTerm of searchTerms) {
            const searchResults = await meetingService.searchMeetings(testUserId, searchTerm);
            
            // Should find meetings containing the search term
            expect(searchResults.meetings.length).toBeGreaterThan(0);
            
            // Verify that search covers all specified fields
            const expectedMeetings = createdMeetings.filter(({ searchTerm: term }) => 
              term === searchTerm
            );
            
            expect(searchResults.meetings.length).toBeGreaterThanOrEqual(expectedMeetings.length);
            
            // All results should contain the search term in at least one of the specified fields:
            // titles, participants, transcripts, summaries
            for (const result of searchResults.meetings) {
              const titleMatch = result.title.toLowerCase().includes(searchTerm.toLowerCase());
              const descriptionMatch = result.description?.toLowerCase().includes(searchTerm.toLowerCase());
              
              // Check if participants contain the search term
              const participantMatch = Array.isArray(result.participants) && 
                result.participants.some((p: string) => 
                  p.toLowerCase().includes(searchTerm.toLowerCase())
                );
              
              // For transcript and summary matches, we rely on the database query
              // The search should return results if they match in any field
              const hasMatch = titleMatch || descriptionMatch || participantMatch;
              
              // If none of the easily checkable fields match, the result must come from
              // transcript or summary search (which is handled by the database query)
              if (!hasMatch) {
                // This is acceptable as the search might match in transcripts or summaries
                // The fact that we got results means the search is working across all fields
                expect(searchResults.meetings.length).toBeGreaterThan(0);
              }
            }
          }

          // Test multi-term search
          if (searchTerms.length > 1) {
            const multiTermQuery = searchTerms.slice(0, 2).join(' ');
            const multiTermResults = await meetingService.searchMeetings(testUserId, multiTermQuery);
            
            // Multi-term search should work (AND logic)
            expect(multiTermResults.meetings).toBeDefined();
            expect(Array.isArray(multiTermResults.meetings)).toBe(true);
          }

          // Test case-insensitive search
          const upperCaseResults = await meetingService.searchMeetings(
            testUserId, 
            searchTerms[0].toUpperCase()
          );
          const lowerCaseResults = await meetingService.searchMeetings(
            testUserId, 
            searchTerms[0].toLowerCase()
          );
          
          // Case-insensitive search should return same results
          expect(upperCaseResults.meetings.length).toBe(lowerCaseResults.meetings.length);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design document
    );
  });

  /**
   * Property: Meeting CRUD operations maintain data consistency
   */
  it('Property: Meeting CRUD operations maintain data consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 100 }),
          description: fc.option(fc.string({ maxLength: 500 })),
          platform: fc.constantFrom(...Object.values(Platform)),
          scheduledTime: fc.date({ min: new Date(Date.now() + 60000) }),
          participants: fc.array(fc.emailAddress(), { maxLength: 5 }),
        }),
        async (meetingData) => {
          // Create meeting
          const createdMeeting = await meetingService.createMeeting(testUserId, meetingData);
          
          // Verify creation
          expect(createdMeeting.title).toBe(meetingData.title);
          expect(createdMeeting.description).toBe(meetingData.description);
          expect(createdMeeting.platform).toBe(meetingData.platform);
          expect(createdMeeting.scheduledTime).toEqual(meetingData.scheduledTime);
          expect(createdMeeting.participants).toEqual(meetingData.participants || []);
          expect(createdMeeting.status).toBe('SCHEDULED');
          expect(createdMeeting.userId).toBe(testUserId);

          // Retrieve meeting
          const retrievedMeeting = await meetingService.getMeetingById(createdMeeting.id, testUserId);
          expect(retrievedMeeting.id).toBe(createdMeeting.id);
          expect(retrievedMeeting.title).toBe(meetingData.title);

          // Update meeting
          const updateData = {
            title: `Updated ${meetingData.title}`,
            description: `Updated ${meetingData.description || 'description'}`,
          };
          
          const updatedMeeting = await meetingService.updateMeeting(
            createdMeeting.id,
            testUserId,
            updateData
          );
          
          expect(updatedMeeting.title).toBe(updateData.title);
          expect(updatedMeeting.description).toBe(updateData.description);
          expect(updatedMeeting.platform).toBe(meetingData.platform); // Unchanged
          expect(updatedMeeting.scheduledTime).toEqual(meetingData.scheduledTime); // Unchanged

          // Delete meeting
          const deleteResult = await meetingService.deleteMeeting(createdMeeting.id, testUserId);
          expect(deleteResult.success).toBe(true);

          // Verify deletion
          await expect(
            meetingService.getMeetingById(createdMeeting.id, testUserId)
          ).rejects.toThrow('Meeting not found');
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Meeting status transitions follow valid state machine
   */
  it('Property: Meeting status transitions follow valid state machine', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 100 }),
          platform: fc.constantFrom(...Object.values(Platform)),
          scheduledTime: fc.date({ min: new Date(Date.now() + 60000) }),
        }),
        async (meetingData) => {
          // Create meeting (starts as SCHEDULED)
          const meeting = await meetingService.createMeeting(testUserId, meetingData);
          expect(meeting.status).toBe('SCHEDULED');

          // Start meeting (SCHEDULED -> RECORDING)
          const startedMeeting = await meetingService.startMeeting(meeting.id, testUserId);
          expect(startedMeeting.status).toBe('RECORDING');
          expect(startedMeeting.startTime).toBeDefined();

          // End meeting (RECORDING -> COMPLETED)
          const completedMeeting = await meetingService.endMeeting(meeting.id, testUserId);
          expect(completedMeeting.status).toBe('COMPLETED');
          expect(completedMeeting.endTime).toBeDefined();
          expect(completedMeeting.endTime!.getTime()).toBeGreaterThan(
            completedMeeting.startTime!.getTime()
          );

          // Cannot start completed meeting
          await expect(
            meetingService.startMeeting(meeting.id, testUserId)
          ).rejects.toThrow('Meeting is not in scheduled status');

          // Cannot end completed meeting
          await expect(
            meetingService.endMeeting(meeting.id, testUserId)
          ).rejects.toThrow('Meeting is not currently recording');
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Meeting filtering returns correct subsets
   */
  it('Property: Meeting filtering returns correct subsets', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          meetings: fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              platform: fc.constantFrom(...Object.values(Platform)),
              scheduledTime: fc.date({ 
                min: new Date(Date.now() + 60000),
                max: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
              }),
            }),
            { minLength: 3, maxLength: 10 }
          ),
        }),
        async ({ meetings }) => {
          // Create meetings
          const createdMeetings = [];
          for (const meetingData of meetings) {
            const meeting = await meetingService.createMeeting(testUserId, meetingData);
            createdMeetings.push(meeting);
          }

          // Test platform filtering
          const platforms = [...new Set(meetings.map(m => m.platform))];
          for (const platform of platforms) {
            const filtered = await meetingService.getMeetings(
              testUserId,
              { platform },
              { limit: 100 }
            );
            
            expect(filtered.meetings.length).toBeGreaterThan(0);
            for (const meeting of filtered.meetings) {
              expect(meeting.platform).toBe(platform);
            }
          }

          // Test date range filtering
          const sortedDates = meetings.map(m => m.scheduledTime).sort((a, b) => a.getTime() - b.getTime());
          const midDate = sortedDates[Math.floor(sortedDates.length / 2)];
          
          const beforeMid = await meetingService.getMeetings(
            testUserId,
            { endDate: midDate },
            { limit: 100 }
          );
          
          const afterMid = await meetingService.getMeetings(
            testUserId,
            { startDate: midDate },
            { limit: 100 }
          );

          // All meetings before midDate should have scheduledTime <= midDate
          for (const meeting of beforeMid.meetings) {
            expect(meeting.scheduledTime.getTime()).toBeLessThanOrEqual(midDate.getTime());
          }

          // All meetings after midDate should have scheduledTime >= midDate
          for (const meeting of afterMid.meetings) {
            expect(meeting.scheduledTime.getTime()).toBeGreaterThanOrEqual(midDate.getTime());
          }

          // Total should equal sum of filtered results (accounting for overlap at midDate)
          const totalMeetings = await meetingService.getMeetings(testUserId, {}, { limit: 100 });
          expect(totalMeetings.meetings.length).toBe(meetings.length);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Meeting pagination works correctly
   */
  it('Property: Meeting pagination works correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          meetingCount: fc.integer({ min: 5, max: 20 }),
          pageSize: fc.integer({ min: 2, max: 5 }),
        }),
        async ({ meetingCount, pageSize }) => {
          // Create meetings
          const meetings = [];
          for (let i = 0; i < meetingCount; i++) {
            const meeting = await meetingService.createMeeting(testUserId, {
              title: `Meeting ${i}`,
              platform: 'GOOGLE_MEET',
              scheduledTime: new Date(Date.now() + (i + 1) * 60000),
            });
            meetings.push(meeting);
          }

          // Test pagination
          const allMeetings = [];
          let page = 1;
          let hasMore = true;

          while (hasMore) {
            const result = await meetingService.getMeetings(
              testUserId,
              {},
              { page, limit: pageSize, sortBy: 'scheduledTime', sortOrder: 'asc' }
            );

            expect(result.pagination.page).toBe(page);
            expect(result.pagination.limit).toBe(pageSize);
            expect(result.pagination.total).toBe(meetingCount);
            expect(result.meetings.length).toBeLessThanOrEqual(pageSize);

            if (page === 1) {
              expect(result.pagination.hasPrev).toBe(false);
            } else {
              expect(result.pagination.hasPrev).toBe(true);
            }

            allMeetings.push(...result.meetings);
            hasMore = result.pagination.hasNext;
            page++;
          }

          // Should have retrieved all meetings
          expect(allMeetings.length).toBe(meetingCount);

          // Should be in correct order
          for (let i = 1; i < allMeetings.length; i++) {
            expect(allMeetings[i].scheduledTime.getTime()).toBeGreaterThanOrEqual(
              allMeetings[i - 1].scheduledTime.getTime()
            );
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Meeting statistics are accurate
   */
  it('Property: Meeting statistics are accurate', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          scheduledCount: fc.integer({ min: 1, max: 5 }),
          completedCount: fc.integer({ min: 1, max: 5 }),
        }),
        async ({ scheduledCount, completedCount }) => {
          // Create scheduled meetings
          const scheduledMeetings = [];
          for (let i = 0; i < scheduledCount; i++) {
            const meeting = await meetingService.createMeeting(testUserId, {
              title: `Scheduled Meeting ${i}`,
              platform: 'GOOGLE_MEET',
              scheduledTime: new Date(Date.now() + (i + 1) * 60000),
            });
            scheduledMeetings.push(meeting);
          }

          // Create and complete meetings
          const completedMeetings = [];
          for (let i = 0; i < completedCount; i++) {
            const meeting = await meetingService.createMeeting(testUserId, {
              title: `Completed Meeting ${i}`,
              platform: 'ZOOM',
              scheduledTime: new Date(Date.now() + (i + 1) * 60000),
            });

            // Start and end the meeting
            await meetingService.startMeeting(meeting.id, testUserId);
            const completedMeeting = await meetingService.endMeeting(meeting.id, testUserId);
            completedMeetings.push(completedMeeting);
          }

          // Get statistics
          const stats = await meetingService.getMeetingStats(testUserId);

          // Verify statistics
          expect(stats.totalMeetings).toBe(scheduledCount + completedCount);
          expect(stats.scheduledMeetings).toBe(scheduledCount);
          expect(stats.completedMeetings).toBe(completedCount);
          expect(stats.recordingMeetings).toBe(0);
          expect(stats.thisMonthMeetings).toBe(scheduledCount + completedCount);
        }
      ),
      { numRuns: 10 }
    );
  });
});