const { SubscriptionPlan } = require('../../models/subscriptionSystemModels');

// Create a new subscription plan
exports.createPlan = async (req, res) => {
  try {
    const { name, description, price, billingCycle, features, trialPeriod, status } = req.body;

    const plan = new SubscriptionPlan({ name, description, price, billingCycle, features, trialPeriod, status });
    await plan.save();

    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Get all subscription plans
exports.getPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find();
    res.status(200).json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Update a subscription plan
exports.updatePlan = async (req, res) => {
  try {
    const planId = req.params.id;
    const updates = req.body;

    const plan = await SubscriptionPlan.findByIdAndUpdate(planId, updates, { new: true });
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Delete a subscription plan
exports.deletePlan = async (req, res) => {
  try {
    const planId = req.params.id;
    const plan = await SubscriptionPlan.findByIdAndDelete(planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    res.status(200).json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};