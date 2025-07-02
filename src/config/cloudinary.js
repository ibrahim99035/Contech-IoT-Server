const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Test Cloudinary connection on startup
const testConnection = async () => {
  try {
    const result = await cloudinary.api.ping();
    console.log('✅ Cloudinary connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Cloudinary connection failed:', error.message);
    return false;
  }
};

// Test connection when module loads
testConnection();

// IMPROVED: Better storage configuration with custom handling
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    console.log('📤 Starting Cloudinary upload for:', file.originalname);
    
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const publicId = `room_${timestamp}_${randomString}`;
    
    console.log('🔑 Generated public_id:', publicId);
    
    return {
      folder: 'room-images',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      public_id: publicId,
      transformation: [
        { width: 1920, height: 1080, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ],
      // Add this to get more detailed response
      resource_type: 'image',
      use_filename: false,
      unique_filename: false
    };
  }
});

// Enhanced multer configuration with better error handling
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('📁 Processing file:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      console.log('✅ File type accepted');
      cb(null, true);
    } else {
      console.error('❌ Invalid file type:', file.mimetype);
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// IMPROVED: Helper function with better error handling and public_id extraction
const deleteFromCloudinary = async (publicId) => {
  // Handle cases where publicId might include folder path
  const cleanPublicId = publicId?.includes('/') ? publicId : `room-images/${publicId}`;
  
  if (!cleanPublicId || cleanPublicId === 'undefined' || cleanPublicId === 'room-images/undefined') {
    console.error('❌ Cannot delete: Invalid publicId:', publicId);
    throw new Error('Valid public ID is required for deletion');
  }
  
  try {
    console.log(`🗑️ Deleting from Cloudinary: ${cleanPublicId}`);
    const result = await cloudinary.uploader.destroy(cleanPublicId);
    console.log('🗑️ Deletion result:', result);
    return result;
  } catch (error) {
    console.error('❌ Cloudinary deletion error:', error);
    throw new Error('Failed to delete image from Cloudinary');
  }
};

// Test upload function for debugging
const testUpload = async () => {
  try {
    // Test with a simple buffer upload
    const testResult = await cloudinary.uploader.upload('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', {
      folder: 'room-images',
      public_id: 'test_upload_' + Date.now()
    });
    console.log('✅ Test upload successful:', testResult.public_id);
    
    // Clean up test image
    await deleteFromCloudinary(testResult.public_id);
    return true;
  } catch (error) {
    console.error('❌ Test upload failed:', error);
    return false;
  }
};

// Helper function to get image details
const getImageDetails = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return result;
  } catch (error) {
    console.error('Error getting image details:', error);
    throw new Error('Failed to get image details');
  }
};

// NEW: Helper function to extract clean public_id from multer response
const extractPublicId = (file) => {
  if (!file) return null;
  
  // Try different properties that might contain the public_id
  if (file.public_id) return file.public_id;
  if (file.filename) {
    // Remove folder prefix if present
    return file.filename.includes('/') ? file.filename.split('/').pop() : file.filename;
  }
  
  return null;
};

// NEW: Helper function to get secure URL from multer response
const extractSecureUrl = (file) => {
  if (!file) return null;
  
  // Try different properties that might contain the URL
  if (file.secure_url) return file.secure_url;
  if (file.path) return file.path;
  if (file.url) return file.url;
  
  return null;
};

module.exports = {
  cloudinary,
  upload,
  deleteFromCloudinary,
  getImageDetails,
  testUpload,
  extractPublicId,  // Export new helper
  extractSecureUrl  // Export new helper
};