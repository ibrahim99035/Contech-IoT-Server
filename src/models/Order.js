const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    products: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
    }],
    totalAmount: { type: Number, required: true },
    taxes: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    shippingAddress: { type: String, required: true },
    paymentMethod: { type: String, enum: ['credit_card', 'paypal', 'cash_on_delivery'], required: true },
    status: { type: String, enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
    trackingNumber: { type: String },
    estimatedDelivery: { type: Date },
}, { timestamps: true });
  
module.exports = mongoose.model('Order', orderSchema);  