const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
 
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

/**
 * @openapi
 * /admin/dashboard/tasks/get-all-tasks:
 *   get:
 *     summary: Admin - Get all tasks
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of tasks }
 * 
 * /admin/dashboard/tasks/get-task-by-id/{id}:
 *   get:
 *     summary: Admin - Get task details by ID
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Task details }
 * 
 * /admin/dashboard/tasks/get-task-analytics:
 *   get:
 *     summary: Admin - Get task execution analytics
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Task analytics }
 * 
 * /admin/dashboard/tasks/get-tasks-by-status/{status}:
 *   get:
 *     summary: Admin - Get tasks by status
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Tasks list }
 * 
 * /admin/dashboard/tasks/get-tasks-by-recurrence/{type}:
 *   get:
 *     summary: Admin - Get tasks by recurrence type
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Tasks list }
 * 
 * /admin/dashboard/tasks/get-tasks-by-user/{userId}:
 *   get:
 *     summary: Admin - Get tasks by user ID
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Tasks list }
 * 
 * /admin/dashboard/tasks/get-tasks-by-device/{deviceId}:
 *   get:
 *     summary: Admin - Get tasks by device ID
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Tasks list }
 * 
 * /admin/dashboard/tasks/get-tasks-with-history:
 *   get:
 *     summary: Admin - Get tasks with execution history logs
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Tasks with history }
 * 
 * /admin/dashboard/tasks/get-tasks-scheduled-today:
 *   get:
 *     summary: Admin - Get tasks scheduled for today
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Today's tasks }
 * 
 * /admin/dashboard/tasks/get-overdue-tasks:
 *   get:
 *     summary: Admin - Get overdue tasks
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Overdue tasks list }
 * 
 * /admin/dashboard/tasks/search-tasks:
 *   get:
 *     summary: Admin - Search tasks
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Filtered tasks }
 */

router.get('/get-all-tasks', protect, authorizeRoles('admin'), getAllTasks);
router.get('/get-task-by-id/:id', protect, authorizeRoles('admin'), getTaskById);
router.get('/get-task-analytics', protect, authorizeRoles('admin'), getTaskAnalytics);
router.get('/get-tasks-by-status/:status', protect, authorizeRoles('admin'), getTasksByStatus);
router.get('/get-tasks-by-recurrence/:type', protect, authorizeRoles('admin'), getTasksByRecurrence);
router.get('/get-tasks-by-user/:userId', protect, authorizeRoles('admin'), getTasksByUser);
router.get('/get-tasks-by-device/:deviceId', protect, authorizeRoles('admin'), getTasksByDevice);
router.get('/get-tasks-with-history', protect, authorizeRoles('admin'), getTasksWithHistory);
router.get('/get-tasks-scheduled-today', protect, authorizeRoles('admin'), getTasksScheduledToday);
router.get('/get-overdue-tasks', protect, authorizeRoles('admin'), getOverdueTasks);
router.get('/search-tasks', protect, authorizeRoles('admin'), searchTasks);

module.exports = router;