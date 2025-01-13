const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    salePrice: { type: Number }, // Discounted price
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    stock: { type: Number, default: 0 },
    images: [{ type: String }], // Array of image URLs
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    ratings: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String },
    }],
    averageRating: { type: Number, default: 0 },
    reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }],
    seo: {
      metaTitle: { type: String },
      metaDescription: { type: String },
      keywords: [{ type: String }],
    }
}, { timestamps: true });
  
module.exports = mongoose.model('Product', productSchema);  