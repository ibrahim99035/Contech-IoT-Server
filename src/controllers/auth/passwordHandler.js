const User = require('../../models/User');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;


// Update Password
exports.updatePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user._id);

    // Check if old password matches
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Old password is incorrect' });
    }

    user.password = newPassword;

    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating password' });
  }
};

// Forgot Password (Token generation for reset)
exports.forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(400).json({ message: 'User with this email does not exist' });
    }

    // Generate a reset token
    const resetToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '10m' });

    // Verify email if needed (optional step)
    if (!user.emailActivated) {
      return res.status(400).json({ message: 'Email is not verified. Please verify your email first.' });
    }

    // Nodemailer setup
    const transporter = nodemailer.createTransport({
      service: 'gmail', // Use a provider or SMTP configuration
      auth: {
        user: process.env.EMAIL_USER, // Environment variable for email address
        pass: process.env.EMAIL_PASS, // Environment variable for password or app-specific password
      },
    });

    // Email options
    const mailOptions = {
      from: process.env.EMAIL_USER, // Sender address
      to: user.email, // Recipient email
      subject: 'Password Reset Request',
      text: `You requested a password reset. Use the following token: ${resetToken}`,
      html: `<p>You requested a password reset.</p>
             <p>Use the following token:</p>
             <p><b>${resetToken}</b></p>
             <p>This token will expire in 10 minutes.</p>`,
    };

    // Send the email
    await transporter.sendMail(mailOptions);

    res.json({ message: 'Password reset email sent successfully' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ message: 'Internal server error. Please try again later.' });
  }
};

// Reset Password (with token)
exports.resetPassword = async (req, res) => {
  const { resetToken, newPassword } = req.body;

  try {
    const decoded = jwt.verify(resetToken, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(400).json({ message: 'Invalid token or user not found' });
    }

    user.password = newPassword;

    await user.save();
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error resetting password' });
  }
};
