const express = require('express');
const router = express.Router();
const {
  getAllImages,
  getImageById,
  getImageByType,
  uploadImage,
  updateImage,
  deleteImage,
  getImageStats
} = require('../controllers/imageController');

const { upload } = require('../config/cloudinary');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
// ============================================================================
// PUBLIC ROUTES (No authentication required)
// ============================================================================

/**
 * GET /api/images/list
 * 
 * Endpoint: GET /api/images/list
 * Access: Public
 * Purpose: Fetch paginated list of images with optional filters
 * 
 * Query Parameters:
 * - type (string, optional): Filter by specific image type (e.g., 'profile', 'banner', 'thumbnail')
 * - isActive (boolean, optional): Filter by active status ('true'/'false')
 * - page (number, optional): Page number for pagination (default: 1, min: 1)
 * - limit (number, optional): Items per page (default: 10, max: 100)
 * - sortBy (string, optional): Sort field ('createdAt', 'updatedAt', 'type', 'size') (default: 'createdAt')
 * - sortOrder (string, optional): Sort direction ('asc', 'desc') (default: 'desc')
 * - search (string, optional): Search in title, description, or tags
 * 
 * Response Format:
 * {
 *   success: true,
 *   data: [array of image objects with user info],
 *   pagination: {
 *     current: number,
 *     pages: number,
 *     total: number,
 *     hasNext: boolean,
 *     hasPrev: boolean
 *   },
 *   filters: {
 *     type: string|null,
 *     isActive: boolean|null,
 *     search: string|null
 *   }
 * }
 */
router.get('/list', getAllImages);

/**
 * GET /api/images/analytics/stats
 * 
 * Endpoint: GET /api/images/analytics/stats
 * Access: Public
 * Purpose: Provide dashboard-ready statistics for monitoring and reporting
 * 
 * Response Format:
 * {
 *   success: true,
 *   data: {
 *     overview: {
 *       total: number,
 *       active: number,
 *       inactive: number,
 *       totalStorageUsed: number (in bytes),
 *       averageFileSize: number
 *     },
 *     byType: [
 *       {
 *         _id: "type_name",
 *         count: number,
 *         totalSize: number,
 *         activeCount: number,
 *         inactiveCount: number,
 *         averageSize: number
 *       }
 *     ],
 *     byFormat: [
 *       {
 *         format: string,
 *         count: number,
 *         totalSize: number
 *       }
 *     ],
 *     uploadTrends: {
 *       lastWeek: number,
 *       lastMonth: number,
 *       thisYear: number
 *     }
 *   },
 *   generatedAt: ISO_Date_String
 * }
 *
 */
router.get('/analytics/stats', getImageStats);

/**
 * GET /api/images/find/by-type/:type
 * 
 * Endpoint: GET /api/images/find/by-type/:type
 * Access: Public
 * Purpose: Fetch the current active image for a specific type/category
 * 
 * Path Parameters:
 * - type (string, required)
 * 
 * Response Format:
 * {
 *   success: true,
 *   data: {
 *     id: string,
 *     url: string,
 *     type: string,
 *     title: string,
 *     description: string,
 *     dimensions: { width: number, height: number },
 *     format: string,
 *     size: number,
 *     uploadedBy: { name: string, email: string },
 *     createdAt: ISO_Date,
 *     updatedAt: ISO_Date
 *   },
 *   meta: {
 *     requestedType: string,
 *     fetchedAt: ISO_Date
 *   }
 * }
 * 
 */
router.get('/find/by-type/:type', getImageByType);

/**
 * GET /api/images/details/:id
 * 
 * Endpoint: GET /api/images/details/:id
 * Access: Public
 * Purpose: Fetch comprehensive information about a single image
 * 
 * Path Parameters:
 * - id (string, required): MongoDB ObjectId of the image (24-character hex string)
 * 
 * Response Format:
 * {
 *   success: true,
 *   data: {
 *     id: string,
 *     url: string,
 *     publicId: string,
 *     type: string,
 *     title: string,
 *     description: string,
 *     tags: [array of strings],
 *     dimensions: { width: number, height: number },
 *     size: number,
 *     format: string,
 *     isActive: boolean,
 *     uploadedBy: {
 *       id: string,
 *       name: string,
 *       email: string
 *     },
 *     createdAt: ISO_Date,
 *     updatedAt: ISO_Date
 *   },
 *   meta: {
 *     requestedId: string,
 *     fetchedAt: ISO_Date
 *   }
 * }
 * 
 */
router.get('/details/:id', getImageById);

// ============================================================================
// PROTECTED ROUTES (Authentication required)
// ============================================================================

/**
 * POST /api/images/upload/new
 * 
 * Endpoint: POST /api/images/upload/new
 * Access: Protected (Requires valid JWT token)
 * Purpose: Create a new image record with file upload and metadata
 * 
 * Authentication: Bearer token in Authorization header
 * Content-Type: multipart/form-data
 * 
 * Required Form Fields:
 * - image (file, required): Image file to upload
 *   - Supported formats: JPG, JPEG, PNG, GIF, WebP, SVG
 *   - Max size: Check Cloudinary configuration (usually 10MB)
 *   - Field name must be exactly 'image'
 * - type (string, required): Unique identifier for image type
 *   - Examples: 'site-logo', 'hero-banner', 'user-avatar', 'product-thumbnail'
 *   - Must be unique across the system
 *   - Recommend using kebab-case naming convention
 * 
 * Optional Form Fields:
 * - title (string): Human-readable display title
 * - description (string): Detailed description of the image
 * - tags (string|array): Comma-separated tags or array of strings
 *   - Examples: "logo,branding,main" or ["logo", "branding", "main"]
 * 
 * Success Response Format:
 * {
 *   success: true,
 *   message: "Image uploaded successfully",
 *   data: {
 *     id: string,
 *     url: string (Cloudinary URL),
 *     publicId: string (Cloudinary public ID),
 *     type: string,
 *     title: string,
 *     description: string,
 *     tags: [array of strings],
 *     dimensions: { width: number, height: number },
 *     size: number (bytes),
 *     format: string,
 *     isActive: true,
 *     uploadedBy: { id, name, email },
 *     createdAt: ISO_Date,
 *     updatedAt: ISO_Date
 *   },
 *   upload: {
 *     cloudinaryResponse: object,
 *     processingTime: number (ms)
 *   }
 * }
 * 
 */
router.post('/upload/new', protect, authorizeRoles('admin'), upload.single('image'), uploadImage);

/**
 * PUT /api/images/update/:id
 * 
 * Endpoint: PUT /api/images/update/:id
 * Access: Protected (Requires valid JWT token)
 * Purpose: Modify existing image record (file replacement and/or metadata update)
 * 
 * Path Parameters:
 * - id (string, required): MongoDB ObjectId of the image to update
 *   - Format: 24-character hexadecimal string
 *   - Example: 64a8f9e1234567890abcdef0
 * 
 * Authentication: Bearer token in Authorization header
 * Content-Type: multipart/form-data
 * 
 * Success Response Format:
 * {
 *   success: true,
 *   message: "Image updated successfully",
 *   data: {updated image object with all current values},
 *   changes: {
 *     fieldsUpdated: [array of changed field names],
 *     fileReplaced: boolean,
 *     previousValues: object (for audit trail)
 *   }
 * }
 * 
 */
router.put('/update/:id', protect, authorizeRoles('admin'), upload.single('image'), updateImage);

/**
 * DELETE /api/images/remove/:id
 * 
 * Endpoint: DELETE /api/images/remove/:id
 * Access: Protected (Requires valid JWT token)
 * Purpose: Complete removal of image record and associated cloud file
 * 
 * Path Parameters:
 * - id (string, required): MongoDB ObjectId of the image to delete
 *   - Format: 24-character hexadecimal string
 * 
 * Authentication: Bearer token in Authorization header
 * Content-Type: application/json (no body required)
 * 
 * Success Response Format:
 * {
 *   success: true,
 *   message: "Image deleted successfully",
 *   deleted: {
 *     id: string,
 *     type: string,
 *     publicId: string (Cloudinary ID that was deleted),
 *     deletedAt: ISO_Date
 *   },
 *   cleanup: {
 *     cloudinaryDeleted: boolean,
 *     databaseDeleted: boolean
 *   }
 * }
 * 
 */
router.delete('/remove/:id', protect, authorizeRoles('admin'), deleteImage);

module.exports = router;