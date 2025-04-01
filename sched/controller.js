const Task = require('../models/Task');
const Device = require('../models/Device');
const User = require('../models/User');
const taskScheduler = require('../services/taskScheduler');

// Initialize the task service
const initializeTaskService = async () => {
  console.log('Initializing task service...');
  
  // Start the task scheduler
  await taskScheduler.start();
  
  // Activate all tasks that should be active
  const now = new Date();
  const tasksToActivate = await Task.find({
    status: 'scheduled',
    'schedule.startDate': { $lte: now }
  });
  
  console.log(`Activating ${tasksToActivate.length} scheduled tasks...`);
  
  for (const task of tasksToActivate) {
    task.status = 'active';
    task.updateNextExecution();
    await task.save();
    
    if (task.nextExecution) {
      taskScheduler.scheduleTask(task);
    }
  }
  
  console.log('Task service initialized successfully.');
};

// Create a new task
const createTask = async (taskData, userId) => {
  try {
    const {
      name, description, deviceId, action, schedule, conditions, notifications
    } = taskData;
    
    // Create the task
    const newTask = new Task({
      name,
      description,
      creator: userId,
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
    await Device.findByIdAndUpdate(deviceId, {
      $push: { tasks: newTask._id }
    });
    
    // Add the task to the user's tasks array
    await User.findByIdAndUpdate(userId, {
      $push: { tasks: newTask._id }
    });
    
    // Schedule the task if it's active
    if (newTask.status === 'active' && newTask.nextExecution) {
      taskScheduler.scheduleTask(newTask);
    }
    
    return newTask;
  } catch (error) {
    console.error('Error in createTask:', error);
    throw error;
  }
};

// Get tasks for a specific device or user
const getTasks = async (options) => {
  try {
    let query = {};
    
    if (options.deviceId) {
      query.device = options.deviceId;
    }
    
    if (options.userId) {
      query.creator = options.userId;
    }
    
    if (options.status) {
      query.status = options.status;
    }
    
    const tasks = await Task.find(query)
      .populate('creator', 'name email')
      .populate('device', 'name type status')
      .sort(options.sort || '-createdAt');
    
    return tasks;
  } catch (error) {
    console.error('Error in getTasks:', error);
    throw error;
  }
};

// Get tasks due for execution within a timeframe
const getUpcomingTasks = async (timeframeMinutes = 60) => {
  try {
    const now = new Date();
    const future = new Date(now.getTime() + (timeframeMinutes * 60 * 1000));
    
    const tasks = await Task.find({
      status: 'active',
      nextExecution: { $gte: now, $lte: future }
    })
      .populate('creator', 'name email')
      .populate('device', 'name type status')
      .sort('nextExecution');
    
    return tasks;
  } catch (error) {
    console.error('Error in getUpcomingTasks:', error);
    throw error;
  }
};

// Update task status
const updateTaskStatus = async (taskId, newStatus) => {
  try {
    const task = await Task.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }
    
    // Update the status
    task.status = newStatus;
    
    // If activating, make sure nextExecution is updated
    if (newStatus === 'active') {
      task.updateNextExecution();
      
      // Schedule the task if it has a next execution time
      if (task.nextExecution) {
        taskScheduler.scheduleTask(task);
      }
    } 
    // If cancelling or completing, unschedule it
    else if (newStatus === 'cancelled' || newStatus === 'completed') {
      taskScheduler.unscheduleTask(taskId);
    }
    
    await task.save();
    return task;
  } catch (error) {
    console.error('Error in updateTaskStatus:', error);
    throw error;
  }
};

// Delete a task and clean up references
const deleteTask = async (taskId) => {
  try {
    const task = await Task.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
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
    
    return { success: true };
  } catch (error) {
    console.error('Error in deleteTask:', error);
    throw error;
  }
};

// Get task statistics
const getTaskStatistics = async (userId = null) => {
  try {
    let query = {};
    if (userId) {
      query.creator = userId;
    }
    
    const stats = {
      total: await Task.countDocuments(query),
      active: await Task.countDocuments({ ...query, status: 'active' }),
      scheduled: await Task.countDocuments({ ...query, status: 'scheduled' }),
      completed: await Task.countDocuments({ ...query, status: 'completed' }),
      failed: await Task.countDocuments({ ...query, status: 'failed' }),
      cancelled: await Task.countDocuments({ ...query, status: 'cancelled' }),
      upcomingToday: 0,
      executedToday: 0,
      deviceTypes: {}
    };
    
    // Get upcoming tasks for today
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    
    const upcomingTasks = await Task.find({
      ...query,
      status: 'active',
      nextExecution: { $gte: now, $lte: endOfDay }
    });
    stats.upcomingToday = upcomingTasks.length;
    
    // Get executed tasks for today
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    
    const executedTasks = await Task.find({
      ...query,
      lastExecuted: { $gte: startOfDay, $lte: endOfDay }
    });
    stats.executedToday = executedTasks.length;
    
    // Get device type statistics
    const tasks = await Task.find(query).populate('device', 'type');
    
    tasks.forEach(task => {
      if (task.device && task.device.type) {
        stats.deviceTypes[task.device.type] = (stats.deviceTypes[task.device.type] || 0) + 1;
      }
    });
    
    return stats;
  } catch (error) {
    console.error('Error in getTaskStatistics:', error);
    throw error;
  }
};

module.exports = {
  initializeTaskService,
  createTask,
  getTasks,
  getUpcomingTasks,
  updateTaskStatus,
  deleteTask,
  getTaskStatistics
};