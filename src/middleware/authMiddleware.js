const jwt = require('jsonwebtoken');
const User = require('../models/User');
const dotenv = require('dotenv');

dotenv.config();

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            console.log(`🔐 [Auth Middleware] Token received: ${token.substring(0, 20)}...`);
            
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log(`✅ [Auth Middleware] Token decoded successfully for user: ${decoded.userId || decoded.id}`);
            
            // FIXED: Check for both userId and id to handle different token formats
            const userId = decoded.userId || decoded.id;
            
            if (!userId) {
                console.error(`❌ [Auth Middleware] No user ID found in token payload`);
                return res.status(401).json({ message: 'Not authorized, invalid token format' });
            }
            
            req.user = await User.findById(userId).select('-password');
            
            if (!req.user) {
                console.error(`❌ [Auth Middleware] User not found for ID: ${userId}`);
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }
            
            console.log(`✅ [Auth Middleware] User authenticated: ${req.user.email}`);
            next();
        } catch (err) {
            console.error(`❌ [Auth Middleware] Token verification failed:`, err.message);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else {
        console.error(`❌ [Auth Middleware] No authorization header found`);
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

module.exports = { protect };