const redis = require('redis');

const redisClient = redis.createClient();

const invalidateCache = (key) => redisClient.del(key);

module.exports = { redisClient, invalidateCache };
