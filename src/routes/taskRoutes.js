const express = require('express');
const router = express.Router();
const {
  createTask,
} = require('../controllers/control/tasks/createTask');
const {
  deleteTask,
} = require('../controllers/control/tasks/deleteTask');
const {
  getTaskById,
  getMyTasks,
  getTasksByDevice,
  getAssignedTasks,
  getFilteredTasks,
} = require('../controllers/control/tasks/taskReader');
const {
  updateTaskDetails,
  updateTaskSchedule,
  updateTaskStatus,
  addNotificationRecipient,
} = require('../controllers/control/tasks/taskUpdate');

// Middleware for authentication (Ensures user is authenticated)
const { protect } = require('../middleware/authMiddleware');

const { checkTaskLimits } = require('../middleware/checkSubscriptionLimits');

// 📌 TASK CREATION
/**
 * @route   POST /api/tasks
 * @desc    Create a new task for a device
 * @access  Protected (Requires authentication)
 */
router.post('/tasks/create-task', protect, checkTaskLimits, createTask);

// 📌 TASK RETRIEVAL
/**
 * @route   GET /api/tasks/:taskId
 * @desc    Retrieve a specific task by its ID
 * @params  { taskId: string } - The ID of the task
 * @access  Protected (User must have access to the task or device)
 */
router.get('/tasks/get-task/:taskId', protect, getTaskById);

/**
 * @route   GET /api/tasks/user/my-tasks
 * @desc    Retrieve all tasks created by the authenticated user
 * @access  Protected (Requires authentication)
 */
router.get('/tasks/user/my-tasks', protect, getMyTasks);

/**
 * @route   GET /api/tasks/device/:deviceId
 * @desc    Retrieve all tasks assigned to a specific device
 * @params  { deviceId: string } - The ID of the device
 * @access  Protected (User must have access to the device)
 */
router.get('/tasks/get-tasks/device/:deviceId', protect, getTasksByDevice);

/**
 * @route   GET /api/tasks/assigned
 * @desc    Retrieve tasks where the user is a notification recipient
 * @access  Protected (Requires authentication)
 */
router.get('/tasks/user/assigned', protect, getAssignedTasks);

/**
 * @route   GET /api/tasks/filter
 * @desc    Retrieve tasks based on filters such as status, date range, and sorting
 * @query   { status, startDate, endDate, sort, limit, page }
 * @access  Protected (Requires authentication)
 */
router.get('/tasks/filter', protect, getFilteredTasks);

// 📌 TASK UPDATES
/**
 * @route   PUT /api/tasks/:taskId/details
 * @desc    Update task details (name, description, action)
 * @params  { taskId: string } - The ID of the task
 * @access  Protected (Only task/device creator or authorized users)
 */
router.put('/tasks/update/:taskId/details', protect, updateTaskDetails);

/**
 * @route   PUT /api/tasks/:taskId/schedule
 * @desc    Update task schedule (start time, recurrence, etc.)
 * @params  { taskId: string } - The ID of the task
 * @access  Protected (Only task/device creator or authorized users)
 */
router.put('/tasks/:taskId/schedule/update', protect, updateTaskSchedule);

/**
 * @route   PUT /api/tasks/:taskId/status
 * @desc    Update the status of a task (e.g., scheduled, active, completed)
 * @params  { taskId: string } - The ID of the task
 * @access  Protected (Only task/device creator or authorized users)
 */
router.put('/tasks/:taskId/status', protect, updateTaskStatus);

/**
 * @route   PUT /api/tasks/:taskId/notifications
 * @desc    Add a notification recipient to a task
 * @params  { taskId: string } - The ID of the task
 * @access  Protected (Only task/device creator or authorized users)
 */
router.put('/tasks/:taskId/notifications/add-recepiant', protect, addNotificationRecipient);

// 📌 TASK DELETION
/**
 * @route   DELETE /api/tasks/:taskId
 * @desc    Delete a specific task by ID
 * @params  { taskId: string } - The ID of the task
 * @access  Protected (Only task/device creator can delete)
 */
router.delete('/tasks/delete-task/:taskId', protect, deleteTask);

module.exports = router;