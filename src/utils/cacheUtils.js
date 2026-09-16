/**
 * Cache Utilities
 * High-performance caching helper with Redis backend and graceful fallback.
 * @module utils/cacheUtils
 */

const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

const inMemoryCache = new Map();

/**
 * Invalidate a cache key
 * @param {string} key
 */
async function invalidateCache(key) {
  try {
    const redisClient = await getRedisClient();
    if (redisClient) {
      await redisClient.del(key);
    }
  } catch (error) {
    logger.error('Cache invalidation error', { key, error: error.message });
  }
  inMemoryCache.delete(key);
}

/**
 * Get item from cache
 * @param {string} key
 */
async function getCache(key) {
  try {
    const redisClient = await getRedisClient();
    if (redisClient) {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    }
  } catch (error) {
    logger.error('Cache get error', { key, error: error.message });
  }
  return inMemoryCache.get(key) || null;
}

/**
 * Set item in cache with TTL in seconds
 * @param {string} key
 * @param {*} value
 * @param {number} ttlSeconds
 */
async function setCache(key, value, ttlSeconds = 300) {
  try {
    const redisClient = await getRedisClient();
    if (redisClient) {
      await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
      return;
    }
  } catch (error) {
    logger.error('Cache set error', { key, error: error.message });
  }
  inMemoryCache.set(key, value);
}

module.exports = { getCache, setCache, invalidateCache };
