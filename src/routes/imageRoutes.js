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

// Public routes
router.get('/', getAllImages);
router.get('/stats', getImageStats);
router.get('/type/:type', getImageByType);
router.get('/:id', getImageById);

// Protected routes (require authentication)
router.post('/', protect, upload.single('image'), uploadImage);
router.put('/:id', protect, upload.single('image'), updateImage);
router.delete('/:id', protect, deleteImage);

module.exports = router;