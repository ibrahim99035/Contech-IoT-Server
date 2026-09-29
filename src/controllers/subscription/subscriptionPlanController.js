const asyncHandler = require('express-async-handler');
const { SubscriptionPlan } = require('../../models/subscriptionSystemModels');
const { success } = require('../../utils/response');
const { AppError } = require('../../middleware/errorHandler');

// Create a new subscription plan
exports.createPlan = asyncHandler(async (req, res) => {
  const plan = await SubscriptionPlan.create(req.body);
  success(res, plan, 'Plan created successfully', 201);
});

// Get all subscription plans
exports.getPlans = asyncHandler(async (req, res) => {
  const plans = await SubscriptionPlan.find().sort({ price: 1 });
  success(res, plans, 'Plans retrieved successfully');
});

// Get a single plan by id
exports.getPlanById = asyncHandler(async (req, res) => {
  const plan = await SubscriptionPlan.findById(req.params.id);
  if (!plan) {
    throw new AppError('Plan not found', 404, 'NOT_FOUND');
  }
  success(res, plan, 'Plan retrieved successfully');
});

// Update a subscription plan
exports.updatePlan = asyncHandler(async (req, res) => {
  const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!plan) {
    throw new AppError('Plan not found', 404, 'NOT_FOUND');
  }
  success(res, plan, 'Plan updated successfully');
});

// Delete a subscription plan
exports.deletePlan = asyncHandler(async (req, res) => {
  const plan = await SubscriptionPlan.findByIdAndDelete(req.params.id);
  if (!plan) {
    throw new AppError('Plan not found', 404, 'NOT_FOUND');
  }
  success(res, null, 'Plan deleted successfully');
});