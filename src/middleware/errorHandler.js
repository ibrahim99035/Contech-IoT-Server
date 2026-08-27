/**
 * Centralized Error Handler Middleware
 * Catches all unhandled errors and returns consistent, safe responses.
 * @module middleware/errorHandler
 */

const logger = require('../config/logger');

/**
 * Custom operational error class for known, expected errors.
 * These are safe to show to the client.
 */
class AppError extends Error {
  /**
   * @param {string} message - Error message (client-visible)
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Machine-readable error code
   */
  constructor(message, statusCode = 500, code = 'SERVER_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Express error handling middleware.
 * Must be registered LAST in the middleware chain (4-argument signature).
 */
function errorHandler(err, req, res, _next) {
  // Log the error with request context
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    requestId: req.id
  });

  // Operational errors (AppError) — safe to return to client
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code
    });
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      code: 'VALIDATION_ERROR',
      errors: messages
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}`,
      code: 'DUPLICATE_KEY'
    });
  }

  // Mongoose cast error (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
      code: 'INVALID_ID'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      code: 'TOKEN_EXPIRED'
    });
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'File too large',
      code: 'FILE_TOO_LARGE'
    });
  }

  // Default — never leak internal details in production
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    success: false,
    message: isProduction ? 'Internal server error' : err.message,
    code: 'SERVER_ERROR'
  });
}

module.exports = { errorHandler, AppError };