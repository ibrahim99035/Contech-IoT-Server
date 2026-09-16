const asyncHandler = require('express-async-handler');
const { Feature } = require('../../models/subscriptionSystemModels');
const { success } = require('../../utils/response');
const { AppError } = require('../../middleware/errorHandler');

// Create a new feature
exports.createFeature = asyncHandler(async (req, res) => {
  const feature = await Feature.create(req.body);
  success(res, feature, 'Feature created successfully', 201);
});

// Get all features
exports.getFeatures = asyncHandler(async (req, res) => {
  const features = await Feature.find().sort({ name: 1 });
  success(res, features, 'Features retrieved successfully');
});

// Get a feature by id
exports.getFeatureById = asyncHandler(async (req, res) => {
  const feature = await Feature.findById(req.params.id);
  if (!feature) {
    throw new AppError('Feature not found', 404, 'NOT_FOUND');
  }
  success(res, feature, 'Feature retrieved successfully');
});

// Delete a feature
exports.deleteFeature = asyncHandler(async (req, res) => {
  const feature = await Feature.findByIdAndDelete(req.params.id);
  if (!feature) {
    throw new AppError('Feature not found', 404, 'NOT_FOUND');
  }
  success(res, null, 'Feature deleted successfully');
});