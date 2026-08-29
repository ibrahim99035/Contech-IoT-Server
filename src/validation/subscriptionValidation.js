/**
 * Joi validation schemas for the subscription module.
 * @module validation/subscriptionValidation
 */

const Joi = require('joi');

const planSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('', null),
  price: Joi.number().min(0).required(),
  billingCycle: Joi.string().valid('monthly', 'yearly').required(),
  features: Joi.array().items(Joi.string()).default([]),
  trialPeriod: Joi.number().min(0).default(0),
  status: Joi.string().valid('active', 'inactive').default('active')
});

const planUpdateSchema = planSchema.fork(
  ['name', 'price', 'billingCycle'],
  (schema) => schema.optional()
).min(1);

const paymentSchema = Joi.object({
  userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  subscriptionPlanId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().default('USD'),
  paymentMethod: Joi.string().required(),
  paymentStatus: Joi.string().valid('pending', 'completed', 'failed').default('pending'),
  paymentGatewayId: Joi.string().allow('', null)
});

const subscribeSchema = Joi.object({
  subscriptionPlanId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  autoRenew: Joi.boolean().default(true),
  couponCode: Joi.string().allow('', null)
});

const cancelSubscriptionSchema = Joi.object({
  cancellationReason: Joi.string().allow('', null)
});

const featureSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('', null)
});

const couponSchema = Joi.object({
  code: Joi.string().required(),
  discountType: Joi.string().valid('percentage', 'flat').required(),
  discountValue: Joi.number().min(0).required(),
  expirationDate: Joi.date().required(),
  applicablePlans: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).default([]),
  usageLimit: Joi.number().min(0).default(0)
});

module.exports = {
  planSchema,
  planUpdateSchema,
  paymentSchema,
  subscribeSchema,
  cancelSubscriptionSchema,
  featureSchema,
  couponSchema
};