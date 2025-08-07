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

/**
 * @route   GET /api/admin/users/get-all-users
 * @desc    Get all users with comprehensive analysis and statistics
 * @access  Private/Admin
 */
router.get('/users/get-all-users', protect, authorizeRoles('admin'), getAllUsers);

/**
 * @route   GET /api/admin/users/search-users
 * @desc    Search and filter users with advanced filtering and pagination
 * @access  Private/Admin
 * @query   role, active, emailActivated, search, sortBy, sortOrder, page, limit
 */
router.get('/users/search-users', protect, authorizeRoles('admin'), getFilteredUsers);

/**
 * @route   GET /api/admin/users/user-statistics
 * @desc    Get comprehensive user statistics and analytics dashboard
 * @access  Private/Admin
 */
router.get('/users/user-statistics', protect, authorizeRoles('admin'), getUserStatistics);

/**
 * @route   GET /api/admin/users/get-user-by-id/:id
 * @desc    Get specific user by ID with full details and analysis
 * @access  Private/Admin
 */
router.get('/users/get-user-by-id/:id', protect, authorizeRoles('admin'), getUserById);

/**
 * @route   PUT /api/admin/users/update-user-role-admin-action/:id
 * @desc    Update user role (admin only action)
 * @access  Private/Admin
 * @body    { role: 'admin' | 'moderator' | 'customer' }
 */
router.put('/users/update-user-role/:id', protect, authorizeRoles('admin'), updateUserRole);

/**
 * @route   DELETE /api/admin/users/delete-account/:id
 * @desc    Delete user account permanently (admin only action)
 * @access  Private/Admin
 */
router.delete('/users/delete-account/:id', protect, authorizeRoles('admin'), deleteUser);

module.exports = router;