import redisClient from '../lib/redis';
import { logger } from './logger';

// Cache key prefixes
export const CACHE_KEYS = {
  USER: 'user',
  MEETING: 'meeting',
  TRANSCRIPT: 'transcript',
  SUMMARY: 'summary',
  SESSION: 'session',
  PLATFORM_TOKEN: 'platform_token',
  RATE_LIMIT: 'rate_limit',
  ANALYTICS: 'analytics',
} as const;

// Cache TTL values (in seconds)
export const CACHE_TTL = {
  SHORT: 300,      // 5 minutes
  MEDIUM: 1800,    // 30 minutes
  LONG: 3600,      // 1 hour
  VERY_LONG: 86400, // 24 hours
  SESSION: 604800,  // 7 days
} as const;

/**
 * Generate cache key with prefix
 */
export function generateCacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}:${parts.join(':')}`;
}

/**
 * Cache wrapper for database queries
 */
export async function cacheQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  ttl: number = CACHE_TTL.MEDIUM
): Promise<T> {
  try {
    // Try to get from cache first
    const cached = await redisClient.getJSON<T>(key);
    if (cached !== null) {
      logger.debug('Cache hit', { key });
      return cached;
    }

    // Cache miss - execute query
    logger.debug('Cache miss', { key });
    const result = await queryFn();

    // Store in cache
    await redisClient.setJSON(key, result, ttl);
    logger.debug('Cache set', { key, ttl });

    return result;
  } catch (error) {
    logger.error('Cache operation failed', { key, error });
    // Fallback to direct query if cache fails
    return await queryFn();
  }
}

/**
 * Invalidate cache by pattern
 */
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await Promise.all(keys.map(key => redisClient.del(key)));
      logger.info('Cache invalidated', { pattern, keysCount: keys.length });
    }
  } catch (error) {
    logger.error('Cache invalidation failed', { pattern, error });
  }
}

/**
 * User cache operations
 */
export const userCache = {
  get: async (userId: string) => {
    const key = generateCacheKey(CACHE_KEYS.USER, userId);
    return await redisClient.getJSON(key);
  },

  set: async (userId: string, userData: any, ttl: number = CACHE_TTL.LONG) => {
    const key = generateCacheKey(CACHE_KEYS.USER, userId);
    return await redisClient.setJSON(key, userData, ttl);
  },

  invalidate: async (userId: string) => {
    const key = generateCacheKey(CACHE_KEYS.USER, userId);
    return await redisClient.del(key);
  },

  invalidateAll: async () => {
    const pattern = generateCacheKey(CACHE_KEYS.USER, '*');
    return await invalidateCache(pattern);
  },
};

/**
 * Meeting cache operations
 */
export const meetingCache = {
  get: async (meetingId: string) => {
    const key = generateCacheKey(CACHE_KEYS.MEETING, meetingId);
    return await redisClient.getJSON(key);
  },

  set: async (meetingId: string, meetingData: any, ttl: number = CACHE_TTL.MEDIUM) => {
    const key = generateCacheKey(CACHE_KEYS.MEETING, meetingId);
    return await redisClient.setJSON(key, meetingData, ttl);
  },

  invalidate: async (meetingId: string) => {
    const key = generateCacheKey(CACHE_KEYS.MEETING, meetingId);
    return await redisClient.del(key);
  },

  invalidateUserMeetings: async (userId: string) => {
    const pattern = generateCacheKey(CACHE_KEYS.MEETING, 'user', userId, '*');
    return await invalidateCache(pattern);
  },

  getUserMeetings: async (userId: string, page: number = 1) => {
    const key = generateCacheKey(CACHE_KEYS.MEETING, 'user', userId, 'page', page);
    return await redisClient.getJSON(key);
  },

  setUserMeetings: async (userId: string, page: number, meetings: any, ttl: number = CACHE_TTL.SHORT) => {
    const key = generateCacheKey(CACHE_KEYS.MEETING, 'user', userId, 'page', page);
    return await redisClient.setJSON(key, meetings, ttl);
  },
};

/**
 * Session cache operations
 */
export const sessionCache = {
  get: async (sessionId: string) => {
    const key = generateCacheKey(CACHE_KEYS.SESSION, sessionId);
    return await redisClient.getJSON(key);
  },

  set: async (sessionId: string, sessionData: any, ttl: number = CACHE_TTL.SESSION) => {
    const key = generateCacheKey(CACHE_KEYS.SESSION, sessionId);
    return await redisClient.setJSON(key, sessionData, ttl);
  },

  invalidate: async (sessionId: string) => {
    const key = generateCacheKey(CACHE_KEYS.SESSION, sessionId);
    return await redisClient.del(key);
  },

  extend: async (sessionId: string, ttl: number = CACHE_TTL.SESSION) => {
    const key = generateCacheKey(CACHE_KEYS.SESSION, sessionId);
    return await redisClient.expire(key, ttl);
  },
};

/**
 * Platform token cache operations
 */
export const platformTokenCache = {
  get: async (userId: string, platform: string) => {
    const key = generateCacheKey(CACHE_KEYS.PLATFORM_TOKEN, userId, platform);
    return await redisClient.getJSON(key);
  },

  set: async (userId: string, platform: string, tokenData: any, ttl: number = CACHE_TTL.LONG) => {
    const key = generateCacheKey(CACHE_KEYS.PLATFORM_TOKEN, userId, platform);
    return await redisClient.setJSON(key, tokenData, ttl);
  },

  invalidate: async (userId: string, platform: string) => {
    const key = generateCacheKey(CACHE_KEYS.PLATFORM_TOKEN, userId, platform);
    return await redisClient.del(key);
  },

  invalidateUser: async (userId: string) => {
    const pattern = generateCacheKey(CACHE_KEYS.PLATFORM_TOKEN, userId, '*');
    return await invalidateCache(pattern);
  },
};

/**
 * Rate limiting operations
 */
export const rateLimitCache = {
  increment: async (identifier: string, windowMs: number, maxRequests: number) => {
    const key = generateCacheKey(CACHE_KEYS.RATE_LIMIT, identifier);
    const windowSeconds = Math.ceil(windowMs / 1000);
    
    try {
      const current = await redisClient.get(key);
      const count = current ? parseInt(current, 10) : 0;
      
      if (count >= maxRequests) {
        const ttl = await redisClient.ttl(key);
        return {
          allowed: false,
          count: count + 1,
          resetTime: Date.now() + (ttl * 1000),
        };
      }
      
      if (count === 0) {
        await redisClient.set(key, '1', windowSeconds);
      } else {
        await redisClient.getClient().incr(key);
      }
      
      const ttl = await redisClient.ttl(key);
      return {
        allowed: true,
        count: count + 1,
        resetTime: Date.now() + (ttl * 1000),
      };
    } catch (error) {
      logger.error('Rate limit check failed', { identifier, error });
      // Allow request if cache fails
      return {
        allowed: true,
        count: 1,
        resetTime: Date.now() + windowMs,
      };
    }
  },

  reset: async (identifier: string) => {
    const key = generateCacheKey(CACHE_KEYS.RATE_LIMIT, identifier);
    return await redisClient.del(key);
  },
};

/**
 * Analytics cache operations
 */
export const analyticsCache = {
  get: async (metric: string, period: string) => {
    const key = generateCacheKey(CACHE_KEYS.ANALYTICS, metric, period);
    return await redisClient.getJSON(key);
  },

  set: async (metric: string, period: string, data: any, ttl: number = CACHE_TTL.MEDIUM) => {
    const key = generateCacheKey(CACHE_KEYS.ANALYTICS, metric, period);
    return await redisClient.setJSON(key, data, ttl);
  },

  invalidate: async (metric?: string) => {
    const pattern = metric 
      ? generateCacheKey(CACHE_KEYS.ANALYTICS, metric, '*')
      : generateCacheKey(CACHE_KEYS.ANALYTICS, '*');
    return await invalidateCache(pattern);
  },
};

/**
 * Real-time meeting operations
 */
export const meetingRealTimeCache = {
  addParticipant: async (meetingId: string, userId: string) => {
    const key = generateCacheKey('meeting_participants', meetingId);
    return await redisClient.sAdd(key, userId);
  },

  removeParticipant: async (meetingId: string, userId: string) => {
    const key = generateCacheKey('meeting_participants', meetingId);
    return await redisClient.sRem(key, userId);
  },

  getParticipants: async (meetingId: string) => {
    const key = generateCacheKey('meeting_participants', meetingId);
    return await redisClient.sMembers(key);
  },

  setMeetingStatus: async (meetingId: string, status: string, ttl: number = CACHE_TTL.LONG) => {
    const key = generateCacheKey('meeting_status', meetingId);
    return await redisClient.set(key, status, ttl);
  },

  getMeetingStatus: async (meetingId: string) => {
    const key = generateCacheKey('meeting_status', meetingId);
    return await redisClient.get(key);
  },
};