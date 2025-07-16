const SubscriptionLimiter = require('../../utils/subscriptionLimiter');

/**
 * Get user's current usage and limits
 */
exports.getUserUsage = async (req, res) => {
  try {
    const usage = await SubscriptionLimiter.getUserUsage(req.user._id);
    res.json({ success: true, data: usage });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};