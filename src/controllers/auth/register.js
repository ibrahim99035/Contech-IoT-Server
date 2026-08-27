/**
 * User Registration Controller
 * @module controllers/auth/register
 */

const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const { SubscriptionPlan, Subscription } = require('../../models/subscriptionSystemModels');
const activationEmailTemplate = require('../../utils/activationEmailTemplate');
const { sendEmail } = require('../../utils/emailService');
const logger = require('../../config/logger');

// User Registration
exports.registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    // Check if the user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'User already exists',
        code: 'USER_EXISTS'
      });
    }

    // Check if the role is admin
    if (role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: cannot assign admin role',
        code: 'FORBIDDEN'
      });
    }

    // Create new user
    user = new User({
      name,
      email,
      password: password,
      role,
      active: true,
      emailActivated: false,
    });

    await user.save();

    // Find or create the "free" subscription plan
    let subscriptionPlan = await SubscriptionPlan.findOne({ name: 'free' });
    if (!subscriptionPlan) {
      subscriptionPlan = new SubscriptionPlan({
        name: 'free',
        price: 0,
        billingCycle: 'monthly',
        features: ['Basic support'],
      });
      await subscriptionPlan.save();
    }

    // Create subscription for the user
    const subscription = new Subscription({
      user: user._id,
      subscriptionPlan: subscriptionPlan._id,
      status: 'active',
      startDate: new Date(),
    });

    await subscription.save();

    // Generate email activation token
    const activationToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Prepare and send activation email
    const emailContent = activationEmailTemplate(user, activationToken);

    try {
      await sendEmail({
        to: user.email,
        subject: 'Email Activation Required',
        html: emailContent,
      });
    } catch (emailError) {
      logger.error('Failed to send activation email', {
        userId: user._id,
        error: emailError.message
      });
      // User is created but email failed — don't fail registration
    }

    logger.info('User registered successfully', { userId: user._id, email: user.email });

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Activation email sent.'
    });
  } catch (error) {
    logger.error('Registration error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      code: 'SERVER_ERROR'
    });
  }
};