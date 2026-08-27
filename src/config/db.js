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
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
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