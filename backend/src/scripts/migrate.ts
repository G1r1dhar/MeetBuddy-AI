import { execSync } from 'child_process';
import { logger } from '../utils/logger';

async function runMigrations(): Promise<void> {
  try {
    logger.info('🔄 Running database migrations...');
    
    // Generate Prisma client
    logger.info('Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    
    // Push database schema
    logger.info('Pushing database schema...');
    execSync('npx prisma db push', { stdio: 'inherit' });
    
    logger.info('✅ Database migrations completed successfully!');
    
  } catch (error) {
    logger.error('❌ Database migration failed', { error });
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations();
}

export { runMigrations };