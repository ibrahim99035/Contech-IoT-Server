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
  console.log('Attempting to upload a new image...');
  console.log('Request Body:', req.body);
  console.log('Request File:', req.file ? {
    fieldname: req.file.fieldname,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    path: req.file.path, // This contains the Cloudinary URL
    filename: req.file.filename // This contains the public_id
  } : 'No file uploaded');

  if (!req.file) {
    console.error('Upload error: No file provided in the request.');
    res.status(400);
    throw new Error('Please upload an image file');
  }

  // FIXED: Check for the correct properties from multer-storage-cloudinary
  if (!req.file.filename || !req.file.path) {
    console.error('Cloudinary upload failed: Missing filename or path');
    console.error('File object:', req.file);
    res.status(500);
    throw new Error('File upload to cloud storage failed. Please try again.');
  }

  // Extract public_id from filename (remove folder prefix if present)
  const publicId = req.file.filename.includes('/') 
    ? req.file.filename.split('/').pop() 
    : req.file.filename;

  const { type, title, description, tags } = req.body;

  if (!type) {
    console.error('Validation error: Image type is required but was not provided.');
    // If type is missing, we have an orphaned file on Cloudinary. We must delete it.
    try {
      console.log(`Attempting to delete orphaned Cloudinary file: ${publicId}`);
      await deleteFromCloudinary(publicId);
      console.log(`Successfully deleted orphaned Cloudinary file: ${publicId}`);
    } catch (cloudinaryError) {
      console.error(`CRITICAL: Failed to delete orphaned Cloudinary file ${publicId} after a validation error.`, cloudinaryError);
    }
    res.status(400);
    throw new Error('Image type is required');
  }

  // Check if image with this type already exists to prevent duplicates
  console.log(`Checking for existing image with type: ${type}`);
  const existingImage = await Image.findOne({ type });
  if (existingImage) {
    console.warn(`Duplicate image type found: '${type}'. Deleting newly uploaded file from Cloudinary.`);
    // Delete the just-uploaded file from Cloudinary since it's a duplicate
    try {
      await deleteFromCloudinary(publicId);
      console.log(`Successfully deleted redundant Cloudinary file: ${publicId}`);
    } catch (cloudinaryError) {
      console.error(`Error deleting redundant Cloudinary file ${publicId}.`, cloudinaryError);
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
      publicId: publicId, // Extracted from filename
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

    console.log('Creating new image document in the database...');
    console.log('Image data to save:', imageData);
    
    const image = await Image.create(imageData);
    await image.populate('uploadedBy', 'name email');

    console.log(`Image created successfully with ID: ${image._id}`);
    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: image
    });
  } catch (error) {
    console.error('Error during image document creation in database:', error);
    // CRITICAL: If database save fails, we must delete the file from Cloudinary to prevent orphans.
    if (publicId) {
      console.log(`Attempting to roll back Cloudinary upload for public_id: ${publicId}`);
      try {
        await deleteFromCloudinary(publicId);
        console.log(`Successfully rolled back Cloudinary upload for public_id: ${publicId}`);
      } catch (cloudinaryError) {
        console.error(`CRITICAL: Failed to delete orphaned Cloudinary file ${publicId} after a database error. Manual cleanup required.`, cloudinaryError);
      }
    } else {
      console.error('Cannot rollback Cloudinary upload: public_id is missing');
    }
    res.status(500);
    throw new Error('Failed to save image details to the database. The upload has been rolled back.');
  }
});

// @desc    Update image
// @route   PUT /api/images/:id
// @access  Private
const updateImage = asyncHandler(async (req, res) => {
  console.log('Attempting to update image with ID:', req.params.id);
  console.log('Request Body:', req.body);
  console.log('Request File:', req.file ? {
    fieldname: req.file.fieldname,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    path: req.file.path, // This contains the Cloudinary URL
    filename: req.file.filename // This contains the public_id
  } : 'No file uploaded');

  let image = await Image.findById(req.params.id);
  
  if (!image) {
    // If a new file was uploaded but the image doesn't exist, clean up the uploaded file
    if (req.file && req.file.filename) {
      const publicId = req.file.filename.includes('/') 
        ? req.file.filename.split('/').pop() 
        : req.file.filename;
      try {
        console.log(`Cleaning up orphaned file: ${publicId}`);
        await deleteFromCloudinary(publicId);
      } catch (cleanupError) {
        console.error('Error cleaning up orphaned file:', cleanupError);
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
        const publicId = req.file.filename.includes('/') 
          ? req.file.filename.split('/').pop() 
          : req.file.filename;
        try {
          console.log(`Cleaning up conflicting file: ${publicId}`);
          await deleteFromCloudinary(publicId);
        } catch (cleanupError) {
          console.error('Error cleaning up conflicting file:', cleanupError);
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
    console.log('Processing file replacement...');
    
    // FIXED: Check for the correct properties from multer-storage-cloudinary
    if (!req.file.filename || !req.file.path) {
      console.error('File upload failed: Missing filename or path');
      console.error('File object:', req.file);
      return res.status(500).json({
        success: false,
        message: 'File upload to cloud storage failed. Please try again.'
      });
    }
    
    // Extract public_id from filename (remove folder prefix if present)
    const newPublicId = req.file.filename.includes('/') 
      ? req.file.filename.split('/').pop() 
      : req.file.filename;
    
    // Store old publicId for cleanup
    const oldPublicId = image.publicId;
    
    try {
      // FIXED: Use the correct properties from multer-storage-cloudinary
      image.url = req.file.path; // This is the Cloudinary URL
      image.publicId = newPublicId; // Extracted from filename
      image.dimensions = {
        width: req.file.width || 0,
        height: req.file.height || 0
      };
      image.size = req.file.size;
      image.format = req.file.format || req.file.mimetype?.split('/')[1] || 'unknown';
      
      console.log('Updated image with new file data:', {
        url: image.url,
        publicId: image.publicId,
        size: image.size
      });
      
      // Delete old image from Cloudinary after successful update
      if (oldPublicId && oldPublicId !== newPublicId) {
        console.log(`Deleting old image from Cloudinary: ${oldPublicId}`);
        try {
          await deleteFromCloudinary(oldPublicId);
          console.log(`Successfully deleted old image: ${oldPublicId}`);
        } catch (deleteError) {
          console.error(`Warning: Failed to delete old image ${oldPublicId}:`, deleteError);
          // Don't fail the update if old image deletion fails
        }
      }
      
    } catch (error) {
      console.error('Error updating image with new file:', error);
      
      // If update fails, try to clean up the new uploaded file
      try {
        console.log(`Cleaning up new uploaded file: ${newPublicId}`);
        await deleteFromCloudinary(newPublicId);
      } catch (cleanupError) {
        console.error('Error cleaning up new uploaded file:', cleanupError);
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to update image with new file'
      });
    }
  }
  
  // Update other fields
  if (type) {
    console.log(`Updating type from '${image.type}' to '${type}'`);
    image.type = type;
  }
  if (title !== undefined) {
    console.log(`Updating title from '${image.title}' to '${title}'`);
    image.title = title;
  }
  if (description !== undefined) {
    console.log(`Updating description`);
    image.description = description;
  }
  if (isActive !== undefined) {
    console.log(`Updating isActive from ${image.isActive} to ${isActive}`);
    image.isActive = isActive;
  }
  
  if (tags !== undefined) {
    const processedTags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
    console.log(`Updating tags from [${image.tags}] to [${processedTags}]`);
    image.tags = processedTags;
  }
  
  try {
    console.log('Saving updated image to database...');
    await image.save();
    await image.populate('uploadedBy', 'name email');
    
    console.log(`Image updated successfully with ID: ${image._id}`);
    res.json({
      success: true,
      message: 'Image updated successfully',
      data: image
    });
  } catch (saveError) {
    console.error('Error saving updated image:', saveError);
    
    // If database save fails and we uploaded a new file, we need to clean up
    if (req.file && req.file.filename) {
      const publicId = req.file.filename.includes('/') 
        ? req.file.filename.split('/').pop() 
        : req.file.filename;
      try {
        console.log(`Rolling back new uploaded file: ${publicId}`);
        await deleteFromCloudinary(publicId);
      } catch (cleanupError) {
        console.error('Error rolling back new uploaded file:', cleanupError);
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
  console.log('Attempting to delete image with ID:', req.params.id);
  
  const image = await Image.findById(req.params.id);
  
  if (!image) {
    console.log(`Image not found with ID: ${req.params.id}`);
    return res.status(404).json({
      success: false,
      message: 'Image not found'
    });
  }
  
  console.log('Found image to delete:', {
    id: image._id,
    type: image.type,
    title: image.title,
    publicId: image.publicId,
    url: image.url
  });
  
  let cloudinaryDeleted = false;
  let databaseDeleted = false;
  
  // Delete from Cloudinary first
  if (image.publicId) {
    try {
      console.log(`Deleting image from Cloudinary: ${image.publicId}`);
      const cloudinaryResult = await deleteFromCloudinary(image.publicId);
      console.log('Cloudinary deletion result:', cloudinaryResult);
      cloudinaryDeleted = true;
    } catch (cloudinaryError) {
      console.error('Failed to delete image from Cloudinary:', cloudinaryError);
      
      // Check if the error is because the file doesn't exist on Cloudinary
      if (cloudinaryError.message?.includes('not found') || 
          cloudinaryError.message?.includes('does not exist') ||
          cloudinaryError.http_code === 404) {
        console.log('Image not found on Cloudinary, proceeding with database deletion');
        cloudinaryDeleted = true; // Consider it "deleted" since it doesn't exist
      } else {
        // For other Cloudinary errors, we might want to continue with database deletion
        // depending on your business logic
        console.warn('Cloudinary deletion failed, but proceeding with database deletion');
        cloudinaryDeleted = false;
      }
    }
  } else {
    console.warn('No publicId found for image, skipping Cloudinary deletion');
    cloudinaryDeleted = true; // Nothing to delete on Cloudinary
  }
  
  // Delete from database
  try {
    console.log(`Deleting image from database: ${image._id}`);
    await Image.findByIdAndDelete(req.params.id);
    console.log('Successfully deleted image from database');
    databaseDeleted = true;
  } catch (databaseError) {
    console.error('Failed to delete image from database:', databaseError);
    
    // If Cloudinary deletion succeeded but database deletion failed,
    // we have an inconsistent state
    if (cloudinaryDeleted) {
      console.error('CRITICAL: Image deleted from Cloudinary but failed to delete from database');
      console.error('Manual database cleanup may be required for image ID:', req.params.id);
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to delete image from database',
      details: databaseError.message
    });
  }
  
  // Determine response based on deletion results
  if (cloudinaryDeleted && databaseDeleted) {
    console.log(`✅ Image successfully deleted: ${req.params.id}`);
    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } else if (!cloudinaryDeleted && databaseDeleted) {
    console.warn(`⚠️ Image deleted from database but Cloudinary deletion failed: ${req.params.id}`);
    res.json({
      success: true,
      message: 'Image deleted from database, but cloud storage cleanup failed',
      warning: 'Manual cleanup of cloud storage may be required'
    });
  } else {
    // This shouldn't happen given our error handling above, but just in case
    console.error(`❌ Partial deletion failure for image: ${req.params.id}`);
    res.status(500).json({
      success: false,
      message: 'Partial deletion failure occurred'
    });
  }
});

// Alternative version with transaction-like behavior (more conservative)
const deleteImageConservative = asyncHandler(async (req, res) => {
  console.log('Attempting to delete image with ID (conservative mode):', req.params.id);
  
  const image = await Image.findById(req.params.id);
  
  if (!image) {
    console.log(`Image not found with ID: ${req.params.id}`);
    return res.status(404).json({
      success: false,
      message: 'Image not found'
    });
  }
  
  console.log('Found image to delete:', {
    id: image._id,
    type: image.type,
    title: image.title,
    publicId: image.publicId,
    url: image.url
  });
  
  // Conservative approach: Only delete from database if Cloudinary deletion succeeds
  // This prevents orphaned database records but may leave orphaned Cloudinary files
  
  if (image.publicId) {
    try {
      console.log(`Deleting image from Cloudinary: ${image.publicId}`);
      const cloudinaryResult = await deleteFromCloudinary(image.publicId);
      console.log('Cloudinary deletion successful:', cloudinaryResult);
    } catch (cloudinaryError) {
      console.error('Cloudinary deletion failed:', cloudinaryError);
      
      // Check if the error is because the file doesn't exist
      if (cloudinaryError.message?.includes('not found') || 
          cloudinaryError.message?.includes('does not exist') ||
          cloudinaryError.http_code === 404) {
        console.log('Image not found on Cloudinary, proceeding with database deletion');
      } else {
        // For other errors, don't delete from database
        return res.status(500).json({
          success: false,
          message: 'Failed to delete image from cloud storage',
          details: cloudinaryError.message
        });
      }
    }
  } else {
    console.warn('No publicId found for image, skipping Cloudinary deletion');
  }
  
  // Delete from database only after successful Cloudinary deletion
  try {
    console.log(`Deleting image from database: ${image._id}`);
    await Image.findByIdAndDelete(req.params.id);
    console.log('Successfully deleted image from database');
    
    console.log(`✅ Image successfully deleted: ${req.params.id}`);
    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (databaseError) {
    console.error('Database deletion failed:', databaseError);
    console.error('CRITICAL: Image deleted from Cloudinary but database deletion failed');
    
    return res.status(500).json({
      success: false,
      message: 'Failed to delete image from database after cloud deletion',
      details: databaseError.message,
      warning: 'Image was removed from cloud storage but database record remains'
    });
  }
});

module.exports = {
  deleteImage,
  deleteImageConservative // Export both versions
};

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