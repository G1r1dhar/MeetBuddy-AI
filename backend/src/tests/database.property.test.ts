import { describe, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { Role, Subscription, Platform, MeetingStatus } from '../lib/types';
import bcrypt from 'bcryptjs';

/**
 * Feature: meetbuddy-ai-completion, Property 32: Database operations maintain data consistency
 * 
 * This test verifies that database operations maintain data consistency
 * and handle transaction failures appropriately across all database operations.
 */

// Mock Prisma client for testing
const mockPrisma = {
  user: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  meeting: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  transcriptEntry: {
    create: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  summary: {
    deleteMany: vi.fn(),
  },
  platformIntegration: {
    deleteMany: vi.fn(),
  },
  systemLog: {
    deleteMany: vi.fn(),
  },
  systemSetting: {
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
  $disconnect: vi.fn(),
};

// Mock the prisma module
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

// Test data generators
const userArbitrary = fc.record({
  email: fc.emailAddress(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  password: fc.string({ minLength: 8, maxLength: 50 }),
  role: fc.constantFrom(Role.USER, Role.ADMIN),
  subscription: fc.constantFrom(Subscription.FREE, Subscription.PRO, Subscription.ENTERPRISE),
});

const meetingArbitrary = fc.record({
  title: fc.string({ minLength: 1, maxLength: 200 }),
  description: fc.option(fc.string({ maxLength: 1000 })),
  platform: fc.constantFrom(...Object.values(Platform)),
  meetingUrl: fc.option(fc.webUrl()),
  scheduledTime: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
});

const transcriptArbitrary = fc.record({
  speaker: fc.string({ minLength: 1, maxLength: 100 }),
  text: fc.string({ minLength: 1, maxLength: 1000 }),
  confidence: fc.float({ min: 0, max: 1 }),
  isFinal: fc.boolean(),
});

describe('Database Operations Property Tests', () => {
  beforeAll(async () => {
    // Ensure test database is clean
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean database before each test
    await cleanDatabase();
  });

  /**
   * Property: User CRUD operations maintain referential integrity
   * For any valid user data, creating, reading, updating, and deleting
   * should maintain database consistency and referential integrity.
   */
  it('should maintain referential integrity for user CRUD operations', async () => {
    await fc.assert(
      fc.asyncProperty(userArbitrary, async (userData) => {
        // Create user
        const hashedPassword = await bcrypt.hash(userData.password, 12);
        const createdUser = await prisma.user.create({
          data: {
            ...userData,
            password: hashedPassword,
          },
        });

        // Verify user was created correctly
        const fetchedUser = await prisma.user.findUnique({
          where: { id: createdUser.id },
        });

        if (!fetchedUser) {
          throw new Error('User not found after creation');
        }

        // Verify data consistency
        if (fetchedUser.email !== userData.email) {
          throw new Error('Email mismatch after creation');
        }
        if (fetchedUser.name !== userData.name) {
          throw new Error('Name mismatch after creation');
        }
        if (fetchedUser.role !== userData.role) {
          throw new Error('Role mismatch after creation');
        }

        // Update user
        const updatedName = `Updated ${userData.name}`;
        const updatedUser = await prisma.user.update({
          where: { id: createdUser.id },
          data: { name: updatedName },
        });

        if (updatedUser.name !== updatedName) {
          throw new Error('Name not updated correctly');
        }

        // Delete user
        await prisma.user.delete({
          where: { id: createdUser.id },
        });

        // Verify user was deleted
        const deletedUser = await prisma.user.findUnique({
          where: { id: createdUser.id },
        });

        if (deletedUser !== null) {
          throw new Error('User still exists after deletion');
        }

        return true;
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Meeting-User relationship maintains referential integrity
   * For any valid meeting data, the relationship with users should be
   * maintained correctly, and cascade deletes should work properly.
   */
  it('should maintain referential integrity for meeting-user relationships', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArbitrary,
        meetingArbitrary,
        async (userData, meetingData) => {
          // Create user first
          const hashedPassword = await bcrypt.hash(userData.password, 12);
          const user = await prisma.user.create({
            data: {
              ...userData,
              password: hashedPassword,
            },
          });

          // Create meeting for the user
          const meeting = await prisma.meeting.create({
            data: {
              ...meetingData,
              userId: user.id,
              status: MeetingStatus.SCHEDULED,
            },
          });

          // Verify meeting-user relationship
          const fetchedMeeting = await prisma.meeting.findUnique({
            where: { id: meeting.id },
            include: { user: true },
          });

          if (!fetchedMeeting) {
            throw new Error('Meeting not found after creation');
          }

          if (fetchedMeeting.userId !== user.id) {
            throw new Error('Meeting-user relationship not established correctly');
          }

          if (fetchedMeeting.user.id !== user.id) {
            throw new Error('Meeting-user include relationship incorrect');
          }

          // Test cascade delete - deleting user should delete meetings
          await prisma.user.delete({
            where: { id: user.id },
          });

          // Verify meeting was also deleted due to cascade
          const deletedMeeting = await prisma.meeting.findUnique({
            where: { id: meeting.id },
          });

          if (deletedMeeting !== null) {
            throw new Error('Meeting not deleted when user was deleted (cascade failed)');
          }

          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Transcript-Meeting relationship maintains data consistency
   * For any valid transcript data, the relationship with meetings should be
   * maintained correctly, including proper ordering and cascade behavior.
   */
  it('should maintain data consistency for transcript-meeting relationships', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArbitrary,
        meetingArbitrary,
        fc.array(transcriptArbitrary, { minLength: 1, maxLength: 10 }),
        async (userData, meetingData, transcriptDataArray) => {
          // Create user and meeting
          const hashedPassword = await bcrypt.hash(userData.password, 12);
          const user = await prisma.user.create({
            data: {
              ...userData,
              password: hashedPassword,
            },
          });

          const meeting = await prisma.meeting.create({
            data: {
              ...meetingData,
              userId: user.id,
              status: MeetingStatus.RECORDING,
              startTime: new Date(),
            },
          });

          // Create transcripts with proper timestamps
          const transcripts = [];
          const baseTime = new Date();
          
          for (let i = 0; i < transcriptDataArray.length; i++) {
            const transcriptData = transcriptDataArray[i];
            const timestamp = new Date(baseTime.getTime() + i * 1000); // 1 second apart
            
            const transcript = await prisma.transcriptEntry.create({
              data: {
                ...transcriptData,
                meetingId: meeting.id,
                timestamp,
              },
            });
            
            transcripts.push(transcript);
          }

          // Verify all transcripts were created and linked correctly
          const fetchedTranscripts = await prisma.transcriptEntry.findMany({
            where: { meetingId: meeting.id },
            orderBy: { timestamp: 'asc' },
          });

          if (fetchedTranscripts.length !== transcriptDataArray.length) {
            throw new Error('Transcript count mismatch');
          }

          // Verify transcript ordering by timestamp
          for (let i = 1; i < fetchedTranscripts.length; i++) {
            if (fetchedTranscripts[i].timestamp <= fetchedTranscripts[i - 1].timestamp) {
              throw new Error('Transcript ordering by timestamp is incorrect');
            }
          }

          // Verify meeting-transcript relationship
          const meetingWithTranscripts = await prisma.meeting.findUnique({
            where: { id: meeting.id },
            include: { transcripts: true },
          });

          if (!meetingWithTranscripts) {
            throw new Error('Meeting not found when fetching with transcripts');
          }

          if (meetingWithTranscripts.transcripts.length !== transcriptDataArray.length) {
            throw new Error('Meeting-transcript relationship count mismatch');
          }

          // Test cascade delete - deleting meeting should delete transcripts
          await prisma.meeting.delete({
            where: { id: meeting.id },
          });

          // Verify transcripts were deleted
          const remainingTranscripts = await prisma.transcriptEntry.findMany({
            where: { meetingId: meeting.id },
          });

          if (remainingTranscripts.length > 0) {
            throw new Error('Transcripts not deleted when meeting was deleted (cascade failed)');
          }

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Transaction rollback maintains database consistency
   * For any database operation that fails, the database should remain
   * in a consistent state with no partial updates.
   */
  it('should maintain consistency during transaction failures', async () => {
    await fc.assert(
      fc.asyncProperty(userArbitrary, async (userData) => {
        // Get initial user count
        const initialUserCount = await prisma.user.count();

        try {
          // Attempt a transaction that will fail
          await prisma.$transaction(async (tx) => {
            // Create a user
            const hashedPassword = await bcrypt.hash(userData.password, 12);
            await tx.user.create({
              data: {
                ...userData,
                password: hashedPassword,
              },
            });

            // Force a failure by trying to create a user with the same email
            await tx.user.create({
              data: {
                ...userData,
                password: hashedPassword,
              },
            });
          });
        } catch (error) {
          // Transaction should fail due to unique constraint violation
          // This is expected behavior
        }

        // Verify database state is unchanged
        const finalUserCount = await prisma.user.count();
        
        if (finalUserCount !== initialUserCount) {
          throw new Error('Database state changed after failed transaction');
        }

        // Verify no partial data was committed
        const userWithEmail = await prisma.user.findUnique({
          where: { email: userData.email },
        });

        if (userWithEmail !== null) {
          throw new Error('Partial data was committed despite transaction failure');
        }

        return true;
      }),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Concurrent operations maintain data consistency
   * For any concurrent database operations, the final state should be
   * consistent and all operations should either succeed or fail atomically.
   */
  it('should maintain consistency during concurrent operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(userArbitrary, { minLength: 2, maxLength: 5 }),
        async (userDataArray) => {
          // Ensure all users have unique emails
          const uniqueUsers = userDataArray.map((user, index) => ({
            ...user,
            email: `user${index}_${user.email}`,
          }));

          // Create users concurrently
          const createPromises = uniqueUsers.map(async (userData) => {
            const hashedPassword = await bcrypt.hash(userData.password, 12);
            return prisma.user.create({
              data: {
                ...userData,
                password: hashedPassword,
              },
            });
          });

          const createdUsers = await Promise.all(createPromises);

          // Verify all users were created
          if (createdUsers.length !== uniqueUsers.length) {
            throw new Error('Not all users were created during concurrent operations');
          }

          // Verify each user exists in database
          for (const user of createdUsers) {
            const fetchedUser = await prisma.user.findUnique({
              where: { id: user.id },
            });

            if (!fetchedUser) {
              throw new Error('User not found after concurrent creation');
            }
          }

          // Update users concurrently
          const updatePromises = createdUsers.map((user) =>
            prisma.user.update({
              where: { id: user.id },
              data: { name: `Updated ${user.name}` },
            })
          );

          const updatedUsers = await Promise.all(updatePromises);

          // Verify all updates were applied
          for (const user of updatedUsers) {
            if (!user.name.startsWith('Updated ')) {
              throw new Error('Concurrent update not applied correctly');
            }
          }

          // Delete users concurrently
          const deletePromises = createdUsers.map((user) =>
            prisma.user.delete({
              where: { id: user.id },
            })
          );

          await Promise.all(deletePromises);

          // Verify all users were deleted
          for (const user of createdUsers) {
            const deletedUser = await prisma.user.findUnique({
              where: { id: user.id },
            });

            if (deletedUser !== null) {
              throw new Error('User not deleted during concurrent operations');
            }
          }

          return true;
        }
      ),
      { numRuns: 15 }
    );
  });
});

async function cleanDatabase(): Promise<void> {
  // Delete in correct order to respect foreign key constraints
  await prisma.transcriptEntry.deleteMany();
  await prisma.summary.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.platformIntegration.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemLog.deleteMany();
  await prisma.systemSetting.deleteMany();
}