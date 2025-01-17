const mongoose = require('mongoose');

// ===== Subscription Plan Schema =====
const subscriptionPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
  features: [{ type: String }], // List of features included in the plan
  trialPeriod: { type: Number, default: 0 }, // Trial days
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

// ===== Payment Schema =====
const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscriptionPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  paymentMethod: { type: String, required: true }, // e.g., 'Credit Card', 'PayPal'
  paymentStatus: { type: String, enum: ['pending', 'completed', 'failed'], required: true },
  paymentGatewayId: { type: String }, // ID from payment gateway
}, { timestamps: true });

// ===== Subscription Schema =====
const subscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscriptionPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
  status: { type: String, enum: ['active', 'canceled', 'expired'], default: 'active' },
  startDate: { type: Date, default: Date.now },
  renewalDate: { type: Date },
  autoRenew: { type: Boolean, default: true },
  cancellationReason: { type: String },
}, { timestamps: true });

// ===== Invoice Schema =====
const invoiceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
  issueDate: { type: Date, default: Date.now },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  details: { type: String }, // Summary of services
  status: { type: String, enum: ['paid', 'unpaid'], required: true },
}, { timestamps: true });

// ===== Feature Schema =====
const featureSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Name of the feature
  description: { type: String }, // Explanation or detail about the feature
});

// ===== Admin Activity Log Schema =====
const adminActivityLogSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Admin who performed the action
  action: { type: String, required: true }, // Description of the action (e.g., "Created plan")
  timestamp: { type: Date, default: Date.now }, // When the action occurred
  details: { type: String }, // Additional details or metadata about the action
});

// ===== Coupon/Discount Schema =====
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, // Unique coupon code
  discountType: { type: String, enum: ['percentage', 'flat'], required: true },
  discountValue: { type: Number, required: true }, // Percentage or flat discount
  expirationDate: { type: Date, required: true },
  applicablePlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan' }], // Plans this coupon can apply to
  usageLimit: { type: Number, default: 0 }, // Max times coupon can be used
  usedCount: { type: Number, default: 0 }, // Track usage count
});

// ===== Model Exports =====
module.exports = {
  SubscriptionPlan: mongoose.model('SubscriptionPlan', subscriptionPlanSchema),
  Payment: mongoose.model('Payment', paymentSchema),
  Subscription: mongoose.model('Subscription', subscriptionSchema),
  Invoice: mongoose.model('Invoice', invoiceSchema),
  Feature: mongoose.model('Feature', featureSchema),
  AdminActivityLog: mongoose.model('AdminActivityLog', adminActivityLogSchema),
  Coupon: mongoose.model('Coupon', couponSchema),
};