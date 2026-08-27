/**
 * Password Management Controller
 * Handles password update, forgot password, and reset password flows.
 * @module controllers/auth/passwordHandler
 */

const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../../utils/emailService');
const logger = require('../../config/logger');

// Update Password
exports.updatePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Old password and new password are required',
      code: 'MISSING_FIELDS'
    });
  }

  try {
    const user = await User.findById(req.user._id);

    // Check if old password matches
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Old password is incorrect',
        code: 'WRONG_PASSWORD'
      });
    }

    user.password = newPassword;
    await user.save();

    logger.info('Password updated', { userId: user._id });

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    logger.error('Error updating password', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Error updating password',
      code: 'SERVER_ERROR'
    });
  }
};

// Forgot Password (Token generation for reset)
exports.forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      // Don't reveal whether email exists
      return res.json({
        success: true,
        message: 'If an account with that email exists, a reset link has been sent.'
      });
    }

    // Verify email if needed
    if (!user.emailActivated) {
      return res.status(400).json({
        success: false,
        message: 'Email is not verified. Please verify your email first.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    // Generate a reset token
    const resetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    // Send reset email using shared transporter
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      text: `You requested a password reset. Use the following token: ${resetToken}`,
      html: `<p>You requested a password reset.</p>
             <p>Use the following token:</p>
             <p><b>${resetToken}</b></p>
             <p>This token will expire in 10 minutes.</p>`,
    });

    logger.info('Password reset email sent', { userId: user._id });

    res.json({
      success: true,
      message: 'If an account with that email exists, a reset link has been sent.'
    });
  } catch (error) {
    logger.error('Forgot password error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.',
      code: 'SERVER_ERROR'
    });
  }
};

// Reset Password (with token)
exports.resetPassword = async (req, res) => {
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Reset token and new password are required',
      code: 'MISSING_FIELDS'
    });
  }

  try {
    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token or user not found',
        code: 'INVALID_TOKEN'
      });
    }

    user.password = newPassword;
    await user.save();

    logger.info('Password reset successfully', { userId: user._id });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({
        success: false,
        message: 'Reset token has expired. Please request a new one.',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset token',
        code: 'INVALID_TOKEN'
      });
    }

    logger.error('Reset password error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Error resetting password',
      code: 'SERVER_ERROR'
    });
  }
};
