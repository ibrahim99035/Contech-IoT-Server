/**
 * routes/google-assistant.js
 * Google Assistant Routes with Authentication
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const googleAssistantController = require('../controllers/google-assistant/fulfilment-handler');

/**
 * @openapi
 * /api/google-assistant/fulfillment:
 *   post:
 *     summary: Google Smart Home Fulfillment Handler
 *     tags: [Google Assistant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inputs: { type: array, items: { type: object } }
 *     responses:
 *       200: { description: Google Home Fulfillment Intent Response }
 */
router.post('/fulfillment', protect, googleAssistantController.googleAssistantFulfillment);

module.exports = router;