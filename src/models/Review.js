const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String, required: true },
    content: { type: String },
    status: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'pending' },
}, { timestamps: true });
  
module.exports = mongoose.model('Review', reviewSchema);  