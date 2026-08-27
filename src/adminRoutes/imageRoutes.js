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
/**
 * @openapi
 * /api/images/list:
 *   get:
 *     summary: Fetch paginated list of images
 *     tags: [Images]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of images }
 * 
 * /api/images/analytics/stats:
 *   get:
 *     summary: Get image storage analytics and statistics
 *     tags: [Images]
 *     responses:
 *       200: { description: Image statistics }
 * 
 * /api/images/find/by-type/{type}:
 *   get:
 *     summary: Find active image by type category
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Image details }
 * 
 * /api/images/details/{id}:
 *   get:
 *     summary: Get image details by ID
 *     tags: [Images]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Image details }
 * 
 * /api/images/upload/new:
 *   post:
 *     summary: Upload new image (Cloudinary CDN)
 *     tags: [Images]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image, type]
 *             properties:
 *               image: { type: string, format: binary }
 *               type: { type: string }
 *     responses:
 *       201: { description: Image uploaded }
 * 
 * /api/images/update/{id}:
 *   put:
 *     summary: Update image metadata or replace image file
 *     tags: [Images]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Image updated }
 * 
 * /api/images/remove/{id}:
 *   delete:
 *     summary: Delete image record and purge from Cloudinary CDN
 *     tags: [Images]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Image deleted }
 */

router.get('/list', getAllImages);
router.get('/analytics/stats', getImageStats);
router.get('/find/by-type/:type', getImageByType);
router.get('/details/:id', getImageById);

router.post('/upload/new', protect, authorizeRoles('admin'), upload.single('image'), uploadImage);
router.put('/update/:id', protect, authorizeRoles('admin'), upload.single('image'), updateImage);
router.delete('/remove/:id', protect, authorizeRoles('admin'), deleteImage);

module.exports = router;