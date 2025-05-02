const express = require('express');
const passport = require('../config/passport');

const { registerUser } = require('../controllers/auth/register');
const { loginUser } = require('../controllers/auth/login');
const { updatePassword, forgotPassword, resetPassword } = require('../controllers/auth/passwordHandler');
const { sendActivationToken, activateEmailWithToken } = require('../controllers/auth/emailActivation');
const { deleteMyAccount } = require('../controllers/auth/deleteMyAccount');
const { googleLogin, checkGoogleLink, unlinkGoogle } = require('../controllers/auth/googleAuth');

const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const requireVerifiedEmail = require('../middleware/emailVerification');

const router = express.Router();

// Standard authentication routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.delete('/delete-account', protect, deleteMyAccount);

router.put('/activate-email', activateEmailWithToken);
router.post('/activation-token', sendActivationToken);

router.put('/update-password', protect, updatePassword);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password', resetPassword);

// Google OAuth Routes for Flutter Mobile App
router.post(
  '/google', 
  passport.authenticate('google-token', { session: false }), 
  googleLogin
);

// Google account management (requires authentication)
router.get('/google/status', protect, checkGoogleLink);
router.delete('/google/unlink', protect, unlinkGoogle);

module.exports = router;