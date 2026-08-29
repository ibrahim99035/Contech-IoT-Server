const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const {
  planSchema,
  planUpdateSchema,
  paymentSchema,
  subscribeSchema,
  cancelSubscriptionSchema,
  featureSchema,
  couponSchema
} = require('../validation/subscriptionValidation');

const planController = require('../controllers/subscription/subscriptionPlanController');
const subscriptionController = require('../controllers/subscription/subscriptionController');
const paymentController = require('../controllers/subscription/paymentController');
const featureController = require('../controllers/subscription/featureController');
const couponController = require('../controllers/subscription/couponsController');
const adminActivityLogController = require('../controllers/subscription/adminActivityLogController');

// ─── Plans ─────────────────────────────────────────────────────────────────
router.get('/plans', planController.getPlans);
router.get('/plans/:id', planController.getPlanById);
router.post('/plans', protect, authorizeRoles('admin'), validate(planSchema), planController.createPlan);
router.put('/plans/:id', protect, authorizeRoles('admin'), validate(planUpdateSchema), planController.updatePlan);
router.delete('/plans/:id', protect, authorizeRoles('admin'), planController.deletePlan);

// ─── Subscriptions ─────────────────────────────────────────────────────────
router.post('/', protect, validate(subscribeSchema), subscriptionController.subscribe);
router.get('/my', protect, subscriptionController.getMySubscription);
router.delete('/', protect, validate(cancelSubscriptionSchema), subscriptionController.cancelSubscription);

// ─── Payments ──────────────────────────────────────────────────────────────
router.post('/payments', protect, validate(paymentSchema), paymentController.createPayment);
router.get('/payments/:userId', protect, paymentController.getUserPayments);

// ─── Features ──────────────────────────────────────────────────────────────
router.get('/features', featureController.getFeatures);
router.get('/features/:id', featureController.getFeatureById);
router.post('/features', protect, authorizeRoles('admin'), validate(featureSchema), featureController.createFeature);
router.delete('/features/:id', protect, authorizeRoles('admin'), featureController.deleteFeature);

// ─── Coupons ───────────────────────────────────────────────────────────────
router.post('/coupons', protect, authorizeRoles('admin'), validate(couponSchema), couponController.createCoupon);
router.get('/coupons', protect, authorizeRoles('admin'), couponController.getCoupons);
router.get('/coupons/validate/:code', protect, couponController.validateCoupon);

// ─── Admin activity log ────────────────────────────────────────────────────
router.get('/admin-activities', protect, authorizeRoles('admin'), adminActivityLogController.getAdminActivities);

module.exports = router;