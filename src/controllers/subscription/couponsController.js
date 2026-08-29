const asyncHandler = require('express-async-handler');
const { Coupon } = require('../../models/subscriptionSystemModels');
const { success } = require('../../utils/response');
const { AppError } = require('../../middleware/errorHandler');

// Create a coupon
exports.createCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.create(req.body);
  success(res, coupon, 'Coupon created successfully', 201);
});

// Validate a coupon
exports.validateCoupon = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const coupon = await Coupon.findOne({ code });
  if (!coupon) {
    throw new AppError('Invalid coupon', 404, 'INVALID_COUPON');
  }
  if (coupon.expirationDate < new Date()) {
    throw new AppError('Coupon expired', 400, 'COUPON_EXPIRED');
  }
  success(res, coupon, 'Coupon is valid');
});

// Get all coupons
exports.getCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  success(res, coupons, 'Coupons retrieved successfully');
});