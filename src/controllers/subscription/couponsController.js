const { Coupon } = require('../../models/subscriptionSystemModels');

// Create a coupon
exports.createCoupon = async (req, res) => {
  try {
    const { code, discountType, discountValue, expirationDate, applicablePlans } = req.body;

    const coupon = new Coupon({ code, discountType, discountValue, expirationDate, applicablePlans });
    await coupon.save();

    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Validate a coupon
exports.validateCoupon = async (req, res) => {
  try {
    const { code } = req.params;

    const coupon = await Coupon.findOne({ code });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid coupon' });

    if (coupon.expirationDate < new Date()) {
      return res.status(400).json({ success: false, message: 'Coupon expired' });
    }

    res.status(200).json({ success: true, data: coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};