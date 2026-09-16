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

/**
 * @openapi
 * /api/task-handler/tasks/create-task:
 *   post:
 *     summary: Create a new scheduled task for a device
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, device, nextExecution]
 *             properties:
 *               name: { type: string, example: "Night Light Off" }
 *               device: { type: string }
 *               nextExecution: { type: string, format: "date-time" }
 *               action: { type: string, example: "off" }
 *     responses:
 *       201: { description: Task created }
 *       403: { description: Limit reached }
 * 
 * /api/task-handler/tasks/get-task/{taskId}:
 *   get:
 *     summary: Get task details by ID
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Task details }
 * 
 * /api/task-handler/tasks/user/my-tasks:
 *   get:
 *     summary: Get tasks created by current user
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: User tasks list }
 * 
 * /api/task-handler/tasks/get-tasks/device/{deviceId}:
 *   get:
 *     summary: Get all tasks assigned to a device
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Device tasks list }
 * 
 * /api/task-handler/tasks/user/assigned:
 *   get:
 *     summary: Get tasks where user is notification recipient
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Assigned tasks list }
 * 
 * /api/task-handler/tasks/filter:
 *   get:
 *     summary: Filter tasks by status, date range, or sorting
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Filtered tasks list }
 * 
 * /api/task-handler/tasks/update/{taskId}/details:
 *   put:
 *     summary: Update task name or description
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Task updated }
 * 
 * /api/task-handler/tasks/{taskId}/schedule/update:
 *   put:
 *     summary: Update task schedule or recurrence
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Schedule updated }
 * 
 * /api/task-handler/tasks/{taskId}/status:
 *   put:
 *     summary: Update task status (active/paused)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Status updated }
 * 
 * /api/task-handler/tasks/{taskId}/notifications/add-recepiant:
 *   put:
 *     summary: Add notification recipient to task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Recipient added }
 * 
 * /api/task-handler/tasks/delete-task/{taskId}:
 *   delete:
 *     summary: Delete a scheduled task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Task deleted }
 */

router.post('/tasks/create-task', protect, checkTaskLimits, createTask);
router.get('/tasks/get-task/:taskId', protect, getTaskById);
router.get('/tasks/user/my-tasks', protect, getMyTasks);
router.get('/tasks/get-tasks/device/:deviceId', protect, getTasksByDevice);
router.get('/tasks/user/assigned', protect, getAssignedTasks);
router.get('/tasks/filter', protect, getFilteredTasks);
router.put('/tasks/update/:taskId/details', protect, updateTaskDetails);
router.put('/tasks/:taskId/schedule/update', protect, updateTaskSchedule);
router.put('/tasks/:taskId/status', protect, updateTaskStatus);
router.put('/tasks/:taskId/notifications/add-recepiant', protect, addNotificationRecipient);
router.delete('/tasks/delete-task/:taskId', protect, deleteTask);

module.exports = router;