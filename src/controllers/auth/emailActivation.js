/**
 * Email Activation Controller
 * Handles sending activation tokens and verifying email addresses.
 * @module controllers/auth/emailActivation
 */

const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const activationEmailTemplate = require('../../utils/activationEmailTemplate');
const { sendEmail } = require('../../utils/emailService');
const logger = require('../../config/logger');

// Email validation helper function
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

exports.sendActivationToken = async (req, res) => {
  try {
    // Input validation
    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
        code: 'INVALID_EMAIL'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.emailActivated) {
      return res.status(400).json({
        success: false,
        message: 'Email already activated',
        code: 'ALREADY_ACTIVATED'
      });
    }

    // Generate activation token
    const activationToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Generate activation URL
    const activationUrl = process.env.FRONTEND_URL_TOKEN
      ? `${process.env.FRONTEND_URL_TOKEN}/activate?token=${activationToken}`
      : activationToken;

    // Prepare email content
    const emailContent = activationEmailTemplate(user, activationUrl);

    // Send email using shared transporter
    try {
      await sendEmail({
        to: user.email,
        subject: 'Email Activation Required',
        html: emailContent,
      });
    } catch (emailError) {
      logger.error('Error sending activation email', { error: emailError.message, userId: user._id });
      return res.status(500).json({
        success: false,
        message: 'Failed to send activation email. Please try again later.',
        code: 'EMAIL_SEND_FAILED'
      });
    }

    logger.info('Activation email sent', { userId: user._id });

    res.status(200).json({
      success: true,
      message: 'Activation email sent successfully'
    });
  } catch (error) {
    logger.error('Error in sendActivationToken', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during email token generation',
      code: 'SERVER_ERROR'
    });
  }
};

// Email Activation (Verifies user email)
exports.activateEmailWithToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required',
        code: 'MISSING_TOKEN'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findOne({ _id: decoded.userId, email: decoded.email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token or user does not exist',
        code: 'INVALID_TOKEN'
      });
    }

    if (user.emailActivated) {
      return res.status(400).json({
        success: false,
        message: 'Email already activated',
        code: 'ALREADY_ACTIVATED'
      });
    }

    // Activate email
    user.emailActivated = true;
    await user.save();

    logger.info('Email activated successfully', { userId: user._id });

    res.json({
      success: true,
      message: 'Email activated successfully'
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({
        success: false,
        message: 'Activation token expired. Please request a new one.',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid activation token',
        code: 'INVALID_TOKEN'
      });
    }

    logger.error('Email activation error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during email activation',
      code: 'SERVER_ERROR'
    });
  }
};