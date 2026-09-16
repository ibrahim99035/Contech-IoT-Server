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
 * @openapi
 * /admin/dashboard/users/get-all-users:
 *   get:
 *     summary: Admin - Get all users
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of users }
 * 
 * /admin/dashboard/users/search-users:
 *   get:
 *     summary: Admin - Search users
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Filtered users list }
 * 
 * /admin/dashboard/users/user-statistics:
 *   get:
 *     summary: Admin - Get user statistics
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: User statistics analytics }
 * 
 * /admin/dashboard/users/get-user-by-id/{id}:
 *   get:
 *     summary: Admin - Get user by ID
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User details }
 * 
 * /admin/dashboard/users/update-user-role/{id}:
 *   put:
 *     summary: Admin - Update user role
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [admin, moderator, customer] }
 *     responses:
 *       200: { description: User role updated }
 * 
 * /admin/dashboard/users/delete-account/{id}:
 *   delete:
 *     summary: Admin - Delete user account permanently
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User deleted }
 */

router.get('/get-all-users', protect, authorizeRoles('admin'), getAllUsers);
router.get('/search-users', protect, authorizeRoles('admin'), getFilteredUsers);
router.get('/user-statistics', protect, authorizeRoles('admin'), getUserStatistics);
router.get('/get-user-by-id/:id', protect, authorizeRoles('admin'), getUserById);
router.put('/update-user-role/:id', protect, authorizeRoles('admin'), updateUserRole);
router.delete('/delete-account/:id', protect, authorizeRoles('admin'), deleteUser);

module.exports = router;