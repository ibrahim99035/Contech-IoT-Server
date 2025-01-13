const express = require('express');

const { registerUser } = require('../controllers/auth/register');
const { loginUser } = require('../controllers/auth/login');
const { updatePassword, forgotPassword, resetPassword } = require('../controllers/auth/passwordHandler');
const { sendActivationToken, activateEmailWithToken } = require('../controllers/auth/emailActivation');

const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);

router.put('/activate-email', activateEmailWithToken);
router.post('/activation-token', sendActivationToken)

router.put('/update-password', protect, updatePassword);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password', resetPassword);

module.exports = router;