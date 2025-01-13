const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

exports.sendActivationToken = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email' });
    }

    if (user.emailActivated) {
      return res.status(400).json({ message: 'Email already activated' });
    }

    // Generate activation token
    const activationToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Nodemailer setup
    const transporter = nodemailer.createTransport({
      service: 'gmail', // Or your preferred email service
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Email options
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Email Activation Required',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
          <h2 style="color: #4CAF50; text-align: center;">Activate Your Email</h2>
          <p style="font-size: 16px; color: #333;">Dear ${user.name || 'User'},</p>
          <p style="font-size: 16px; color: #333;">Click the button below to activate your email. The link will expire in 1 hour.</p>
          <a href="${process.env.FRONTEND_URL}/activate-email/${activationToken}" 
             style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #4CAF50; color: #fff; text-decoration: none; border-radius: 5px;">
            Activate Email
          </a>
          <p style="font-size: 16px; color: #333; margin-top: 20px;">If you did not request this, please ignore this email.</p>
          <p style="font-size: 16px; color: #333;">Best Regards,<br/>The Team</p>
        </div>
      `,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    res.json({ message: 'Activation email sent successfully' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ message: 'Server error during email token generation' });
  }
};

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