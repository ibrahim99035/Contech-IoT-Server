const express = require('express');
const router = express.Router();

const { 
    getLimits, 
    upsertLimits, 
    deleteLimits 
} = require('../../controllers/admin/subscriptionLimits');

const { getUserUsage } = require('../../controllers/user/usage');

const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.get('/get-usage', protect, getUserUsage);

router.get('/get-limits', protect, requireRole('admin'), getLimits);
router.post('/upsert-limits', protect, requireRole('admin'), upsertLimits);
router.delete('/delete-limits/:planName', protect, requireRole('admin'), deleteLimits);

module.exports = router;