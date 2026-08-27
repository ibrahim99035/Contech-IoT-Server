/**
 * Action Rate Limiter Utility
 * Limits user actions per time duration with Redis backend.
 * @module utils/rateLimiter
 */

const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

const inMemoryRates = new Map();

/**
 * Rate limit check for user actions.
 * @param {string} userId
 * @param {string} action
 * @param {number} limit - Maximum allowed requests in window
 * @param {number} duration - Window duration in seconds
 */
exports.rateLimiter = async (userId, action, limit = 10, duration = 60) => {
  const key = `rate:${userId}:${action}`;

  try {
    const redisClient = await getRedisClient();
    if (redisClient) {
      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, duration);
      }
      if (current > limit) {
        throw new Error('Too many requests, slow down.');
      }
      return;
    }
  } catch (error) {
    if (error.message === 'Too many requests, slow down.') {
      throw error;
    }
    logger.error('Redis rate limiter error, falling back to memory', { error: error.message });
  }

  // In-memory fallback
  const now = Date.now();
  const userRate = inMemoryRates.get(key) || { count: 0, expiresAt: now + duration * 1000 };

  if (now > userRate.expiresAt) {
    userRate.count = 1;
    userRate.expiresAt = now + duration * 1000;
  } else {
    userRate.count += 1;
  }

  inMemoryRates.set(key, userRate);

  if (userRate.count > limit) {
    throw new Error('Too many requests, slow down.');
  }
};