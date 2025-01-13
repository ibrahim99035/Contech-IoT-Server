const User = require('../../models/User');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const generateToken = require('../../utils/generateToken');

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

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

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      active: true,
      emailActivated: false,
    });

    await user.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration' });
  }
};