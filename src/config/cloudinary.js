/**
 * Cloudinary Configuration
 * Configures Cloudinary SDK, multer storage, and image utility functions.
 * @module config/cloudinary
 */

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const logger = require('./logger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Test Cloudinary connection on startup
const testConnection = async () => {
  try {
    await cloudinary.api.ping();
    logger.info('Cloudinary connected successfully');
    return true;
  } catch (error) {
    logger.error('Cloudinary connection failed', { error: error.message });
    return false;
  }
};

// Test connection when module loads
if (process.env.CLOUDINARY_CLOUD_NAME) {
  testConnection();
}

// Storage configuration with custom handling
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const publicId = `room_${timestamp}_${randomString}`;

    return {
      folder: 'room-images',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      public_id: publicId,
      transformation: [
        { width: 1920, height: 1080, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ],
      resource_type: 'image',
      use_filename: false,
      unique_filename: false
    };
  }
});

// Enhanced multer configuration with error handling
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/**
 * Delete an image from Cloudinary by public ID.
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Deletion result
 */
const deleteFromCloudinary = async (publicId) => {
  const cleanPublicId = publicId?.includes('/') ? publicId : `room-images/${publicId}`;

  if (!cleanPublicId || cleanPublicId === 'undefined' || cleanPublicId === 'room-images/undefined') {
    throw new Error('Valid public ID is required for deletion');
  }

  try {
    const result = await cloudinary.uploader.destroy(cleanPublicId);
    logger.info('Image deleted from Cloudinary', { publicId: cleanPublicId, result: result.result });
    return result;
  } catch (error) {
    logger.error('Cloudinary deletion error', { publicId: cleanPublicId, error: error.message });
    throw new Error('Failed to delete image from Cloudinary');
  }
};

/**
 * Get image details from Cloudinary.
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Image details
 */
const getImageDetails = async (publicId) => {
  try {
    return await cloudinary.api.resource(publicId);
  } catch (error) {
    logger.error('Error getting image details', { publicId, error: error.message });
    throw new Error('Failed to get image details');
  }
};

/**
 * Extract clean public_id from multer response.
 * @param {Object} file - Multer file object
 * @returns {string|null} Public ID
 */
const extractPublicId = (file) => {
  if (!file) return null;
  if (file.public_id) return file.public_id;
  if (file.filename) {
    return file.filename.includes('/') ? file.filename.split('/').pop() : file.filename;
  }
  return null;
};

/**
 * Get secure URL from multer response.
 * @param {Object} file - Multer file object
 * @returns {string|null} Secure URL
 */
const extractSecureUrl = (file) => {
  if (!file) return null;
  return file.secure_url || file.path || file.url || null;
};

module.exports = {
  cloudinary,
  upload,
  deleteFromCloudinary,
  getImageDetails,
  extractPublicId,
  extractSecureUrl
};