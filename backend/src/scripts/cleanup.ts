import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  logger.info('🧹 Starting database cleanup...');

  try {
    // Delete all meetings and related data
    await prisma.transcriptEntry.deleteMany({});
    logger.info('✅ Deleted all transcript entries');

    await prisma.summary.deleteMany({});
    logger.info('✅ Deleted all summaries');

    await prisma.meeting.deleteMany({});
    logger.info('✅ Deleted all meetings');

    // Delete all files
    await prisma.file.deleteMany({});
    logger.info('✅ Deleted all files');

    // Delete all platform integrations
    await prisma.platformIntegration.deleteMany({});
    logger.info('✅ Deleted all platform integrations');

    // Delete all system logs
    await prisma.systemLog.deleteMany({});
    logger.info('✅ Deleted all system logs');

    // Reset storage usage for all users
    await prisma.user.updateMany({
      data: {
        storageUsed: 0,
      },
    });
    logger.info('✅ Reset storage usage for all users');

    logger.info('🎉 Database cleanup completed successfully!');
    
  } catch (error) {
    logger.error('❌ Database cleanup failed', { error });
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