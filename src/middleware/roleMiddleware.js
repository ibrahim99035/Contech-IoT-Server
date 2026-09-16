/**
 * Role-based Authorization Middleware
 * Restricts access to specific user roles.
 * @module middleware/roleMiddleware
 */

const logger = require('../config/logger');

/**
 * Middleware factory that restricts route access to specified roles.
 * @param {...string} roles - Allowed roles (e.g., 'admin', 'moderator')
 * @returns {Function} Express middleware function
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        code: 'UNAUTHORIZED'
      });
    }

    if (!req.user.role) {
      logger.warn('User missing role information', { userId: req.user._id });
      return res.status(401).json({
        success: false,
        message: 'User missing role information',
        code: 'NO_ROLE'
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Insufficient permissions', {
        userId: req.user._id,
        userRole: req.user.role,
        requiredRoles: roles
      });
      return res.status(403).json({
        success: false,
        message: 'Access forbidden: Insufficient permissions',
        code: 'FORBIDDEN'
      });
    }

    next();
  };
};

module.exports = { authorizeRoles };