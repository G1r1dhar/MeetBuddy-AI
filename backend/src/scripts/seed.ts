import { PrismaClient } from '@prisma/client';
import { Role, Subscription, Platform, MeetingStatus } from '../lib/types';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  logger.info('🌱 Starting database seed...');

  try {
    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 12);
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@meetbuddy.ai' },
      update: {},
      create: {
        email: 'admin@meetbuddy.ai',
        password: adminPassword,
        name: 'Admin User',
        role: Role.ADMIN,
        subscription: Subscription.ENTERPRISE,
        preferences: JSON.stringify({
          autoGenerateNotes: true,
          enableRealTimeTranscript: true,
          autoExportSummaries: true,
          notifications: {
            meetingReminders: true,
            summaryReady: true,
            adminMessages: true,
          },
        }),
      },
    });

    logger.info('✅ Admin user created', { userId: adminUser.id });

    // Create demo user
    const userPassword = await bcrypt.hash('user123', 12);
    const demoUser = await prisma.user.upsert({
      where: { email: 'user@meetbuddy.ai' },
      update: {},
      create: {
        email: 'user@meetbuddy.ai',
        password: userPassword,
        name: 'Demo User',
        role: Role.USER,
        subscription: Subscription.PRO,
        preferences: JSON.stringify({
          autoGenerateNotes: true,
          enableRealTimeTranscript: true,
          autoExportSummaries: false,
          notifications: {
            meetingReminders: true,
            summaryReady: true,
            adminMessages: false,
          },
        }),
      },
    });

    logger.info('✅ Demo user created', { userId: demoUser.id });

    // Create sample meetings
    const sampleMeetings = [
      {
        title: 'Weekly Team Standup',
        description: 'Weekly team synchronization meeting',
        platform: Platform.GOOGLE_MEET,
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        scheduledTime: new Date('2024-01-15T10:00:00Z'),
        startTime: new Date('2024-01-15T10:02:00Z'),
        endTime: new Date('2024-01-15T10:45:00Z'),
        status: MeetingStatus.COMPLETED,
        participants: JSON.stringify(['Sarah J.', 'Mike R.', 'David L.']),
      },
      {
        title: 'Product Planning Session',
        description: 'Q1 product roadmap planning',
        platform: Platform.ZOOM,
        meetingUrl: 'https://zoom.us/j/123456789',
        scheduledTime: new Date('2024-01-16T14:00:00Z'),
        startTime: new Date('2024-01-16T14:05:00Z'),
        endTime: new Date('2024-01-16T15:30:00Z'),
        status: MeetingStatus.COMPLETED,
        participants: JSON.stringify(['product@example.com', 'engineering@example.com']),
      },
      {
        title: 'Client Presentation',
        description: 'Quarterly business review with client',
        platform: Platform.MICROSOFT_TEAMS,
        meetingUrl: 'https://teams.microsoft.com/l/meetup-join/...',
        scheduledTime: new Date('2024-01-17T16:00:00Z'),
        status: MeetingStatus.SCHEDULED,
        participants: JSON.stringify(['client@company.com', 'sales@example.com']),
      },
    ];

    for (const meetingData of sampleMeetings) {
      const meeting = await prisma.meeting.create({
        data: {
          ...meetingData,
          userId: demoUser.id,
        },
      });

      logger.info('✅ Sample meeting created', {
        meetingId: meeting.id,
        title: meeting.title
      });

      // Add sample transcripts for completed meetings
      if (meeting.status === MeetingStatus.COMPLETED) {
        const sampleTranscripts = [
          {
            speaker: 'John Smith',
            text: 'Good morning everyone, let\'s start with our weekly standup.',
            timestamp: new Date(meeting.startTime!.getTime() + 2 * 60 * 1000),
            confidence: 0.95,
            isFinal: true,
          },
          {
            speaker: 'Sarah Johnson',
            text: 'I completed the user authentication feature this week.',
            timestamp: new Date(meeting.startTime!.getTime() + 5 * 60 * 1000),
            confidence: 0.92,
            isFinal: true,
          },
          {
            speaker: 'Mike Wilson',
            text: 'The database migration is scheduled for next Tuesday.',
            timestamp: new Date(meeting.startTime!.getTime() + 8 * 60 * 1000),
            confidence: 0.88,
            isFinal: true,
          },
        ];

        for (const transcriptData of sampleTranscripts) {
          await prisma.transcriptEntry.create({
            data: {
              ...transcriptData,
              meetingId: meeting.id,
            },
          });
        }

        // Add sample summary
        await prisma.summary.create({
          data: {
            meetingId: meeting.id,
            overallSummary: `The ${meeting.title} covered key project updates and upcoming milestones. Team members shared progress on their current tasks and identified potential blockers.`,
            keyPoints: JSON.stringify([
              'User authentication feature completed',
              'Database migration scheduled for next Tuesday',
              'Team velocity is on track for sprint goals',
            ]),
            actionItems: JSON.stringify([
              'Complete code review for authentication feature',
              'Prepare migration rollback plan',
              'Schedule client demo for Friday',
            ]),
            nextSteps: JSON.stringify([
              'Begin integration testing phase',
              'Update project documentation',
              'Coordinate with DevOps team for deployment',
            ]),
            topics: JSON.stringify(['Development', 'Project Management', 'Team Coordination']),
          },
        });

        logger.info('✅ Sample transcript and summary created', { meetingId: meeting.id });
      }
    }

    // Create system settings
    const systemSettings = [
      { key: 'max_file_size', value: '104857600', type: 'NUMBER' }, // 100MB
      { key: 'allowed_file_types', value: '["mp4", "webm", "mp3", "wav"]', type: 'JSON' },
      { key: 'ai_summary_enabled', value: 'true', type: 'BOOLEAN' },
      { key: 'max_meeting_duration', value: '14400', type: 'NUMBER' }, // 4 hours in seconds
      { key: 'default_storage_quota', value: '5368709120', type: 'NUMBER' }, // 5GB
    ];

    for (const setting of systemSettings) {
      await prisma.systemSetting.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: setting as any,
      });
    }

    logger.info('✅ System settings created');

    logger.info('🎉 Database seed completed successfully!');

  } catch (error) {
    logger.error('❌ Database seed failed', { error });
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });