const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const getAllUsers = require('../controllers/admin/user.admin.controllers/getAllUsers');
const getUserById = require('../controllers/admin/user.admin.controllers/getUserById');
const getFilteredUsers = require('../controllers/admin/user.admin.controllers/getFilteredUsers');
const getUserStatistics = require('../controllers/admin/user.admin.controllers/getUserStatistics');
const updateUserRole = require('../controllers/admin/user.admin.controllers/updateUserRole');
const deleteUser = require('../controllers/admin/user.admin.controllers/deleteUser');

const getAllApartments = require('../controllers/admin/apartment.admin.controllers/getAllApartments');
const getApartmentById = require('../controllers/admin/apartment.admin.controllers/getApartmentById');
const getFilteredApartments = require('../controllers/admin/apartment.admin.controllers/getFilteredApartments');
const getApartmentStatistics = require('../controllers/admin/apartment.admin.controllers/getApartmentStatistics');
const getApartmentMembersAnalysis = require('../controllers/admin/apartment.admin.controllers/getApartmentMembersAnalysis');

const getAllRooms = require('../controllers/admin/room.admin.controllers/getAllRooms');
const getRoomById = require('../controllers/admin/room.admin.controllers/getRoomById');
const getFilteredRooms = require('../controllers/admin/room.admin.controllers/getFilteredRooms');
const getRoomStatistics = require('../controllers/admin/room.admin.controllers/getRoomStatistics');
const getRoomUsageAnalysis = require('../controllers/admin/room.admin.controllers/getRoomUsageAnalysis');

const getAllDevices = require('../controllers/admin/device.admin.controllers/getAllDevices');
const getDeviceById = require('../controllers/admin/device.admin.controllers/getDeviceById');
const getFilteredDevices = require('../controllers/admin/device.admin.controllers/getFilteredDevices');
const getDeviceStatistics = require('../controllers/admin/device.admin.controllers/getDeviceStatistics');
const getDevicePerformanceAnalysis = require('../controllers/admin/device.admin.controllers/getDevicePerformanceAnalysis');
 
const getAllTasks = require('../controllers/admin/task.admin.controllers/getAllTasks');
const getTaskById = require('../controllers/admin/task.admin.controllers/getTaskById');
const getTaskAnalytics = require('../controllers/admin/task.admin.controllers/getTaskAnalytics');
const getTasksByStatus = require('../controllers/admin/task.admin.controllers/getTasksByStatus');
const getTasksByRecurrence = require('../controllers/admin/task.admin.controllers/getTasksByRecurrence');
const getTasksByUser = require('../controllers/admin/task.admin.controllers/getTasksByUser');
const getTasksByDevice = require('../controllers/admin/task.admin.controllers/getTasksByDevice');
const getTasksWithHistory = require('../controllers/admin/task.admin.controllers/getTasksWithHistory');
const getTasksScheduledToday = require('../controllers/admin/task.admin.controllers/getTasksScheduledToday');
const getOverdueTasks = require('../controllers/admin/task.admin.controllers/getOverdueTasks');
const searchTasks = require('../controllers/admin/task.admin.controllers/searchTasks');

// =============================================================================
// USER MANAGEMENT ROUTES
// =============================================================================

/**
 * @route   GET /api/admin/users/get-all-users-with-comprehensive-analysis
 * @desc    Get all users with comprehensive analysis and statistics
 * @access  Private/Admin
 */
router.get('/users/get-all-users-with-comprehensive-analysis', protect, authorizeRoles('admin'), getAllUsers);

/**
 * @route   GET /api/admin/users/search-and-filter-users-with-advanced-options
 * @desc    Search and filter users with advanced filtering and pagination
 * @access  Private/Admin
 * @query   role, active, emailActivated, search, sortBy, sortOrder, page, limit
 */
router.get('/users/search-and-filter-users-with-advanced-options', protect, authorizeRoles('admin'), getFilteredUsers);

/**
 * @route   GET /api/admin/users/get-comprehensive-user-statistics-and-analytics
 * @desc    Get comprehensive user statistics and analytics dashboard
 * @access  Private/Admin
 */
router.get('/users/get-comprehensive-user-statistics-and-analytics', protect, authorizeRoles('admin'), getUserStatistics);

/**
 * @route   GET /api/admin/users/get-user-by-id-with-full-details/:id
 * @desc    Get specific user by ID with full details and analysis
 * @access  Private/Admin
 */
router.get('/users/get-user-by-id-with-full-details/:id', protect, authorizeRoles('admin'), getUserById);

/**
 * @route   PUT /api/admin/users/update-user-role-admin-action/:id
 * @desc    Update user role (admin only action)
 * @access  Private/Admin
 * @body    { role: 'admin' | 'moderator' | 'customer' }
 */
router.put('/users/update-user-role-admin-action/:id', protect, authorizeRoles('admin'), updateUserRole);

/**
 * @route   DELETE /api/admin/users/delete-user-account-permanently/:id
 * @desc    Delete user account permanently (admin only action)
 * @access  Private/Admin
 */
router.delete('/users/delete-user-account-permanently/:id', protect, authorizeRoles('admin'), deleteUser);

// =============================================================================
// APARTMENT MANAGEMENT ROUTES
// =============================================================================

/**
 * @route   GET /api/admin/apartments/get-all-apartments-with-comprehensive-analysis
 * @desc    Get all apartments with comprehensive analysis and statistics
 * @access  Admin only
 * @returns {Object} apartments - Array of apartments with full details
 * @returns {Object} analysis - Comprehensive apartment analytics
 * @returns {Object} pagination - Pagination information
 */
router.get('/apartments/all-apartments-with-analysis', protect, authorizeRoles('admin'), getAllApartments);

/**
 * @route   GET /api/admin/apartments/search-and-filter-apartments-with-advanced-options
 * @desc    Search and filter apartments with advanced filtering options
 * @access  Admin only
 * @query   {String} search - Search term for apartment names
 * @query   {String} creatorId - Filter by creator ID
 * @query   {String} sortBy - Sort field (default: createdAt)
 * @query   {String} sortOrder - Sort order (asc/desc, default: desc)
 * @query   {Number} page - Page number (default: 1)
 * @query   {Number} limit - Items per page (default: 10)
 * @returns {Object} apartments - Filtered apartments array
 * @returns {Object} pagination - Pagination details with navigation info
 */
router.get('/apartments/search-and-filter-apartments-with-advanced-options', protect, authorizeRoles('admin'), getFilteredApartments);

/**
 * @route   GET /api/admin/apartments/get-comprehensive-apartment-statistics-and-analytics
 * @desc    Get comprehensive apartment statistics and analytics dashboard
 * @access  Admin only
 * @returns {Object} statistics - Detailed apartment analytics including growth, distribution, and occupancy
 */
router.get('/apartments/get-comprehensive-apartment-statistics-and-analytics', protect, authorizeRoles('admin'), getApartmentStatistics);

/**
 * @route   GET /api/admin/apartments/get-detailed-apartment-members-analysis
 * @desc    Get detailed analysis of apartment members and user distribution
 * @access  Admin only
 * @returns {Object} membersAnalysis - Per-apartment member analysis
 * @returns {Object} overallAnalysis - Overall membership statistics
 */
router.get('/apartments/get-detailed-apartment-members-analysis', protect, authorizeRoles('admin'), getApartmentMembersAnalysis);

/**
 * @route   GET /api/admin/apartments/get-apartment-by-id-with-full-details/:id
 * @desc    Get specific apartment by ID with full details and analysis
 * @access  Admin only
 * @param   {String} id - Apartment ID
 * @returns {Object} apartment - Complete apartment details with nested data
 * @returns {Object} analysis - Apartment-specific analytics
 */
router.get('/apartments/get-apartment-by-id-with-full-details/:id', protect, authorizeRoles('admin'), getApartmentById);

// =============================================================================
// ROOM MANAGEMENT ROUTES
// =============================================================================

/**
 * @route   GET /api/admin/rooms/get-all-rooms-with-comprehensive-analysis
 * @desc    Get all rooms with comprehensive analysis and statistics
 * @access  Admin only
 * @returns {Object} rooms - Array of rooms with full details
 * @returns {Object} analysis - Comprehensive room analytics including type distribution, device stats, and user access
 * @returns {Object} pagination - Pagination information
 */
router.get('/rooms/get-all-rooms-with-comprehensive-analysis', protect, authorizeRoles('admin'), getAllRooms);

/**
 * @route   GET /api/admin/rooms/search-and-filter-rooms-with-advanced-options
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
router.get('/rooms/search-and-filter-rooms-with-advanced-options', protect, authorizeRoles('admin'), getFilteredRooms);

/**
 * @route   GET /api/admin/rooms/get-comprehensive-room-statistics-and-analytics
 * @desc    Get comprehensive room statistics and analytics dashboard
 * @access  Admin only
 * @returns {Object} statistics - Detailed room analytics including growth, type analysis, security, and occupancy
 */
router.get('/rooms/get-comprehensive-room-statistics-and-analytics', protect, authorizeRoles('admin'), getRoomStatistics);

/**
 * @route   GET /api/admin/rooms/get-detailed-room-usage-analysis-with-device-metrics
 * @desc    Get detailed room usage analysis with device utilization metrics
 * @access  Admin only
 * @returns {Object} usageAnalysis - Per-room usage metrics and device utilization
 * @returns {Object} overallAnalysis - Overall usage statistics and most/least active rooms
 */
router.get('/rooms/get-detailed-room-usage-analysis-with-device-metrics', protect, authorizeRoles('admin'), getRoomUsageAnalysis);

/**
 * @route   GET /api/admin/rooms/get-room-by-id-with-full-details/:id
 * @desc    Get specific room by ID with full details and analysis
 * @access  Admin only
 * @param   {String} id - Room ID
 * @returns {Object} room - Complete room details with nested data
 * @returns {Object} analysis - Room-specific analytics including devices, users, and security
 */
router.get('/rooms/get-room-by-id-with-full-details/:id', protect, authorizeRoles('admin'), getRoomById);

// =============================================================================
// DEVICE MANAGEMENT ROUTES
// =============================================================================

/**
 * @route   GET /api/admin/devices/get-all-devices-with-comprehensive-analysis
 * @desc    Get all devices with comprehensive analysis and statistics
 * @access  Admin only
 * @returns {Object} devices - Array of devices with full details
 * @returns {Object} analysis - Comprehensive device analytics including type distribution, status, capabilities
 * @returns {Object} pagination - Pagination information
 */
router.get('/devices/get-all-devices-with-comprehensive-analysis', protect, authorizeRoles('admin'), getAllDevices);

/**
 * @route   GET /api/admin/devices/search-and-filter-devices-with-advanced-options
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
router.get('/devices/search-and-filter-devices-with-advanced-options', protect, authorizeRoles('admin'), getFilteredDevices);

/**
 * @route   GET /api/admin/devices/get-comprehensive-device-statistics-and-analytics
 * @desc    Get comprehensive device statistics and analytics dashboard
 * @access  Admin only
 * @returns {Object} statistics - Detailed device analytics including growth, type analysis, automation, and capabilities
 */
router.get('/devices/get-comprehensive-device-statistics-and-analytics', protect, authorizeRoles('admin'), getDeviceStatistics);

/**
 * @route   GET /api/admin/devices/get-detailed-device-performance-analysis
 * @desc    Get detailed device performance analysis with task execution metrics
 * @access  Admin only
 * @returns {Object} performanceAnalysis - Per-device performance metrics
 * @returns {Object} overallAnalysis - Overall performance statistics and top/poor performing devices
 */
router.get('/devices/get-detailed-device-performance-analysis', protect, authorizeRoles('admin'), getDevicePerformanceAnalysis);

/**
 * @route   GET /api/admin/devices/get-device-by-id-with-full-details/:id
 * @desc    Get specific device by ID with full details and analysis
 * @access  Admin only
 * @param   {String} id - Device ID
 * @returns {Object} device - Complete device details with nested data
 * @returns {Object} analysis - Device-specific analytics including tasks, users, and capabilities
 */
router.get('/devices/get-device-by-id-with-full-details/:id', protect, authorizeRoles('admin'), getDeviceById);

// =============================================================================
// TASK MANAGEMENT ROUTES
// =============================================================================

/**
 * @route   GET /api/admin/tasks/get-all-tasks-with-comprehensive-details
 * @desc    Get all tasks with comprehensive details
 * @access  Admin only
 */
router.get('/tasks/get-all-tasks-with-comprehensive-details', protect, authorizeRoles('admin'), getAllTasks);

/**
 * @route   GET /api/admin/tasks/get-task-by-id-with-full-details/:id
 * @desc    Get specific task by ID with full details
 * @access  Admin only
 */
router.get('/tasks/get-task-by-id-with-full-details/:id', protect, authorizeRoles('admin'), getTaskById);

/**
 * @route   GET /api/admin/tasks/get-comprehensive-task-analytics
 * @desc    Get comprehensive task analytics/statistics
 * @access  Admin only
 */
router.get('/tasks/get-comprehensive-task-analytics', protect, authorizeRoles('admin'), getTaskAnalytics);

/**
 * @route   GET /api/admin/tasks/get-tasks-by-status/:status
 * @desc    Get tasks by status
 * @access  Admin only
 */
router.get('/tasks/get-tasks-by-status/:status', protect, authorizeRoles('admin'), getTasksByStatus);

/**
 * @route   GET /api/admin/tasks/get-tasks-by-recurrence/:type
 * @desc    Get tasks by recurrence type
 * @access  Admin only
 */
router.get('/tasks/get-tasks-by-recurrence/:type', protect, authorizeRoles('admin'), getTasksByRecurrence);

/**
 * @route   GET /api/admin/tasks/get-tasks-by-user/:userId
 * @desc    Get tasks by user ID
 * @access  Admin only
 */
router.get('/tasks/get-tasks-by-user/:userId', protect, authorizeRoles('admin'), getTasksByUser);

/**
 * @route   GET /api/admin/tasks/get-tasks-by-device/:deviceId
 * @desc    Get tasks by device ID
 * @access  Admin only
 */
router.get('/tasks/get-tasks-by-device/:deviceId', protect, authorizeRoles('admin'), getTasksByDevice);

/**
 * @route   GET /api/admin/tasks/get-tasks-with-history
 * @desc    Get tasks with execution history
 * @access  Admin only
 */
router.get('/tasks/get-tasks-with-history', protect, authorizeRoles('admin'), getTasksWithHistory);

/**
 * @route   GET /api/admin/tasks/get-tasks-scheduled-today
 * @desc    Get tasks scheduled for today (optionally pass ?timezone=)
 * @access  Admin only
 */
router.get('/tasks/get-tasks-scheduled-today', protect, authorizeRoles('admin'), getTasksScheduledToday);

/**
 * @route   GET /api/admin/tasks/get-overdue-tasks
 * @desc    Get overdue tasks
 * @access  Admin only
 */
router.get('/tasks/get-overdue-tasks', protect, authorizeRoles('admin'), getOverdueTasks);

/**
 * @route   GET /api/admin/tasks/search-tasks
 * @desc    Search tasks (query: q, status, recurrence, creator, device)
 * @access  Admin only
 */
router.get('/tasks/search-tasks', protect, authorizeRoles('admin'), searchTasks);

module.exports = router;