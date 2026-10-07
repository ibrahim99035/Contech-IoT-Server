/**
 * Database Connection Configuration
 * Connects to MongoDB with retry logic and connection event handlers.
 * @module config/db
 */

const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Connect to MongoDB with retry logic.
 * @param {number} retries - Number of connection attempts
 * @param {number} delay - Delay between retries in ms
 */
const connectDB = async (retries = 5, delay = 5000) => {
  let mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/contech';

  // The database host is reached over a WAN link (~260ms RTT) and its TCP
  // connection is dropped by the far side every ~80s. With the driver defaults
  // that turns into a hard failure: the dead socket is only noticed after
  // ~10s, the operation then waits out its 10s bufferTimeoutMS, and the request
  // 500s even though the reconnect completes a few seconds later.
  //
  // These options make the driver recover inside that window instead of
  // surfacing it to callers:
  //   heartbeatFrequencyMS - notice a dead socket in ~2-3s, not ~10s
  //   bufferTimeoutMS      - let a queued operation wait out the ~8s reconnect
  //                          and then run, rather than timing out at exactly
  //                          the moment the connection comes back
  //   keepAliveInitialDelay - probe an apparently idle socket every 5s so the
  //                          far side has less reason to reap it
  //
  // NB: `keepAlive` itself is a URI-level option in mongodb driver 6.x and is
  // rejected if passed here, so it is left to the driver default (enabled).
  const driverOptions = {
    heartbeatFrequencyMS: 2000,
    bufferTimeoutMS: 20000,
    serverSelectionTimeoutMS: 15000,
    keepAliveInitialDelay: 5000,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(mongoUri, driverOptions);
      logger.info('Connected to MongoDB successfully');

      // Connection event handlers
      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected. Attempting reconnection...');
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected successfully');
      });

      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error', { error: err.message });
      });

      return;
    } catch (error) {
      logger.error(`MongoDB connection attempt ${attempt}/${retries} failed`, {
        error: error.message
      });

      // Development-only convenience fallbacks. In production these are unsafe:
      // an auth failure could silently switch to an *unauthenticated* local
      // database, hiding a real outage. Only apply them outside production, so
      // production stays fail-fast and exits after the retries below.
      if (process.env.NODE_ENV !== 'production') {
        if (error.message.includes('ENOTFOUND') && mongoUri.includes('@mongodb:')) {
          mongoUri = mongoUri.replace('@mongodb:', '@127.0.0.1:');
          logger.info(`Host 'mongodb' unresolved. Switching URI to 127.0.0.1...`);
        } else if ((error.message.includes('Authentication failed') || error.message.includes('auth failed')) && mongoUri.includes('@')) {
          mongoUri = 'mongodb://127.0.0.1:27017/contech';
          logger.info(`MongoDB auth failed locally. Falling back to unauthenticated local connection: ${mongoUri}`);
        }
      }

      if (attempt < retries) {
        logger.info(`Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logger.error('FATAL: Could not connect to MongoDB after all retries. Exiting.');
  process.exit(1);
};

module.exports = connectDB;