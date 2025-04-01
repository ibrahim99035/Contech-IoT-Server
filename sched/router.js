const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Device = require('../models/Device');
const User = require('../models/User');
const { authMiddleware, isOwnerOrAdmin } = require('../middleware/auth');
const taskScheduler = require('../services/taskScheduler');

// Get all tasks accessible to the user
router.get('/', authMiddleware, async (req, res) => {
  try {
    let tasks;
    
    // Admins can see all tasks
    if (req.user.role === 'admin') {
      tasks = await Task.find()
        .populate('creator', 'name email')
        .populate('device', 'name type status')
        .sort('-createdAt');
    } else {
      // Regular users can see their own tasks and tasks related to their devices
      const userDevices = await Device.find({ users: req.user._id }).select('_id');
      const deviceIds = userDevices.map(device => device._id);
      
      tasks = await Task.find({
        $or: [
          { creator: req.user._id },
          { device: { $in: deviceIds } }
        ]
      })
        .populate('creator', 'name email')
        .populate('device', 'name type status')
        .sort('-createdAt');
    }
    
    res.json(tasks);
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get tasks for a specific device
router.get('/device/:deviceId', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Check if user has access to this device
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // Check if user has access to the device
    if (req.user.role !== 'admin' && 
        !device.users.includes(req.user._id) && 
        !device.creator.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to access this device' });
    }
    
    const tasks = await Task.find({ device: deviceId })
      .populate('creator', 'name email')
      .populate('device', 'name type status')
      .sort('-createdAt');
    
    res.json(tasks);
  } catch (error) {
    console.error('Error getting device tasks:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a specific task
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('creator', 'name email')
      .populate('device', 'name type status')
      .populate('notifications.recipients', 'name email');
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check if user has access to this task
    if (req.user.role !== 'admin' && 
        !task.creator.equals(req.user._id)) {
      // Check if user has access to the device
      const device = await Device.findById(task.device);
      if (!device || (!device.users.includes(req.user._id) && !device.creator.equals(req.user._id))) {
        return res.status(403).json({ message: 'Not authorized to access this task' });
      }
    }
    
    res.json(task);
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new task
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      name, description, deviceId, action, schedule, conditions, notifications
    } = req.body;
    
    // Check if device exists and user has access
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // Check if user has access to the device
    if (req.user.role !== 'admin' && 
        !device.users.includes(req.user._id) && 
        !device.creator.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to access this device' });
    }
    
    // Create the task
    const newTask = new Task({
      name,
      description,
      creator: req.user._id,
      device: deviceId,
      action,
      schedule,
      conditions: conditions || [],
      notifications: notifications || { enabled: false }
    });
    
    // Set status to active if the start date is today or in the past
    const now = new Date();
    const startDate = new Date(schedule.startDate);
    startDate.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    
    if (startDate <= now) {
      newTask.status = 'active';
    }
    
    // Save the task
    await newTask.save();
    
    // Add the task to the device's tasks array
    device.tasks.push(newTask._id);
    await device.save();
    
    // Add the task to the user's tasks array
    await User.findByIdAndUpdate(req.user._id, {
      $push: { tasks: newTask._id }
    });
    
    // Schedule the task if it's active
    if (newTask.status === 'active' && newTask.nextExecution) {
      taskScheduler.scheduleTask(newTask);
    }
    
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a task
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    const {
      name, description, deviceId, action, schedule, conditions, notifications, status
    } = req.body;
    
    // Find the task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check if user has permission to update this task
    if (req.user.role !== 'admin' && !task.creator.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to update this task' });
    }
    
    // Check if device is being changed and if user has access to the new device
    if (deviceId && !task.device.equals(deviceId)) {
      const device = await Device.findById(deviceId);
      if (!device) {
        return res.status(404).json({ message: 'Device not found' });
      }
      
      // Check if user has access to the new device
      if (req.user.role !== 'admin' && 
          !device.users.includes(req.user._id) && 
          !device.creator.equals(req.user._id)) {
        return res.status(403).json({ message: 'Not authorized to access this device' });
      }
      
      // Remove task from old device's tasks array
      await Device.findByIdAndUpdate(task.device, {
        $pull: { tasks: taskId }
      });
      
      // Add task to new device's tasks array
      await Device.findByIdAndUpdate(deviceId, {
        $push: { tasks: taskId }
      });
      
      // Update the task's device
      task.device = deviceId;
    }
    
    // Update basic fields
    if (name) task.name = name;
    if (description !== undefined) task.description = description;
    if (action) task.action = action;
    if (schedule) task.schedule = schedule;
    if (conditions) task.conditions = conditions;
    if (notifications) task.notifications = notifications;
    
    // Handle status changes
    if (status && status !== task.status) {
      task.status = status;
      
      // If changing to active, make sure nextExecution is updated and task is scheduled
      if (status === 'active') {
        task.updateNextExecution();
        // If task was cancelled or completed, add it back to user and device
        await User.findByIdAndUpdate(task.creator, {
          $addToSet: { tasks: taskId }
        });
        await Device.findByIdAndUpdate(task.device, {
          $addToSet: { tasks: taskId }
        });
      } 
      // If cancelling or completing, unschedule it
      else if (status === 'cancelled' || status === 'completed') {
        taskScheduler.unscheduleTask(taskId);
      }
    }
    
    // Save the updated task
    await task.save();
    
    // Schedule or unschedule based on changes
    if (task.status === 'active' && task.nextExecution) {
      taskScheduler.scheduleTask(task);
    } else {
      taskScheduler.unscheduleTask(taskId);
    }
    
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a task
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    
    // Find the task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check if user has permission to delete this task
    if (req.user.role !== 'admin' && !task.creator.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to delete this task' });
    }
    
    // Unschedule the task
    taskScheduler.unscheduleTask(taskId);
    
    // Remove task from device's tasks array
    await Device.findByIdAndUpdate(task.device, {
      $pull: { tasks: taskId }
    });
    
    // Remove task from user's tasks array
    await User.findByIdAndUpdate(task.creator, {
      $pull: { tasks: taskId }
    });
    
    // Delete the task
    await Task.findByIdAndDelete(taskId);
    
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Execute a task immediately
router.post('/:id/execute', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id;
    
    // Find the task
    const task = await Task.findById(taskId).populate('device');
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check if user has permission to execute this task
    if (req.user.role !== 'admin' && !task.creator.equals(req.user._id)) {
      // Check if user has access to the device
      const device = await Device.findById(task.device);
      if (!device || (!device.users.includes(req.user._id) && !device.creator.equals(req.user._id))) {
        return res.status(403).json({ message: 'Not authorized to execute this task' });
      }
    }
    
    // Execute the task immediately
    await taskScheduler.executeTask(taskId);
    
    // Get the updated task
    const updatedTask = await Task.findById(taskId);
    
    res.json({
      message: 'Task executed successfully',
      task: updatedTask
    });
  } catch (error) {
    console.error('Error executing task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;