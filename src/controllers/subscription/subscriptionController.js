const asyncHandler = require('express-async-handler');
const { Subscription, SubscriptionPlan, Coupon } = require('../../models/subscriptionSystemModels');
const { success } = require('../../utils/response');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../config/logger');

function applyCoupon(planPrice, coupon) {
  if (!coupon) return planPrice;
  return coupon.discountType === 'percentage'
    ? planPrice * (1 - coupon.discountValue / 100)
    : Math.max(0, planPrice - coupon.discountValue);
}

// Subscribe (or upgrade) the current user to a plan
exports.subscribe = asyncHandler(async (req, res) => {
  const { subscriptionPlanId, autoRenew, couponCode } = req.body;
  const userId = req.user._id;

  const plan = await SubscriptionPlan.findById(subscriptionPlanId);
  if (!plan) {
    throw new AppError('Subscription plan not found', 404, 'NOT_FOUND');
  }

  let appliedCoupon = null;
  if (couponCode) {
    appliedCoupon = await Coupon.findOne({ code: couponCode });
    if (!appliedCoupon) {
      throw new AppError('Invalid coupon code', 400, 'INVALID_COUPON');
    }
    if (appliedCoupon.expirationDate < new Date()) {
      throw new AppError('Coupon expired', 400, 'COUPON_EXPIRED');
    }
    if (appliedCoupon.usageLimit > 0 && appliedCoupon.usedCount >= appliedCoupon.usageLimit) {
      throw new AppError('Coupon usage limit reached', 400, 'COUPON_USAGE_LIMIT');
    }
  }

  const price = applyCoupon(plan.price, appliedCoupon);

  const subscription = await Subscription.findOneAndUpdate(
    { user: userId },
    {
      subscriptionPlan: plan._id,
      status: 'active',
      startDate: new Date(),
      renewalDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      autoRenew: autoRenew ?? true
    },
    { upsert: true, new: true, runValidators: true }
  );

  if (appliedCoupon) {
    appliedCoupon.usedCount += 1;
    await appliedCoupon.save();
  }

  logger.info('User subscribed to plan', { userId: String(userId), plan: plan.name, price });
  success(res, { subscription, plan, appliedPrice: price }, 'Subscription activated successfully', 201);
});

// Cancel the current user's subscription
exports.cancelSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOneAndUpdate(
    { user: req.user._id, status: 'active' },
    { status: 'canceled', cancellationReason: req.body.cancellationReason || null },
    { new: true }
  );

  if (!subscription) {
    throw new AppError('No active subscription found', 404, 'NOT_FOUND');
  }

  logger.info('User canceled subscription', { userId: String(req.user._id) });
  success(res, subscription, 'Subscription canceled successfully');
});

// Get the current user's subscription
exports.getMySubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({ user: req.user._id }).populate('subscriptionPlan');
  success(res, subscription, 'Subscription retrieved successfully');
});