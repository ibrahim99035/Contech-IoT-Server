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

router.get('/get-usage', protect, getUserUsage);

router.get('/get-limits', protect, authorizeRoles('admin'), getLimits);
router.post('/upsert-limits', protect, authorizeRoles('admin'), upsertLimits);
router.delete('/delete-limits/:planName', protect, authorizeRoles('admin'), deleteLimits);

module.exports = router;