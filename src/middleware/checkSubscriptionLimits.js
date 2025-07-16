const SubscriptionLimiter = require('../utils/subscriptionLimiter');

/**
 * Middleware to check apartment creation limits
 */
exports.checkApartmentLimits = async (req, res, next) => {
  try {
    const result = await SubscriptionLimiter.canCreateApartment(req.user._id);
    
    if (!result.canCreate) {
      return res.status(403).json({
        success: false,
        message: result.message,
        current: result.current,
        limits: result.limits
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Middleware to check room creation limits
 */
exports.checkRoomLimits = async (req, res, next) => {
  try {
    const result = await SubscriptionLimiter.canCreateRoom(req.user._id, req.body.apartment);
    
    if (!result.canCreate) {
      return res.status(403).json({
        success: false,
        message: result.message,
        current: result.current,
        limit: result.limit
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Middleware to check device creation limits
 */
exports.checkDeviceLimits = async (req, res, next) => {
  try {
    const result = await SubscriptionLimiter.canCreateDevice(req.user._id, req.body.room);
    
    if (!result.canCreate) {
      return res.status(403).json({
        success: false,
        message: result.message,
        current: result.current,
        limit: result.limit
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Middleware to check task creation limits
 */
exports.checkTaskLimits = async (req, res, next) => {
  try {
    const result = await SubscriptionLimiter.canCreateTask(req.user._id, req.body.device);
    
    if (!result.canCreate) {
      return res.status(403).json({
        success: false,
        message: result.message,
        current: result.current,
        limits: result.limits
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};