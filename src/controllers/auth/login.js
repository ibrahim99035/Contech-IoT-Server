/**
 * User Login Controller
 * @module controllers/auth/login
 */

const User = require('../../models/User');
const generateToken = require('../../utils/generateToken');
const logger = require('../../config/logger');

// User Login
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email and password are required',
            code: 'MISSING_CREDENTIALS'
        });
    }

    try {
        // Check if the user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Check if user account is active
        if (!user.active) {
            return res.status(403).json({
                success: false,
                message: 'Account is deactivated',
                code: 'ACCOUNT_DEACTIVATED'
            });
        }

        // Validate the password
        const isPasswordCorrect = await user.matchPassword(password);
        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Generate and send token
        const token = generateToken(user._id);

        logger.info('User logged in successfully', { userId: user._id });

        res.json({
            success: true,
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                emailActivated: user.emailActivated,
                token,
            }
        });
    } catch (err) {
        logger.error('Login error', { error: err.message });
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again later.',
            code: 'SERVER_ERROR'
        });
    }
};