const express = require('express');

const { registerUser } = require('../controllers/auth/register');
const { loginUser } = require('../controllers/auth/login');
const { updatePassword, forgotPassword, resetPassword } = require('../controllers/auth/passwordHandler');
const { sendActivationToken, activateEmailWithToken } = require('../controllers/auth/emailActivation');
const { deleteMyAccount } = require('../controllers/auth/deleteMyAccount');

// UPDATED: Import modern Google auth functions
const { modernGoogleLogin, checkGoogleLink, unlinkGoogle } = require('../controllers/auth/googleAuth');

const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const requireVerifiedEmail = require('../middleware/emailVerification');

const router = express.Router();

// Logging middleware for OAuth routes
const logOAuthRequest = (req, res, next) => {
  console.log(`🔐 [OAuth Request] ${req.method} ${req.originalUrl}`);
  console.log(`🔐 [OAuth Headers] User-Agent: ${req.get('User-Agent')}`);
  console.log(`🔐 [OAuth IP] ${req.ip}`);
  console.log(`🔐 [OAuth Content-Type] ${req.get('Content-Type')}`);
  if (req.body && Object.keys(req.body).length > 0) {
    const safeBody = { ...req.body };
    if (safeBody.access_token) {
      console.log(`🔑 [OAuth] Access token length: ${safeBody.access_token.length}`);
      console.log(`🔑 [OAuth] Access token starts with: ${safeBody.access_token.substring(0, 20)}...`);
      safeBody.access_token = '***REDACTED***';
    }
    if (safeBody.id_token) {
      console.log(`🆔 [OAuth] ID token length: ${safeBody.id_token.length}`);
      console.log(`🆔 [OAuth] ID token starts with: ${safeBody.id_token.substring(0, 20)}...`);
      safeBody.id_token = '***REDACTED***';
    }
    console.log(`🔐 [OAuth Body]`, safeBody);
  }
  next();
};

// Standard authentication routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.delete('/delete-account', protect, deleteMyAccount);

router.put('/activate-email', activateEmailWithToken);
router.post('/activation-token', sendActivationToken);

router.put('/update-password', protect, updatePassword);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password', resetPassword);

// UPDATED: Modern Google OAuth Routes (no Passport dependency)
router.post(
  '/google', 
  logOAuthRequest,
  modernGoogleLogin  // Direct function call, no Passport middleware
);

// Google account management (requires authentication)
router.get('/google/status', protect, logOAuthRequest, checkGoogleLink);
router.delete('/google/unlink', protect, logOAuthRequest, unlinkGoogle);

module.exports = router;