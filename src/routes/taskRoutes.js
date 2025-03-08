const express = require('express');
const router = express.Router();
const {
  createTask,
  getTasksByUser,
  getTasksByDevice,
  updateTask,
  deleteTask,
} = require('../controllers/control/taskController'); // Adjust the path as necessary

// Middleware for authentication (Ensures user is authenticated)
const { protect } = require('../middleware/authMiddleware');

// Routes Definitions

/**
 * @route   POST /api/tasks
 * @desc    Create a new task. Only users with access to the device can create tasks.
 * @access  Protected (Requires authentication)
 */
router.post('/tasks/create', protect, createTask);

/**
 * @route   GET /api/tasks/user
 * @desc    Retrieve all tasks associated with the authenticated user.
 * @access  Protected (Requires authentication)
 */
router.get('/tasks/user', protect, getTasksByUser);

/**
 * @route   GET /api/tasks/device/:deviceId
 * @desc    Retrieve all tasks associated with a specific device. Only users with access to the device can view tasks.
 * @params  { deviceId: string } - The ID of the device.
 * @access  Protected (Requires authentication)
 */
router.get('/tasks/device/:deviceId', protect, getTasksByDevice);

/**
 * @route   PUT /api/tasks/:id
 * @desc    Update a task. Only the creator of the task can update it.
 * @params  { id: string } - The ID of the task to update.
 * @access  Protected (Requires authentication)
 */
router.put('/tasks/update/:id', protect, updateTask);

/**
 * @route   DELETE /api/tasks/:id
 * @desc    Delete a task. Only the creator of the task can delete it.
 * @params  { id: string } - The ID of the task to delete.
 * @access  Protected (Requires authentication)
 */
router.delete('/tasks/delete/:id', protect, deleteTask);

module.exports = router;