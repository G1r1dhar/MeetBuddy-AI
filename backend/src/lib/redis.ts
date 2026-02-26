import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

class RedisClient {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis reconnection failed after 10 attempts');
            return new Error('Redis reconnection failed');
          }
          return Math.min(retries * 50, 1000);
        },
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connecting...');
    });

    this.client.on('ready', () => {
      logger.info('✅ Redis client connected and ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error', { error: error.message });
      this.isConnected = false;
    });

    this.client.on('end', () => {
      logger.info('Redis client connection ended');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });
  }

  async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
      }
    } catch (error) {
      logger.warn('Redis connection failed - continuing without Redis cache', { error });
      // Don't throw error in development mode to allow server to start without Redis
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.disconnect();
        this.isConnected = false;
      }
    } catch (error) {
      logger.error('Failed to disconnect from Redis', { error });
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis ping failed', { error });
      return false;
    }
  }

  // Cache operations
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis GET failed', { key, error });
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    try {
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error('Redis SET failed', { key, error });
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error('Redis DEL failed', { key, error });
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      logger.error('Redis EXISTS failed', { key, error });
      return false;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result;
    } catch (error) {
      logger.error('Redis EXPIRE failed', { key, ttlSeconds, error });
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error('Redis TTL failed', { key, error });
      return -1;
    }
  }

  // JSON operations
  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const value = await this.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis JSON GET failed', { key, error });
      return null;
    }
  }

  async setJSON<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    try {
      const jsonString = JSON.stringify(value);
      return await this.set(key, jsonString, ttlSeconds);
    } catch (error) {
      logger.error('Redis JSON SET failed', { key, error });
      return false;
    }
  }

  // Hash operations
  async hGet(key: string, field: string): Promise<string | null> {
    try {
      return (await this.client.hGet(key, field)) ?? null;
    } catch (error) {
      logger.error('Redis HGET failed', { key, field, error });
      return null;
    }
  }

  async hSet(key: string, field: string, value: string): Promise<boolean> {
    try {
      await this.client.hSet(key, field, value);
      return true;
    } catch (error) {
      logger.error('Redis HSET failed', { key, field, error });
      return false;
    }
  }

  async hGetAll(key: string): Promise<Record<string, string> | null> {
    try {
      return await this.client.hGetAll(key);
    } catch (error) {
      logger.error('Redis HGETALL failed', { key, error });
      return null;
    }
  }

  async hDel(key: string, field: string): Promise<boolean> {
    try {
      const result = await this.client.hDel(key, field);
      return result > 0;
    } catch (error) {
      logger.error('Redis HDEL failed', { key, field, error });
      return false;
    }
  }

  // List operations
  async lPush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.lPush(key, values);
    } catch (error) {
      logger.error('Redis LPUSH failed', { key, error });
      return 0;
    }
  }

  async rPush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.rPush(key, values);
    } catch (error) {
      logger.error('Redis RPUSH failed', { key, error });
      return 0;
    }
  }

  async lPop(key: string): Promise<string | null> {
    try {
      return await this.client.lPop(key);
    } catch (error) {
      logger.error('Redis LPOP failed', { key, error });
      return null;
    }
  }

  async rPop(key: string): Promise<string | null> {
    try {
      return await this.client.rPop(key);
    } catch (error) {
      logger.error('Redis RPOP failed', { key, error });
      return null;
    }
  }

  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.lRange(key, start, stop);
    } catch (error) {
      logger.error('Redis LRANGE failed', { key, start, stop, error });
      return [];
    }
  }

  async lLen(key: string): Promise<number> {
    try {
      return await this.client.lLen(key);
    } catch (error) {
      logger.error('Redis LLEN failed', { key, error });
      return 0;
    }
  }

  // Set operations
  async sAdd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sAdd(key, members);
    } catch (error) {
      logger.error('Redis SADD failed', { key, error });
      return 0;
    }
  }

  async sRem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sRem(key, members);
    } catch (error) {
      logger.error('Redis SREM failed', { key, error });
      return 0;
    }
  }

  async sMembers(key: string): Promise<string[]> {
    try {
      return await this.client.sMembers(key);
    } catch (error) {
      logger.error('Redis SMEMBERS failed', { key, error });
      return [];
    }
  }

  async sIsMember(key: string, member: string): Promise<boolean> {
    try {
      return await this.client.sIsMember(key, member);
    } catch (error) {
      logger.error('Redis SISMEMBER failed', { key, member, error });
      return false;
    }
  }

  // Pattern matching
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Redis KEYS failed', { pattern, error });
      return [];
    }
  }

  // Batch operations
  async mGet(...keys: string[]): Promise<(string | null)[]> {
    try {
      return await this.client.mGet(keys);
    } catch (error) {
      logger.error('Redis MGET failed', { keys, error });
      return new Array(keys.length).fill(null);
    }
  }

  async mSet(keyValues: Record<string, string>): Promise<boolean> {
    try {
      await this.client.mSet(keyValues);
      return true;
    } catch (error) {
      logger.error('Redis MSET failed', { keyValues, error });
      return false;
    }
  }

  async lTrim(key: string, start: number, stop: number): Promise<boolean> {
    try {
      await this.client.lTrim(key, start, stop);
      return true;
    } catch (error) {
      logger.error('Redis LTRIM failed', { key, start, stop, error });
      return false;
    }
  }

  // Utility methods
  getClient(): RedisClientType {
    return this.client;
  }

  isHealthy(): boolean {
    return this.isConnected;
  }
}

// Create singleton instance
const redisClient = new RedisClient();

// Graceful shutdown
process.on('beforeExit', async () => {
  logger.info('Disconnecting from Redis...');
  await redisClient.disconnect();
});

export { redisClient };
export default redisClient;