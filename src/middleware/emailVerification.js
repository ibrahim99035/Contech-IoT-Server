/**
 * Email Verification Middleware
 * Prevents unverified users from accessing protected routes
 * @module middleware/emailVerification
 */

/**
 * Checks if the authenticated user's email is activated
 * @function requireVerifiedEmail
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object|Function} Returns error response or calls next middleware
 */
const requireVerifiedEmail = (req, res, next) => {
    // Check if user exists and is attached to the request
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
        code: 'UNAUTHORIZED'
      });
    }
  
    // Check if user's email is activated
    if (!req.user.emailActivated) {
      return res.status(403).json({
        success: false,
        message: 'Email not verified. Please verify your email before proceeding.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }
  
    // If user's email is verified, proceed to the next middleware
    next();
};
  
module.exports = requireVerifiedEmail;