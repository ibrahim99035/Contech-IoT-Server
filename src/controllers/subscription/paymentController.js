const asyncHandler = require('express-async-handler');
const { Payment, Subscription, SubscriptionPlan, Coupon, Invoice } = require('../../models/subscriptionSystemModels');
const { success } = require('../../utils/response');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../config/logger');

// Record a payment (gateway-agnostic: captures intent/result, no fake processor)
exports.createPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.create({ ...req.body, paymentStatus: 'pending' });

  // Attempt to mark the payment completed and update the subscription/invoice
  try {
    payment.paymentStatus = 'completed';
    await payment.save();

    await Subscription.findOneAndUpdate(
      { user: req.body.userId },
      {
        subscriptionPlan: req.body.subscriptionPlanId,
        status: 'active',
        startDate: new Date(),
        renewalDate: new Date(new Date().setMonth(new Date().getMonth() + 1))
      },
      { upsert: true, new: true }
    );

    await Invoice.create({
      user: req.body.userId,
      payment: payment._id,
      amount: payment.amount,
      currency: payment.currency,
      details: 'Subscription payment',
      status: 'paid'
    });

    success(res, payment, 'Payment recorded successfully', 201);
  } catch (error) {
    // If downstream bookkeeping fails, keep the payment record but surface the error
    payment.paymentStatus = 'failed';
    await payment.save().catch(() => {});
    logger.error('Payment bookkeeping failed', { error: error.message });
    throw new AppError('Payment recorded but subscription activation failed', 500, 'PAYMENT_BOOKKEEPING_FAILED');
  }
});

// Get all payments for a user
exports.getUserPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ user: req.params.userId }).populate('subscriptionPlan');
  success(res, payments, 'Payments retrieved successfully');
});