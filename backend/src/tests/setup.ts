import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Use SQLite in-memory database for tests to avoid PostgreSQL dependency
process.env.DATABASE_URL = 'file:./test.db';
process.env.TEST_DATABASE_URL = 'file:./test.db';

beforeAll(async () => {
  // Global test setup
  console.log('🧪 Setting up test environment...');
  
  // Initialize test database
  try {
    const { execSync } = require('child_process');
    // Generate Prisma client for test database using test schema
    execSync('npx prisma generate --schema=prisma/schema.test.prisma', { stdio: 'inherit' });
    // Push schema to test database
    execSync('npx prisma db push --force-reset --schema=prisma/schema.test.prisma', { stdio: 'inherit' });
    console.log('✅ Test database initialized');
  } catch (error) {
    console.warn('⚠️ Database setup failed, tests will use mock data:', 
      error instanceof Error ? error.message : String(error));
  }
});

afterAll(async () => {
  // Global test cleanup
  console.log('🧹 Cleaning up test environment...');
  
  // Clean up test database file
  try {
    const fs = require('fs');
    if (fs.existsSync('./test.db')) {
      fs.unlinkSync('./test.db');
    }
  } catch (error) {
    console.warn('⚠️ Failed to clean up test database:', 
      error instanceof Error ? error.message : String(error));
  }
});