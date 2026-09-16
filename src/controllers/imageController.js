const Image = require('../models/Image');
const { deleteFromCloudinary } = require('../config/cloudinary');
const asyncHandler = require('express-async-handler');
const logger = require('../config/logger');

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

// Extract public_id from a Cloudinary filename (remove folder prefix if present)
function extractPublicId(filename) {
  return filename.includes('/') ? filename.split('/').pop() : filename;
}

// @desc    Upload new image
// @route   POST /api/images
// @access  Private
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image file');
  }

  // FIXED: Check for the correct properties from multer-storage-cloudinary
  if (!req.file.filename || !req.file.path) {
    logger.error('Cloudinary upload failed: Missing filename or path', { file: req.file });
    res.status(500);
    throw new Error('File upload to cloud storage failed. Please try again.');
  }

  const publicId = extractPublicId(req.file.filename);
  const { type, title, description, tags } = req.body;

  if (!type) {
    // If type is missing, we have an orphaned file on Cloudinary. We must delete it.
    logger.warn('Image type missing; deleting orphaned Cloudinary file', { publicId });
    try {
      await deleteFromCloudinary(publicId);
    } catch (cloudinaryError) {
      logger.error('Failed to delete orphaned Cloudinary file after validation error', { publicId, error: cloudinaryError.message });
    }
    res.status(400);
    throw new Error('Image type is required');
  }

  // Check if image with this type already exists to prevent duplicates
  const existingImage = await Image.findOne({ type });
  if (existingImage) {
    logger.warn(`Duplicate image type '${type}'; deleting newly uploaded file`, { publicId });
    try {
      await deleteFromCloudinary(publicId);
    } catch (cloudinaryError) {
      logger.error('Error deleting redundant Cloudinary file', { publicId, error: cloudinaryError.message });
    }
    res.status(409); // 409 Conflict is more appropriate for a duplicate resource
    throw new Error(`Image for type '${type}' already exists. Use the update endpoint (PUT) to replace it.`);
  }

  try {
    // Process tags if provided: convert comma-separated string to array
    let processedTags = [];
    if (tags) {
      processedTags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
    }

    // FIXED: Use the correct properties from multer-storage-cloudinary
    const imageData = {
      url: req.file.path, // This is the Cloudinary URL
      publicId, // Extracted from filename
      type,
      title: title || 'Untitled',
      description: description || '',
      tags: processedTags,
      dimensions: {
        width: req.file.width || 0,
        height: req.file.height || 0
      },
      size: req.file.size,
      format: req.file.format || req.file.mimetype?.split('/')[1] || 'unknown',
      uploadedBy: req.user ? req.user._id : null
    };

    const image = await Image.create(imageData);
    await image.populate('uploadedBy', 'name email');

    logger.info('Image created', { imageId: image._id, publicId });
    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: image
    });
  } catch (error) {
    logger.error('Error during image document creation', { error: error.message, publicId });
    // CRITICAL: If database save fails, we must delete the file from Cloudinary to prevent orphans.
    if (publicId) {
      try {
        await deleteFromCloudinary(publicId);
        logger.info('Rolled back Cloudinary upload', { publicId });
      } catch (cloudinaryError) {
        logger.error('Failed to delete orphaned Cloudinary file after DB error; manual cleanup required', {
          publicId,
          error: cloudinaryError.message
        });
      }
    }
    res.status(500);
    throw new Error('Failed to save image details to the database. The upload has been rolled back.');
  }
});

// @desc    Update image
// @route   PUT /api/images/:id
// @access  Private
const updateImage = asyncHandler(async (req, res) => {
  let image = await Image.findById(req.params.id);

  if (!image) {
    // If a new file was uploaded but the image doesn't exist, clean up the uploaded file
    if (req.file && req.file.filename) {
      const publicId = extractPublicId(req.file.filename);
      try {
        await deleteFromCloudinary(publicId);
      } catch (cleanupError) {
        logger.error('Error cleaning up orphaned file', { error: cleanupError.message });
      }
    }

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
      // If a new file was uploaded but there's a type conflict, clean up the uploaded file
      if (req.file && req.file.filename) {
        const publicId = extractPublicId(req.file.filename);
        try {
          await deleteFromCloudinary(publicId);
        } catch (cleanupError) {
          logger.error('Error cleaning up conflicting file', { error: cleanupError.message });
        }
      }

      return res.status(400).json({
        success: false,
        message: `Image for type '${type}' already exists`
      });
    }
  }

  // Handle file replacement
  if (req.file) {
    // FIXED: Check for the correct properties from multer-storage-cloudinary
    if (!req.file.filename || !req.file.path) {
      logger.error('File upload failed: Missing filename or path', { file: req.file });
      return res.status(500).json({
        success: false,
        message: 'File upload to cloud storage failed. Please try again.'
      });
    }

    const newPublicId = extractPublicId(req.file.filename);
    const oldPublicId = image.publicId;

    try {
      // FIXED: Use the correct properties from multer-storage-cloudinary
      image.url = req.file.path;
      image.publicId = newPublicId;
      image.dimensions = {
        width: req.file.width || 0,
        height: req.file.height || 0
      };
      image.size = req.file.size;
      image.format = req.file.format || req.file.mimetype?.split('/')[1] || 'unknown';

      // Delete old image from Cloudinary after successful update
      if (oldPublicId && oldPublicId !== newPublicId) {
        try {
          await deleteFromCloudinary(oldPublicId);
        } catch (deleteError) {
          logger.warn('Failed to delete old image (not fatal)', { publicId: oldPublicId, error: deleteError.message });
        }
      }
    } catch (error) {
      logger.error('Error updating image with new file', { error: error.message });
      // If update fails, try to clean up the new uploaded file
      try {
        await deleteFromCloudinary(newPublicId);
      } catch (cleanupError) {
        logger.error('Error cleaning up new uploaded file', { error: cleanupError.message });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to update image with new file'
      });
    }
  }

  // Update other fields
  if (type) image.type = type;
  if (title !== undefined) image.title = title;
  if (description !== undefined) image.description = description;
  if (isActive !== undefined) image.isActive = isActive;
  if (tags !== undefined) {
    image.tags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
  }

  try {
    await image.save();
    await image.populate('uploadedBy', 'name email');

    logger.info('Image updated', { imageId: image._id });
    res.json({
      success: true,
      message: 'Image updated successfully',
      data: image
    });
  } catch (saveError) {
    logger.error('Error saving updated image', { error: saveError.message });

    // If database save fails and we uploaded a new file, we need to clean up
    if (req.file && req.file.filename) {
      const publicId = extractPublicId(req.file.filename);
      try {
        await deleteFromCloudinary(publicId);
      } catch (cleanupError) {
        logger.error('Error rolling back new uploaded file', { error: cleanupError.message });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to save updated image to database'
    });
  }
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

  let cloudinaryDeleted = false;
  let databaseDeleted = false;

  // Delete from Cloudinary first
  if (image.publicId) {
    try {
      await deleteFromCloudinary(image.publicId);
      cloudinaryDeleted = true;
    } catch (cloudinaryError) {
      // Check if the error is because the file doesn't exist on Cloudinary
      if (cloudinaryError.message?.includes('not found') ||
          cloudinaryError.message?.includes('does not exist') ||
          cloudinaryError.http_code === 404) {
        cloudinaryDeleted = true; // Consider it "deleted" since it doesn't exist
      } else {
        logger.warn('Cloudinary deletion failed, proceeding with database deletion');
        cloudinaryDeleted = false;
      }
    }
  } else {
    cloudinaryDeleted = true; // Nothing to delete on Cloudinary
  }

  // Delete from database
  try {
    await Image.findByIdAndDelete(req.params.id);
    databaseDeleted = true;
  } catch (databaseError) {
    logger.error('Failed to delete image from database', { error: databaseError.message });

    if (cloudinaryDeleted) {
      logger.error('CRITICAL: Image deleted from Cloudinary but failed to delete from database; manual cleanup may be required', {
        imageId: req.params.id
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to delete image from database',
      details: databaseError.message
    });
  }

  // Determine response based on deletion results
  if (cloudinaryDeleted && databaseDeleted) {
    logger.info('Image deleted', { imageId: req.params.id });
    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } else if (!cloudinaryDeleted && databaseDeleted) {
    logger.warn('Image deleted from database but Cloudinary deletion failed', { imageId: req.params.id });
    res.json({
      success: true,
      message: 'Image deleted from database, but cloud storage cleanup failed',
      warning: 'Manual cleanup of cloud storage may be required'
    });
  } else {
    logger.error('Partial deletion failure for image', { imageId: req.params.id });
    res.status(500).json({
      success: false,
      message: 'Partial deletion failure occurred'
    });
  }
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