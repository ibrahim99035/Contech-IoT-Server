const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  url: {
    type: String,
    required: [true, 'Image URL is required'],
    trim: true
  },
  publicId: {
    type: String,
    required: [true, 'Cloudinary public ID is required'],
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Image type is required'],
    enum: [
      'living_room',
      'bedroom', 
      'kitchen',
      'bathroom',
      'dining_room',
      'office',
      'garage'
    ],
    unique: true // Each type can only have one image
  },
  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  tags: [{
    type: String,
    trim: true
  }],
  dimensions: {
    width: Number,
    height: Number
  },
  size: {
    type: Number, // Size in bytes
    min: 0
  },
  format: {
    type: String,
    trim: true,
    lowercase: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for better query performance
imageSchema.index({ type: 1 });
imageSchema.index({ isActive: 1 });
imageSchema.index({ createdAt: -1 });

// Virtual for formatted file size
imageSchema.virtual('formattedSize').get(function() {
  if (!this.size) return null;
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = this.size;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
});

// Ensure virtual fields are serialized
imageSchema.set('toJSON', { virtuals: true });
imageSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Image', imageSchema);