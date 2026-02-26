import { PrismaClient } from '@prisma/client';
import { Role, Subscription, Platform, MeetingStatus } from '../lib/types';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  logger.info('🌱 Starting simple database seed...');

  try {
    // Check if admin user exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'admin@meetbuddy.ai' },
    });

    if (!existingAdmin) {
      const adminPassword = await bcrypt.hash('admin123', 12);
      const adminUser = await prisma.user.create({
        data: {
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
    } else {
      logger.info('ℹ️  Admin user already exists');
    }

    // Check if demo user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'user@meetbuddy.ai' },
    });

    if (!existingUser) {
      const userPassword = await bcrypt.hash('user123', 12);
      const demoUser = await prisma.user.create({
        data: {
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
    } else {
      logger.info('ℹ️  Demo user already exists');
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
      const existing = await prisma.systemSetting.findUnique({
        where: { key: setting.key },
      });

      if (!existing) {
        await prisma.systemSetting.create({
          data: setting as any,
        });
        logger.info(`✅ System setting created: ${setting.key}`);
      } else {
        logger.info(`ℹ️  System setting already exists: ${setting.key}`);
      }
    }

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
