/**
 * routes/google-assistant.js
 * Google Assistant Routes with Authentication
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const googleAssistantController = require('../controllers/google-assistant/fulfilment-handler');

/**
 * @route   POST /api/google-assistant/fulfillment
 * @desc    Google Smart Home fulfillment endpoint
 *          Handles SYNC, QUERY, EXECUTE, and DISCONNECT intents from Google Assistant.
 *          Uses existing protect middleware for authentication.
 * @access  Protected (requires valid JWT token)
 */
router.post('/fulfillment', protect, googleAssistantController.googleAssistantFulfillment);

module.exports = router;