const mongoose = require('mongoose');

// Product Schema
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

// Order Schema
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

// Category Schema
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    description: { type: String },
    icon: { type: String }, // Optional icon for the category
    parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }, // Nested categories
}, { timestamps: true });

// Interaction Schema
const interactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    action: { type: String, enum: ['view', 'like', 'comment'], required: true },
    metadata: { type: Object }, // Additional data (e.g., time spent, device info)
}, { timestamps: true });

// Promotion Schema
const promotionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

// Review Schema
const reviewSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String, required: true },
    content: { type: String },
    status: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'pending' },
}, { timestamps: true });

// Wishlist Schema
const wishlistSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
}, { timestamps: true });

module.exports = {
    Product: mongoose.model('Product', productSchema),
    Order: mongoose.model('Order', orderSchema),
    Category: mongoose.model('Category', categorySchema),
    Interaction: mongoose.model('Interaction', interactionSchema),
    Promotion: mongoose.model('Promotion', promotionSchema),
    Review: mongoose.model('Review', reviewSchema),
    Wishlist: mongoose.model('Wishlist', wishlistSchema),
};