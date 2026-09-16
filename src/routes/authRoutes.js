const express = require('express');

const { registerUser } = require('../controllers/auth/register');
const { loginUser } = require('../controllers/auth/login');
const { updatePassword, forgotPassword, resetPassword } = require('../controllers/auth/passwordHandler');
const { sendActivationToken, activateEmailWithToken } = require('../controllers/auth/emailActivation');
const { deleteMyAccount } = require('../controllers/auth/deleteMyAccount');
const { verifyToken } = require('../controllers/auth/verify')

// UPDATED: Import modern Google auth functions
const { modernGoogleLogin, checkGoogleLink, unlinkGoogle } = require('../controllers/auth/googleAuth');

// NEW: Import OAuth2 handlers
const { 
  oauthAuthorize,
  oauthToken,
  googleOAuthCallback
} = require('../controllers/auth/oauthHandler');

const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const requireVerifiedEmail = require('../middleware/emailVerification');
const logger = require('../config/logger');

const router = express.Router();

// Logging middleware for OAuth routes — never logs tokens or their content
const logOAuthRequest = (req, res, next) => {
  const hasToken = Boolean(req.body && (req.body.access_token || req.body.id_token));
  logger.debug('OAuth request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    contentType: req.get('Content-Type'),
    hasCredentials: hasToken
  });
  next();
};

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, example: "John Doe" }
 *               email: { type: string, example: "john@example.com" }
 *               password: { type: string, example: "SecretPassword123" }
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid input or user already exists
 * 
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "john@example.com" }
 *               password: { type: string, example: "SecretPassword123" }
 *     responses:
 *       200:
 *         description: Login successful, returns JWT token
 *       401:
 *         description: Invalid credentials
 * 
 * /api/auth/verify:
 *   get:
 *     summary: Verify JWT authentication token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *       401:
 *         description: Invalid or expired token
 */

// Standard authentication routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.delete('/delete-account', protect, deleteMyAccount);

router.put('/activate-email', activateEmailWithToken);
router.post('/activation-token', sendActivationToken);

router.put('/update-password', protect, updatePassword);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password', resetPassword);

router.get('/verify', protect, verifyToken);

// Google OAuth Routes (for web/mobile)
router.post('/google', logOAuthRequest, modernGoogleLogin);
router.get('/google/status', protect, logOAuthRequest, checkGoogleLink);
router.delete('/google/unlink', protect, logOAuthRequest, unlinkGoogle);

// NEW: OAuth2 Routes for Google Assistant Account Linking
router.get('/oauth/authorize', logOAuthRequest, oauthAuthorize);
router.post('/oauth/token', logOAuthRequest, oauthToken);
router.get('/google/callback', googleOAuthCallback);

module.exports = router;