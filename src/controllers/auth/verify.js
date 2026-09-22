const logger = require('../../config/logger');
const verifyToken = async (req, res) => {
  // The protect middleware has already verified the token and set req.user
  // Just return the user data that the frontend needs
  
  logger.info('✅ [Verify] User verified:', req.user.email, 'Role:', req.user.role);

  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role,
      name: req.user.name,
      emailActivated: req.user.emailActivated,
      createdAt: req.user.createdAt
    },
    role: req.user.role, // Include role at root level for backward compatibility
    message: 'Token verified successfully'
  });
};

const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      _id: req.user._id,
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      emailActivated: req.user.emailActivated,
      googleId: req.user.googleId,
      createdAt: req.user.createdAt
    }
  });
};

module.exports = { verifyToken, getMe };