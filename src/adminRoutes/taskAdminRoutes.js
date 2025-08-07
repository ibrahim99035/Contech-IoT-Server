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
 * @route   GET /api/admin/tasks/get-all-tasks
 * @desc    Get all tasks with comprehensive details
 * @access  Admin only
 */
router.get('/tasks/get-all-tasks', protect, authorizeRoles('admin'), getAllTasks);

/**
 * @route   GET /api/admin/tasks/get-task-by-id/:id
 * @desc    Get specific task by ID with full details
 * @access  Admin only
 */
router.get('/tasks/get-task-by-id/:id', protect, authorizeRoles('admin'), getTaskById);

/**
 * @route   GET /api/admin/tasks/get-task-analytics
 * @desc    Get comprehensive task analytics/statistics
 * @access  Admin only
 */
router.get('/tasks/get-task-analytics', protect, authorizeRoles('admin'), getTaskAnalytics);

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