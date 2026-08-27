const express = require('express');
const router = express.Router();

const { 
    getLimits, 
    upsertLimits, 
    deleteLimits 
} = require('../controllers/admin/subscriptionLimits');

const { getUserUsage } = require('../controllers/user/usage');

const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

/**
 * @openapi
 * /admin/dashboard/subscription-limits/get-usage:
 *   get:
 *     summary: Get current user subscription resource usage
 *     tags: [Subscription Limits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Resource usage breakdown }
 * 
 * /admin/dashboard/subscription-limits/get-limits:
 *   get:
 *     summary: Admin - Get all subscription tier limits
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Subscription limits configuration }
 * 
 * /admin/dashboard/subscription-limits/upsert-limits:
 *   post:
 *     summary: Admin - Create or update subscription plan limit
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planName, maxApartments, maxRooms, maxDevices, maxTasks]
 *             properties:
 *               planName: { type: string, example: "gold" }
 *               maxApartments: { type: integer, example: 5 }
 *               maxRooms: { type: integer, example: 10 }
 *               maxDevices: { type: integer, example: 25 }
 *               maxTasks: { type: integer, example: 50 }
 *     responses:
 *       200: { description: Plan limit updated }
 * 
 * /admin/dashboard/subscription-limits/delete-limits/{planName}:
 *   delete:
 *     summary: Admin - Delete a plan limit configuration
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: planName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Plan limit deleted }
 */

router.get('/get-usage', protect, getUserUsage);
router.get('/get-limits', protect, authorizeRoles('admin'), getLimits);
router.post('/upsert-limits', protect, authorizeRoles('admin'), upsertLimits);
router.delete('/delete-limits/:planName', protect, authorizeRoles('admin'), deleteLimits);

module.exports = router;