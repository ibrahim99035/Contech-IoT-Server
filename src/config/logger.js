/**
 * Centralized Logger Configuration
 * Uses Winston for structured, leveled logging.
 * @module config/logger
 */

const winston = require('winston');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true })
  ),
  defaultMeta: { service: 'contech-iot' },
  transports: [
    // Console transport — colorized in dev, JSON in prod
    new winston.transports.Console({
      format: isProduction
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} [${level}] ${message}${metaStr}`;
            })
          )
    }),

    // Error log file
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      format: winston.format.json(),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),

    // Combined log file
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      format: winston.format.json(),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  ],

  // Don't exit on uncaught exceptions — let the process handler deal with it
  exitOnError: false
});

// Stream for Morgan HTTP logging integration
logger.stream = {
  write: (message) => logger.http(message.trim())
};

module.exports = logger;
