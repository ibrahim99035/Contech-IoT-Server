const Image = require('../models/Image');
const { deleteFromCloudinary, getImageDetails } = require('../config/cloudinary');
const asyncHandler = require('express-async-handler');

// @desc    Get all images
// @route   GET /api/images
// @access  Public
const getAllImages = asyncHandler(async (req, res) => {
  const { type, isActive, page = 1, limit = 10 } = req.query;
  
  // Build filter object
  const filter = {};
  if (type) filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  
  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const images = await Image.find(filter)
    .populate('uploadedBy', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
  const total = await Image.countDocuments(filter);
  
  res.json({
    success: true,
    data: images,
    pagination: {
      current: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      total
    }
  });
});

// @desc    Get single image
// @route   GET /api/images/:id
// @access  Public
const getImageById = asyncHandler(async (req, res) => {
  const image = await Image.findById(req.params.id).populate('uploadedBy', 'name email');
  
  if (!image) {
    return res.status(404).json({
      success: false,
      message: 'Image not found'
    });
  }
  
  res.json({
    success: true,
    data: image
  });
});

// @desc    Get image by type
// @route   GET /api/images/type/:type
// @access  Public
const getImageByType = asyncHandler(async (req, res) => {
  const { type } = req.params;
  
  const image = await Image.findOne({ type, isActive: true })
    .populate('uploadedBy', 'name email');
  
  if (!image) {
    return res.status(404).json({
      success: false,
      message: `No image found for type: ${type}`
    });
  }
  
  res.json({
    success: true,
    data: image
  });
});

// @desc    Upload new image
// @route   POST /api/images
// @access  Private
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Please upload an image file'
    });
  }
  
  const { type, title, description, tags } = req.body;
  
  if (!type) {
    return res.status(400).json({
      success: false,
      message: 'Image type is required'
    });
  }
  
  // Check if image with this type already exists
  const existingImage = await Image.findOne({ type });
  if (existingImage) {
    // Delete the uploaded file from Cloudinary since we can't use it
    await deleteFromCloudinary(req.file.public_id);
    
    return res.status(400).json({
      success: false,
      message: `Image for type '${type}' already exists. Use update endpoint to replace it.`
    });
  }
  
  // Process tags if provided
  let processedTags = [];
  if (tags) {
    processedTags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
  }
  
  const imageData = {
    url: req.file.secure_url,
    publicId: req.file.public_id,
    type,
    title,
    description,
    tags: processedTags,
    dimensions: {
      width: req.file.width,
      height: req.file.height
    },
    size: req.file.bytes,
    format: req.file.format,
    uploadedBy: req.user ? req.user._id : null
  };
  
  const image = await Image.create(imageData);
  await image.populate('uploadedBy', 'name email');
  
  res.status(201).json({
    success: true,
    message: 'Image uploaded successfully',
    data: image
  });
});

// @desc    Update image
// @route   PUT /api/images/:id
// @access  Private
const updateImage = asyncHandler(async (req, res) => {
  let image = await Image.findById(req.params.id);
  
  if (!image) {
    return res.status(404).json({
      success: false,
      message: 'Image not found'
    });
  }
  
  const { type, title, description, tags, isActive } = req.body;
  
  // If type is being changed, check for conflicts
  if (type && type !== image.type) {
    const existingImage = await Image.findOne({ type, _id: { $ne: req.params.id } });
    if (existingImage) {
      return res.status(400).json({
        success: false,
        message: `Image for type '${type}' already exists`
      });
    }
  }
  
  // Handle file replacement
  if (req.file) {
    // Delete old image from Cloudinary
    await deleteFromCloudinary(image.publicId);
    
    // Update with new image data
    image.url = req.file.secure_url;
    image.publicId = req.file.public_id;
    image.dimensions = {
      width: req.file.width,
      height: req.file.height
    };
    image.size = req.file.bytes;
    image.format = req.file.format;
  }
  
  // Update other fields
  if (type) image.type = type;
  if (title !== undefined) image.title = title;
  if (description !== undefined) image.description = description;
  if (isActive !== undefined) image.isActive = isActive;
  
  if (tags !== undefined) {
    image.tags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
  }
  
  await image.save();
  await image.populate('uploadedBy', 'name email');
  
  res.json({
    success: true,
    message: 'Image updated successfully',
    data: image
  });
});

// @desc    Delete image
// @route   DELETE /api/images/:id
// @access  Private
const deleteImage = asyncHandler(async (req, res) => {
  const image = await Image.findById(req.params.id);
  
  if (!image) {
    return res.status(404).json({
      success: false,
      message: 'Image not found'
    });
  }
  
  // Delete from Cloudinary
  await deleteFromCloudinary(image.publicId);
  
  // Delete from database
  await Image.findByIdAndDelete(req.params.id);
  
  res.json({
    success: true,
    message: 'Image deleted successfully'
  });
});

// @desc    Get image statistics
// @route   GET /api/images/stats
// @access  Public
const getImageStats = asyncHandler(async (req, res) => {
  const stats = await Image.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalSize: { $sum: '$size' },
        activeCount: {
          $sum: { $cond: ['$isActive', 1, 0] }
        }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
  
  const totalImages = await Image.countDocuments();
  const activeImages = await Image.countDocuments({ isActive: true });
  
  res.json({
    success: true,
    data: {
      byType: stats,
      total: totalImages,
      active: activeImages,
      inactive: totalImages - activeImages
    }
  });
});

module.exports = {
  getAllImages,
  getImageById,
  getImageByType,
  uploadImage,
  updateImage,
  deleteImage,
  getImageStats
};