const jwt = require('jsonwebtoken');
const User = require('../models/User');
const dotenv = require('dotenv');

dotenv.config();

const protect = async (req, res, next) => {
  try {
    let token;
    
    // Extract token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        message: 'No token provided'
      });
    }

    console.log('🔐 [Auth Middleware] Token received:', token.substring(0, 20) + '...');

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ [Auth Middleware] Token decoded successfully for user:', decoded.id);

    // CRITICAL: Actually fetch the user and set req.user
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      console.log('❌ [Auth Error] User not found:', decoded.id);
      return res.status(401).json({
        message: 'User not found'
      });
    }

    // IMPORTANT: Make sure the user object has a role property
    if (!user.role) {
      console.log('❌ [Auth Error] User has no role:', user);
      return res.status(401).json({
        message: 'User role not defined'
      });
    }

    // Set req.user with the complete user object
    req.user = user;
    console.log('✅ [Auth Middleware] User authenticated:', user.email, 'Role:', user.role);
    
    next();
  } catch (error) {
    console.log('❌ [Auth Error]:', error.message);
    return res.status(401).json({
      message: 'Invalid token',
      error: error.message
    });
  }
};

module.exports = { protect };