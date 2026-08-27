/**
 * Centralized Redis Client Configuration
 * Manages connection lifecycle and provides graceful fallbacks if Redis is unavailable.
 * @module config/redis
 */

const redis = require('redis');
const logger = require('./logger');

let client = null;
let isConnecting = false;

/**
 * Get Redis connection options suitable for BullMQ / IORedis
 * @returns {Object} Connection options
 */
function getRedisConnectionOptions() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname || 'localhost',
      port: parseInt(url.port || '6379', 10),
      password: url.password || undefined,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false
    };
  } catch (err) {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    };
  }
}

/**
 * Get or initialize the Redis client instance.
 * @returns {Promise<import('redis').RedisClientType|null>} Connected Redis client or null if unavailable
 */
async function getRedisClient() {
  if (client && client.isOpen) {
    return client;
  }

  if (isConnecting) {
    // Wait for in-flight connection
    await new Promise(resolve => setTimeout(resolve, 500));
    return client && client.isOpen ? client : null;
  }

  isConnecting = true;

  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    client = redis.createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 2) return false; // Stop reconnecting after 2 attempts
          return 1000;
        }
      }
    });

    client.on('error', (err) => {
      // Quiet error logging during graceful fallback
    });

    client.on('connect', () => {
      logger.info('Connected to Redis');
    });

    await client.connect();
    isConnecting = false;
    return client;
  } catch (error) {
    logger.warn('Failed to connect to Redis, proceeding with in-memory fallbacks', { error: error.message });
    if (client) {
      try { await client.disconnect(); } catch (_) {}
    }
    client = null;
    isConnecting = false;
    return null;
  }
}

module.exports = { getRedisClient, getRedisConnectionOptions };
