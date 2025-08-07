const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const getAllRooms = require('../controllers/admin/room.admin.controllers/getAllRooms');
const getRoomById = require('../controllers/admin/room.admin.controllers/getRoomById');
const getFilteredRooms = require('../controllers/admin/room.admin.controllers/getFilteredRooms');
const getRoomStatistics = require('../controllers/admin/room.admin.controllers/getRoomStatistics');
const getRoomUsageAnalysis = require('../controllers/admin/room.admin.controllers/getRoomUsageAnalysis');

/**
 * @route   GET /api/admin/dashboard/rooms/get-all-rooms
 * @desc    Get all rooms with comprehensive analysis and statistics
 * @access  Admin only
 * @returns {Object} rooms - Array of rooms with full details
 * @returns {Object} analysis - Comprehensive room analytics including type distribution, device stats, and user access
 * @returns {Object} pagination - Pagination information
 */
router.get('/get-all-rooms', protect, authorizeRoles('admin'), getAllRooms);

/**
 * @route   GET /api/admin/dashboard/rooms/search-rooms
 * @desc    Search and filter rooms with advanced filtering options
 * @access  Admin only
 * @query   {String} type - Filter by room type
 * @query   {String} apartmentId - Filter by apartment ID
 * @query   {String} creatorId - Filter by creator ID
 * @query   {Boolean} hasPassword - Filter by password protection status
 * @query   {String} search - Search term for room names
 * @query   {String} sortBy - Sort field (default: createdAt)
 * @query   {String} sortOrder - Sort order (asc/desc, default: desc)
 * @query   {Number} page - Page number (default: 1)
 * @query   {Number} limit - Items per page (default: 10)
 * @returns {Object} rooms - Filtered rooms array
 * @returns {Object} pagination - Pagination details with navigation info
 */
router.get('/search-rooms', protect, authorizeRoles('admin'), getFilteredRooms);

/**
 * @route   GET /api/admin/dashboard/rooms/room-statistics
 * @desc    Get comprehensive room statistics and analytics dashboard
 * @access  Admin only
 * @returns {Object} statistics - Detailed room analytics including growth, type analysis, security, and occupancy
 */
router.get('/room-statistics', protect, authorizeRoles('admin'), getRoomStatistics);

/**
 * @route   GET /api/admin/dashboard/rooms/get-room-usage-analysis
 * @desc    Get detailed room usage analysis with device utilization metrics
 * @access  Admin only
 * @returns {Object} usageAnalysis - Per-room usage metrics and device utilization
 * @returns {Object} overallAnalysis - Overall usage statistics and most/least active rooms
 */
router.get('/get-room-usage-analysis', protect, authorizeRoles('admin'), getRoomUsageAnalysis);

/**
 * @route   GET /api/admin/dashboard/rooms/get-room-by-id/:id
 * @desc    Get specific room by ID with full details and analysis
 * @access  Admin only
 * @param   {String} id - Room ID
 * @returns {Object} room - Complete room details with nested data
 * @returns {Object} analysis - Room-specific analytics including devices, users, and security
 */
router.get('/get-room-by-id/:id', protect, authorizeRoles('admin'), getRoomById);

module.exports = router;