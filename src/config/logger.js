/**
 * Centralized Logger Configuration
 * Uses Winston for structured, leveled logging.
 * Provides:
 *  - Env-driven level & transports (LOG_LEVEL, LOG_DIR, LOG_TO_CONSOLE)
 *  - Structured JSON in production, colorized pretty in development
 *  - File rotation for error and combined logs
 *  - Request-aware logging via child loggers (use childLogger({ requestId, userId }))
 *  - A structured morgan stream (drops raw HTTP lines in favor of JSON fields)
 * @module config/logger
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
const LOG_LEVEL = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE !== 'false';
const LOG_TO_FILE = process.env.LOG_TO_FILE !== 'false';

// Ensure log directory exists before attaching file transports
if (LOG_TO_FILE && !fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const formats = {
  // Base: timestamp + error stack passthrough
  base: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.metadata({
      key: 'meta',
      fillExcept: ['message', 'level', 'timestamp', 'service']
    })
  ),
  // Pretty, colorized for development consoles
  pretty: winston.format.combine(
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, meta, stack }) => {
      const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      const stackStr = stack ? `\n${stack}` : '';
      return `${timestamp} [${level}] ${message}${metaStr}${stackStr}`;
    })
  ),
  // Structured JSON for files & production consoles
  json: winston.format.json()
};

const transports = [];

if (LOG_TO_CONSOLE) {
  transports.push(
    new winston.transports.Console({
      level: LOG_LEVEL,
      format: isProduction ? formats.json : formats.pretty
    })
  );
}

if (LOG_TO_FILE) {
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: formats.json,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: formats.json,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  );
}

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: formats.base,
  defaultMeta: { service: 'contech-iot' },
  transports,
  // Don't exit on uncaught exceptions — let the process handler deal with it
  exitOnError: false
});

/**
 * Create a child logger bound to request/correlation context.
 * Use in request handlers so every log line carries the same trace id.
 * @param {Object} context - e.g. { requestId, userId, ip }
 * @returns {import('winston').Logger}
 */
function childLogger(context = {}) {
  return logger.child(context);
}

/**
 * Stream for Morgan HTTP logging integration.
 * Parses morgan's tokenized line into structured fields instead of a raw string.
 */
logger.stream = {
  write: (line) => {
    // morgan 'combined' -> method url status resTime size remote
    const trimmed = line.trim();
    if (!trimmed) return;

    // Structured morgan format 'http-log' produces JSON when configured.
    // If it's already JSON (production), pass through; otherwise log debug.
    try {
      const parsed = JSON.parse(trimmed);
      logger.http('http request', { ...parsed });
      return;
    } catch (_) {
      // fall back to raw line at debug level
      logger.debug(trimmed);
    }
  }
};

module.exports = logger;
module.exports.childLogger = childLogger;