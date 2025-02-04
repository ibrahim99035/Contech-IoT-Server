const redis = require('redis');
const redisClient = redis.createClient();

exports.rateLimiter = async (userId, action, limit = 10, duration = 60) => {
  const key = `rate:${userId}:${action}`;
  const current = await redisClient.incr(key);
  if (current === 1) await redisClient.expire(key, duration);
  if (current > limit) throw new Error('Too many requests, slow down.');
};