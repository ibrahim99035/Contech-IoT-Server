const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    description: { type: String },
    icon: { type: String }, // Optional icon for the category
    parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }, // Nested categories
}, { timestamps: true });
  
module.exports = mongoose.model('Category', categorySchema);  