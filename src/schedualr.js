const Task = require('./models/Task');
const Device = require('./models/Device');
const User = require('./models/User');
const taskEvents = require('./websockets/taskEventEmitter'); 
const moment = require('moment-timezone');

class TaskScheduler {
  constructor() {
    this.activeJobs = new Map();
    this.scheduleCheckInterval = 60000; // Check for new tasks every minute
  }

  // Start the task scheduler service
  async start() {
    console.log('Starting timezone-aware task scheduler service...');
    
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
      // FIXED: Better query to find tasks that need scheduling
      const upcomingTasks = await Task.find({
        status: 'active',
        nextExecution: { 
          $exists: true,
          $ne: null, 
          $gt: now 
        }
      }).populate('device').populate('creator');
      
      console.log(`Found ${upcomingTasks.length} upcoming tasks to schedule`);
      
      // Schedule each task
      for (const task of upcomingTasks) {
        // FIXED: Only schedule if not already scheduled
        if (!this.activeJobs.has(task._id.toString())) {
          this.scheduleTask(task);
        }
      }
    } catch (error) {
      console.error('Error scheduling upcoming tasks:', error);
    }
  }

  // Schedule a specific task (timezone-aware)
  scheduleTask(task) {
    const taskId = task._id.toString();
    
    // If the task is already scheduled, remove it first
    if (this.activeJobs.has(taskId)) {
      this.unscheduleTask(taskId);
    }
    
    const now = new Date();
    const executionTime = new Date(task.nextExecution);
    
    // Calculate milliseconds until execution
    const timeUntilExecution = executionTime.getTime() - now.getTime();
    
    // FIXED: Add minimum time check to avoid immediate execution issues
    if (timeUntilExecution > 1000) { // At least 1 second in the future
      const formattedExecution = task.getFormattedNextExecution();
      console.log(`Scheduling task "${task.name}" (ID: ${taskId}) to execute at ${formattedExecution?.formatted || 'unknown time'} (in ${Math.round(timeUntilExecution/60000)} minutes)`);
      
      // Schedule the task execution
      const timer = setTimeout(async () => {
        await this.executeTask(taskId);
      }, timeUntilExecution);
      
      // Store the timer reference
      this.activeJobs.set(taskId, timer);
      
      // Schedule notifications if enabled
      if (task.notifications && task.notifications.enabled && task.notifications.beforeExecution > 0) {
        const notificationTime = executionTime.getTime() - (task.notifications.beforeExecution * 60 * 1000);
        const timeUntilNotification = notificationTime - now.getTime();
        
        if (timeUntilNotification > 1000) { // At least 1 second in the future
          setTimeout(async () => {
            await this.sendNotification(taskId, 'upcoming');
          }, timeUntilNotification);
        }
      }
    } else {
      console.log(`Task "${task.name}" (ID: ${taskId}) execution time is too soon or in the past, skipping scheduling`);
    }
  }

  // Unschedule a task
  unscheduleTask(taskId) {
    if (this.activeJobs.has(taskId)) {
      clearTimeout(this.activeJobs.get(taskId));
      this.activeJobs.delete(taskId);
      console.log(`Unscheduled task ${taskId}`);
    }
  }

  async executeTask(taskId) {
    try {
      // Remove from active jobs first
      this.activeJobs.delete(taskId);

      // Get the task with populated references
      const task = await Task.findById(taskId).populate('device').populate('creator');

      if (!task) {
        console.error(`Task ${taskId} not found during execution`);
        return;
      }

      // FIXED: Check if task is still active before executing
      if (task.status !== 'active') {
        console.log(`Task "${task.name}" is no longer active (status: ${task.status}), skipping execution`);
        return;
      }

      const executionTimeInUserTz = task.getFormattedNextExecution();
      console.log(`Executing task: ${task.name} (scheduled for ${executionTimeInUserTz?.formatted || 'unknown time'})`);
      console.log(`Task action: ${task.action.type} = ${task.action.value}`);

      // Check if conditions are met before executing
      if (task.conditions && task.conditions.length > 0) {
        const conditionsMet = await this.checkConditions(task);
        if (!conditionsMet) {
          console.log(`Conditions not met for task ${task.name}, skipping execution`);

          // Record the skipped execution
          task.executionHistory.push({
            timestamp: new Date(),
            status: 'failure',
            message: 'Execution conditions not met'
          });

          taskEvents.emit('task-failed', {
            taskId: task._id.toString(),
            name: task.name,
            device: { _id: task.device._id.toString(), name: task.device.name },
            creator: { _id: task.creator._id.toString(), name: task.creator.name },
            message: 'Task skipped: Conditions not met'
          });

          // FIXED: Update next execution and save before scheduling
          task.updateNextExecution();
          await task.save();

          // Schedule next execution if it exists
          if (task.nextExecution && task.status === 'active') {
            this.scheduleTask(task);
          }

          return;
        }
      }

      // Execute the action on the device
      try {
        console.log(`About to perform action: ${task.action.type} = ${task.action.value} on device ${task.device.name}`);
        await this.performDeviceAction(task.device, task.action);

        console.log(`Task executed successfully: ${task.name}`);

        // Record successful execution
        task.executionHistory.push({
          timestamp: new Date(),
          status: 'success',
          message: `Successfully executed action: ${task.action.type} = ${task.action.value}`
        });

        taskEvents.emit('task-executed', {
          _id: task._id.toString(),
          name: task.name,
          device: { _id: task.device._id.toString(), name: task.device.name },
          creator: { _id: task.creator._id.toString(), name: task.creator.name },
          action: task.action
        });

      } catch (error) {
        console.error(`Error executing task ${task.name}:`, error);

        // Record failed execution
        task.executionHistory.push({
          timestamp: new Date(),
          status: 'failure',
          message: `Error: ${error.message}`
        });

        taskEvents.emit('task-failed', {
          taskId: task._id.toString(),
          name: task.name,
          device: { _id: task.device._id.toString(), name: task.device.name },
          creator: { _id: task.creator._id.toString(), name: task.creator.name },
          message: `Task execution failed: ${error.message}`
        });
      }

      // FIXED: Always update execution time and status
      task.lastExecuted = new Date();

      // If it's a one-time task, mark as completed
      if (task.schedule.recurrence.type === 'once') {
        task.status = 'completed';
        task.nextExecution = null;
        console.log(`One-time task "${task.name}" marked as completed`);
      } else {
        // Calculate next execution time (timezone-aware)
        console.log(`Calculating next execution for recurring task "${task.name}"`);
        task.updateNextExecution();

        // If there's no next execution (e.g., end date reached), mark as completed
        if (!task.nextExecution) {
          task.status = 'completed';
          console.log(`Recurring task "${task.name}" has no more executions, marked as completed`);
        }
      }

      // Save the updated task
      await task.save();

      // FIXED: Schedule next execution if it exists and task is still active
      if (task.nextExecution && task.status === 'active') {
        console.log(`Scheduling next execution for task "${task.name}"`);
        this.scheduleTask(task);
      }

    } catch (error) {
      console.error(`Error processing task execution ${taskId}:`, error);
    }
  }

  // FIXED: Add method to handle new task scheduling
  async scheduleNewTask(task) {
    try {
      console.log(`Scheduling new task: ${task.name}`);
      
      // Ensure the task has a next execution time
      if (!task.nextExecution) {
        console.log(`New task "${task.name}" has no next execution time, updating...`);
        task.updateNextExecution();
        await task.save();
      }
      
      // Schedule it if it has an execution time
      if (task.nextExecution && task.status === 'active') {
        this.scheduleTask(task);
      } else {
        console.log(`New task "${task.name}" cannot be scheduled - nextExecution: ${task.nextExecution}, status: ${task.status}`);
      }
    } catch (error) {
      console.error(`Error scheduling new task:`, error);
    }
  }

  // Check if all conditions for a task are met (timezone-aware)
  async checkConditions(task) {
    if (!task.conditions || task.conditions.length === 0) {
      return true;
    }
    
    for (const condition of task.conditions) {
      let conditionMet = false;
      
      switch (condition.type) {
        case 'sensor_value':
          if (condition.device) {
            const sensorDevice = await Device.findById(condition.device);
            if (sensorDevice) {
              const sensorValue = await this.getDeviceValue(sensorDevice);
              
              switch (condition.operator) {
                case 'equals':
                  conditionMet = sensorValue === condition.value;
                  break;
                case 'not_equals':
                  conditionMet = sensorValue !== condition.value;
                  break;
                case 'greater_than':
                  conditionMet = sensorValue > condition.value;
                  break;
                case 'less_than':
                  conditionMet = sensorValue < condition.value;
                  break;
                case 'between':
                  conditionMet = sensorValue >= condition.value && 
                                 sensorValue <= condition.additionalValue;
                  break;
              }
            }
          }
          break;
          
        case 'time_window':
          const currentUserTime = task.getCurrentTimeInUserTimezone();
          const currentHour = currentUserTime.hour();
          const currentMinute = currentUserTime.minute();
          const currentTimeMinutes = currentHour * 60 + currentMinute;
          
          const [startHour, startMinute] = condition.value.split(':').map(Number);
          const startTimeMinutes = startHour * 60 + startMinute;
          
          if (condition.operator === 'between' && condition.additionalValue) {
            const [endHour, endMinute] = condition.additionalValue.split(':').map(Number);
            const endTimeMinutes = endHour * 60 + endMinute;
            
            if (startTimeMinutes <= endTimeMinutes) {
              conditionMet = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
            } else {
              conditionMet = currentTimeMinutes >= startTimeMinutes || currentTimeMinutes <= endTimeMinutes;
            }
          } else {
            conditionMet = Math.abs(currentTimeMinutes - startTimeMinutes) <= 1;
          }
          break;
          
        case 'device_status':
          if (condition.device) {
            const statusDevice = await Device.findById(condition.device);
            if (statusDevice) {
              conditionMet = statusDevice.status === condition.value;
            }
          }
          break;
          
        case 'user_presence':
          conditionMet = true; // Placeholder
          break;
      }
      
      if (!conditionMet) {
        console.log(`Condition not met: ${condition.type} ${condition.operator} ${condition.value}`);
        return false;
      }
    }
    
    return true;
  }

  // Perform an action on a device
  async performDeviceAction(device, action) {
    console.log(`Performing action on device ${device.name}: ${action.type} = ${action.value}`);
    
    const { normalizeState } = require('./websockets/utils/stateUtils');
    
    switch (action.type) {
      case 'status_change':
        const normalizedState = normalizeState(action.value);
        console.log(`Original action value: ${action.value}, Normalized: ${normalizedState}`);
        
        await Device.findByIdAndUpdate(device._id, { status: normalizedState });
        
        const mqttBroker = require('./mqtt/mqtt-broker');
        mqttBroker.publishDeviceState(device._id, normalizedState, {
          updatedBy: 'task',
          taskTriggered: true
        });
        
        console.log(`Device ${device.name} state updated to: ${normalizedState}`);
        break;
        
      case 'temperature_set':
        const temperature = parseFloat(action.value);
        await Device.findByIdAndUpdate(device._id, { 
          temperature: temperature,
          status: 'on'
        });
        console.log(`Device ${device.name} temperature set to: ${temperature}`);
        break;
        
      default:
        console.log(`Custom action type: ${action.type} with value: ${action.value}`);
        break;
    }
    
    return true;
  }

  // Get a value from a device (for condition checking)
  async getDeviceValue(device) {
    return device.status === 'on' ? 1 : 0;
  }

  // Send a notification about a task (timezone-aware)
  async sendNotification(taskId, type, errorMessage = null) {
    try {
      const task = await Task.findById(taskId)
        .populate('creator')
        .populate('device')
        .populate('notifications.recipients');
      
      if (!task || !task.notifications || !task.notifications.enabled) {
        return;
      }
      
      const recipients = task.notifications.recipients.length > 0 
        ? task.notifications.recipients 
        : [task.creator];
      
      let subject, message;
      const formattedTime = task.getFormattedNextExecution();
      
      switch (type) {
        case 'upcoming':
          subject = `Upcoming Task: ${task.name}`;
          message = `Your task "${task.name}" for device "${task.device.name}" will be executed at ${formattedTime?.formatted || 'scheduled time'} (in ${task.notifications.beforeExecution} minutes).`;
          break;
          
        case 'success':
          subject = `Task Executed Successfully: ${task.name}`;
          message = `Your task "${task.name}" for device "${task.device.name}" was executed successfully at ${moment().tz(task.timezone).format('YYYY-MM-DD HH:mm z')}.`;
          break;
          
        case 'failure':
          subject = `Task Execution Failed: ${task.name}`;
          message = `Your task "${task.name}" for device "${task.device.name}" failed to execute at ${moment().tz(task.timezone).format('YYYY-MM-DD HH:mm z')}. Error: ${errorMessage || 'Unknown error'}`;
          break;
      }
      
      const emails = recipients.map(user => user.email);
      
      console.log(`Sending ${type} notification for task "${task.name}" to:`, emails);
      console.log(`Subject: ${subject}`);
      console.log(`Message: ${message}`);
      
    } catch (error) {
      console.error(`Error sending notification for task ${taskId}:`, error);
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
        this.unscheduleTask(task._id.toString());
        
        task.timezone = newTimezone;
        task.updateNextExecution();
        
        await task.save();
        
        if (task.nextExecution) {
          this.scheduleTask(task);
        }
      }
      
      console.log(`Rescheduled ${userTasks.length} tasks for user ${userId} to timezone ${newTimezone}`);
    } catch (error) {
      console.error(`Error rescheduling tasks for user ${userId}:`, error);
    }
  }
}

module.exports = new TaskScheduler();