const { Payment } = require('../../models/subscriptionSystemModels');

// Log payment
exports.createPayment = async (req, res) => {
  try {
    const { userId, subscriptionPlanId, amount, currency, paymentMethod, paymentGatewayId } = req.body;

    const payment = new Payment({ 
      user: userId, 
      subscriptionPlan: subscriptionPlanId, 
      amount, 
      currency, 
      paymentMethod, 
      paymentStatus: 'completed', 
      paymentGatewayId 
    });
    await payment.save();

    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Get all payments for a user
exports.getUserPayments = async (req, res) => {
  try {
    const userId = req.params.userId;
    const payments = await Payment.find({ user: userId }).populate('subscriptionPlan');

    res.status(200).json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};