const Task = require('../../models/Task');
const TaskExecutor = require('./TaskExecutor');
const TaskConditionChecker = require('./TaskConditionChecker');
const TaskNotificationService = require('./TaskNotificationService');
const logger = require('../utils/logger');

class TaskScheduler {
  constructor() {
    this.activeJobs = new Map();
    this.scheduleCheckInterval = 60000; // Check for new tasks every minute
    this.taskExecutor = new TaskExecutor();
    this.conditionChecker = new TaskConditionChecker();
    this.notificationService = new TaskNotificationService();
  }

  // Start the task scheduler service
  async start() {
    logger.info('Starting timezone-aware task scheduler service...');
    
    // Schedule regular checks for new tasks
    setInterval(async () => {
      await this.scheduleUpcomingTasks();
    }, this.scheduleCheckInterval);
    
    // Initial load of upcoming tasks
    await this.scheduleUpcomingTasks();
  }

  // Schedule all upcoming tasks
  async scheduleUpcomingTasks() {
    try {
      const now = new Date();
      const upcomingTasks = await Task.find({
        status: 'active',
        nextExecution: { $ne: null, $gt: now }
      }).populate('device').populate('creator');
      
      logger.info(`Found ${upcomingTasks.length} upcoming tasks to schedule`);
      
      // Schedule each task
      for (const task of upcomingTasks) {
        this.scheduleTask(task);
      }
    } catch (error) {
      logger.error('Error scheduling upcoming tasks:', error);
    }
  }

  // Schedule a specific task (timezone-aware)
  scheduleTask(task) {
    // If the task is already scheduled, remove it first
    if (this.activeJobs.has(task._id.toString())) {
      this.unscheduleTask(task._id.toString());
    }
    
    const now = new Date();
    const executionTime = new Date(task.nextExecution);
    const timeUntilExecution = executionTime.getTime() - now.getTime();
    
    // Only schedule if it's in the future
    if (timeUntilExecution > 0) {
      const formattedExecution = task.getFormattedNextExecution();
      logger.info(`Scheduling task "${task.name}" to execute at ${formattedExecution.formatted} (in ${Math.round(timeUntilExecution/60000)} minutes)`);
      
      // Schedule the task execution
      const timer = setTimeout(async () => {
        await this.executeTask(task._id.toString());
      }, timeUntilExecution);
      
      // Store the timer reference
      this.activeJobs.set(task._id.toString(), timer);
      
      // Schedule notifications if enabled
      this._scheduleNotification(task, executionTime, now);
    }
  }

  // Private method to handle notification scheduling
  _scheduleNotification(task, executionTime, now) {
    if (task.notifications && task.notifications.enabled && task.notifications.beforeExecution > 0) {
      const notificationTime = executionTime.getTime() - (task.notifications.beforeExecution * 60 * 1000);
      const timeUntilNotification = notificationTime - now.getTime();
      
      if (timeUntilNotification > 0) {
        setTimeout(async () => {
          await this.notificationService.sendNotification(task._id.toString(), 'upcoming');
        }, timeUntilNotification);
      }
    }
  }

  // Unschedule a task
  unscheduleTask(taskId) {
    if (this.activeJobs.has(taskId)) {
      clearTimeout(this.activeJobs.get(taskId));
      this.activeJobs.delete(taskId);
      logger.info(`Unscheduled task ${taskId}`);
    }
  }

  // Execute a task
  async executeTask(taskId) {
    try {
      // Remove from active jobs
      this.activeJobs.delete(taskId);

      // Get the task with populated references
      const task = await Task.findById(taskId).populate('device').populate('creator');

      if (!task) {
        logger.error(`Task ${taskId} not found`);
        return;
      }

      const result = await this.taskExecutor.execute(task, this.conditionChecker);
      
      // Schedule next execution if it exists
      if (task.nextExecution) {
        this.scheduleTask(task);
      }

      return result;
    } catch (error) {
      logger.error(`Error processing task execution ${taskId}:`, error);
    }
  }

  // Method to reschedule all tasks for a user when their timezone changes
  async rescheduleUserTasks(userId, newTimezone) {
    try {
      const userTasks = await Task.find({
        creator: userId,
        status: 'active',
        nextExecution: { $ne: null }
      });

      for (const task of userTasks) {
        // Unschedule the current task
        this.unscheduleTask(task._id.toString());
        
        // Update the timezone
        task.timezone = newTimezone;
        
        // Recalculate next execution
        task.updateNextExecution();
        
        // Save the task
        await task.save();
        
        // Reschedule if there's a next execution
        if (task.nextExecution) {
          this.scheduleTask(task);
        }
      }
      
      logger.info(`Rescheduled ${userTasks.length} tasks for user ${userId} to timezone ${newTimezone}`);
    } catch (error) {
      logger.error(`Error rescheduling tasks for user ${userId}:`, error);
    }
  }

  // Get scheduler status for debugging
  getSchedulerStatus() {
    return {
      activeJobs: this.activeJobs.size,
      scheduledTasks: Array.from(this.activeJobs.keys()),
      checkInterval: this.scheduleCheckInterval
    };
  }
}

module.exports = new TaskScheduler();