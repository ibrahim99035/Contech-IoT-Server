const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const getAllDevices = require('../controllers/admin/device.admin.controllers/getAllDevices');
const getDeviceById = require('../controllers/admin/device.admin.controllers/getDeviceById');
const getFilteredDevices = require('../controllers/admin/device.admin.controllers/getFilteredDevices');
const getDeviceStatistics = require('../controllers/admin/device.admin.controllers/getDeviceStatistics');
const getDevicePerformanceAnalysis = require('../controllers/admin/device.admin.controllers/getDevicePerformanceAnalysis');

/**
 * @route   GET /api/admin/devices/get-all-devices
 * @desc    Get all devices with comprehensive analysis and statistics
 * @access  Admin only
 * @returns {Object} devices - Array of devices with full details
 * @returns {Object} analysis - Comprehensive device analytics including type distribution, status, capabilities
 * @returns {Object} pagination - Pagination information
 */
router.get('/devices/get-all-devices', protect, authorizeRoles('admin'), getAllDevices);

/**
 * @route   GET /api/admin/devices/search-devices
 * @desc    Search and filter devices with advanced filtering options
 * @access  Admin only
 * @query   {String} type - Filter by device type
 * @query   {String} status - Filter by device status
 * @query   {Boolean} activated - Filter by activation status
 * @query   {String} roomId - Filter by room ID
 * @query   {String} creatorId - Filter by creator ID
 * @query   {String} hasCapabilities - Filter by capabilities (brightness/color)
 * @query   {String} search - Search term for device names and types
 * @query   {String} sortBy - Sort field (default: createdAt)
 * @query   {String} sortOrder - Sort order (asc/desc, default: desc)
 * @query   {Number} page - Page number (default: 1)
 * @query   {Number} limit - Items per page (default: 10)
 * @returns {Object} devices - Filtered devices array
 * @returns {Object} pagination - Pagination details with navigation info
 */
router.get('/devices/search-devices', protect, authorizeRoles('admin'), getFilteredDevices);

/**
 * @route   GET /api/admin/devices/get-device-statistics
 * @desc    Get comprehensive device statistics and analytics dashboard
 * @access  Admin only
 * @returns {Object} statistics - Detailed device analytics including growth, type analysis, automation, and capabilities
 */
router.get('/devices/get-device-statistics', protect, authorizeRoles('admin'), getDeviceStatistics);

/**
 * @route   GET /api/admin/devices/get-device-performance-analysis
 * @desc    Get detailed device performance analysis with task execution metrics
 * @access  Admin only
 * @returns {Object} performanceAnalysis - Per-device performance metrics
 * @returns {Object} overallAnalysis - Overall performance statistics and top/poor performing devices
 */
router.get('/devices/get-device-performance-analysis', protect, authorizeRoles('admin'), getDevicePerformanceAnalysis);

/**
 * @route   GET /api/admin/devices/get-device-by-id/:id
 * @desc    Get specific device by ID with full details and analysis
 * @access  Admin only
 * @param   {String} id - Device ID
 * @returns {Object} device - Complete device details with nested data
 * @returns {Object} analysis - Device-specific analytics including tasks, users, and capabilities
 */
router.get('/devices/get-device-by-id/:id', protect, authorizeRoles('admin'), getDeviceById);

module.exports = router;