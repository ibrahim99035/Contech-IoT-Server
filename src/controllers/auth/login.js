const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const generateToken = require('../../utils/generateToken');

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

if (!JWT_SECRET || !JWT_EXPIRES_IN) {
    console.error('Environment variables JWT_SECRET or JWT_EXPIRES_IN are not set.');
}

// User Login
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    console.log('Received login request:', { email, passwordHidden: !!password });

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        // Check if the user exists
        const user = await User.findOne({ email });
        if (!user) {
            console.warn(`No user found with email: ${email}`);
            return res.status(404).json({ message: 'User not found' });
        }

        console.log('User found:', { id: user._id, email: user.email });

        // Validate the password
        const isPasswordCorrect = await user.matchPassword(password);
        if (!isPasswordCorrect) {
            console.warn('Password mismatch for email:', email);
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Generate and send token
        const token = generateToken(user._id);
        console.log('Token generated successfully for user:', user._id);

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token,
        });
    } catch (err) {
        console.error('An error occurred during login:', {
            message: err.message,
            stack: err.stack,
        });
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
};