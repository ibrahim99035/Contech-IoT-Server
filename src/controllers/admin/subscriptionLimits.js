const SubscriptionLimits = require('../../models/SubscriptionLimits');
const SubscriptionLimiter = require('../../utils/subscriptionLimiter');

/**
 * Get all subscription limits
 */
exports.getLimits = async (req, res) => {
  try {
    const limits = await SubscriptionLimits.find({ isActive: true }).sort({ planName: 1 });
    res.json({ success: true, data: limits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create or update subscription limits
 */
exports.upsertLimits = async (req, res) => {
  try {
    const { planName, limits, description } = req.body;

    const updatedLimits = await SubscriptionLimits.findOneAndUpdate(
      { planName: planName.toLowerCase() },
      { 
        limits, 
        description,
        lastUpdated: new Date()
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true
      }
    );

    // Clear cache after update
    SubscriptionLimiter.clearCache();

    res.json({ 
      success: true, 
      message: 'Limits updated successfully',
      data: updatedLimits 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete subscription limits
 */
exports.deleteLimits = async (req, res) => {
  try {
    const { planName } = req.params;
    
    await SubscriptionLimits.findOneAndUpdate(
      { planName: planName.toLowerCase() },
      { isActive: false }
    );

    SubscriptionLimiter.clearCache();

    res.json({ success: true, message: 'Limits deactivated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};