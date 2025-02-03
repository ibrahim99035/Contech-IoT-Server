const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { SubscriptionPlan, Subscription } = require('../../models/subscriptionSystemModels');
const activationEmailTemplate = require('../../utils/activationEmailTemplate'); // Import the template

// User Registration
exports.registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    // Check if the user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Check if the role is admin
    if (role === 'admin') {
      return res.status(403).json({ message: 'Unauthorized: cannot assign admin role' });
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

    console.log(process.env.EMAIL_PASS,);

    // Nodemailer setup
    const transporter = nodemailer.createTransport({
      service: 'gmail', // Or your preferred email service
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      debug: true, // Enable debug mode
      logger: true, // Log the process to console
  
    });

    // Prepare email content using the template
    const emailContent = activationEmailTemplate(user, activationToken);

    // Email options
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Email Activation Required',
      html: emailContent,
    };

    // Send activation email
    await transporter.sendMail(mailOptions);

    res.status(201).json({ message: 'User registered successfully. Activation email sent.' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ message: 'Server error during registration' });
  }
};