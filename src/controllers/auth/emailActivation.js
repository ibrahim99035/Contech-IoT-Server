const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

exports.sendActivationToken = async (req, res) => {
  try {
    // Input validation
    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid email' });
    }

    if (user.emailActivated) {
      return res.status(400).json({ message: 'Email already activated' });
    }

    // Check for environment variables
    if (!process.env.JWT_SECRET || !process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.FRONTEND_URL_TOKEN) {
      console.error('Missing required environment variables');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    // Generate activation token with email included as needed
    const activationToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Generate activation URL
    const activationUrl = `${process.env.FRONTEND_URL_TOKEN}/activate?token=${activationToken}`;

    // Nodemailer setup - disable debug in production
    const transporter = nodemailer.createTransport({
      service: 'gmail', // Or your preferred email service
      auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS,
      },
      debug: process.env.NODE_ENV === 'development', 
      logger: process.env.NODE_ENV === 'development'
    });

    // Make sure the template function is properly imported
    if (typeof activationEmailTemplate !== 'function') {
      console.error('Activation email template function is not defined');
      return res.status(500).json({ message: 'Server configuration error' });
    }
  
    // Prepare email content with the activation URL
    const emailContent = activationEmailTemplate(user, activationUrl);
  
    // Email options
    const mailOptions = {
      from: `"Contech IoT" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Email Activation Required',
      html: emailContent,
    };

    // Send email with better error handling
    try {
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      return res.status(500).json({ message: 'Failed to send activation email. Please try again later.' });
    }

    res.status(200).json({ message: 'Activation email sent successfully' });
  } catch (error) {
    console.error('Error in sendActivationToken controller:', error);
    res.status(500).json({ message: 'Server error during email token generation' });
  }
};

// Email validation helper function
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Email Activation (Verifies user email)
exports.activateEmailWithToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findOne({ _id: decoded.userId, email: decoded.email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid token or user does not exist' });
    }

    if (user.emailActivated) {
      return res.status(400).json({ message: 'Email already activated' });
    }

    // Activate email
    user.emailActivated = true;
    await user.save();

    res.json({ message: 'Email activated successfully' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ message: 'Activation token expired. Please request a new one.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({ message: 'Invalid activation token' });
    }

    console.error('Error:', error.message);
    res.status(500).json({ message: 'Server error during email activation' });
  }
};