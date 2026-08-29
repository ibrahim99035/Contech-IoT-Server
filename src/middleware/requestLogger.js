/**
 * Request Logging Middleware
 * Logs method, path, status, duration, request id, and authenticated user id
 * for every request. Wires the request id into the logger context so all
 * downstream log lines are traceable to a single request.
 * @module middleware/requestLogger
 */

const { childLogger } = require('../config/logger');

/**
 * Middleware that attaches a request-bound logger to req and logs completion.
 */
function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  // Attach a child logger with request context to the request object
  const requestId = req.id;
  const log = childLogger({ requestId, ip: req.ip, method: req.method, url: req.originalUrl });
  req.log = log;

  // Log request start at debug level
  log.debug('request started');

  // Attach user id once authentication middleware has populated req.user
  const originalEmit = res.emit;
  res.emit = function (event, ...args) {
    if (event === 'finish' && req.user && req.user._id && !req.log.meta) {
      log.defaultMeta = log.defaultMeta || {};
      log.defaultMeta.userId = String(req.user._id);
    }
    return originalEmit.call(this, event, ...args);
  };

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - startedAt;
    const durationMs = Number(durationNs) / 1e6;

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[level]('request completed', {
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: req.user && req.user._id ? String(req.user._id) : undefined
    });
  });

  next();
}

module.exports = requestLogger;