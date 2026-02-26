import { PrismaClient } from '@prisma/client';
import { Role, Subscription } from '../lib/types';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  logger.info('🌱 Starting minimal database seed...');

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

    logger.info('🎉 Minimal database seed completed successfully!');

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