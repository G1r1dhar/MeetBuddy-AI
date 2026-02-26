import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Prevent multiple instances of Prisma Client in development
const prisma = globalThis.__prisma || new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'info', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  // @ts-ignore - Prisma types for events can be tricky
  prisma.$on('query', (e: any) => {
    logger.debug('Database Query', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
    });
  });
}

// Log database errors
// @ts-ignore
prisma.$on('error', (e: any) => {
  logger.error('Database Error', {
    message: e.message,
    target: e.target,
  });
});

// Log database info and warnings
// @ts-ignore
prisma.$on('info', (e: any) => {
  logger.info('Database Info', { message: e.message });
});

// @ts-ignore
prisma.$on('warn', (e: any) => {
  logger.warn('Database Warning', { message: e.message });
});

if (process.env.NODE_ENV === 'development') {
  globalThis.__prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  logger.info('Disconnecting from database...');
  await prisma.$disconnect();
});

export { prisma };

// Helper function to handle database connection
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
  } catch (error) {
    logger.error('❌ Database connection failed', { error });
    process.exit(1);
  }
};

// Helper function to check database health
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    // For SQLite, we can use a simple query to check connectivity
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed', { error });
    return false;
  }
};