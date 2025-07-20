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
      // Get tasks that are active and have a next execution time
      const upcomingTasks = await Task.find({
        status: 'active',
        nextExecution: { $ne: null, $gt: now }
      }).populate('device').populate('creator');
      
      console.log(`Found ${upcomingTasks.length} upcoming tasks to schedule`);
      
      // Schedule each task
      for (const task of upcomingTasks) {
        this.scheduleTask(task);
      }
    } catch (error) {
      console.error('Error scheduling upcoming tasks:', error);
    }
  }

  // Schedule a specific task (timezone-aware)
  scheduleTask(task) {
    // If the task is already scheduled, remove it first
    if (this.activeJobs.has(task._id.toString())) {
      this.unscheduleTask(task._id.toString());
    }
    
    const now = new Date();
    const executionTime = new Date(task.nextExecution); // This is already in UTC
    
    // Calculate milliseconds until execution
    const timeUntilExecution = executionTime.getTime() - now.getTime();
    
    // Only schedule if it's in the future
    if (timeUntilExecution > 0) {
      const formattedExecution = task.getFormattedNextExecution();
      console.log(`Scheduling task "${task.name}" to execute at ${formattedExecution.formatted} (in ${Math.round(timeUntilExecution/60000)} minutes)`);
      
      // Schedule the task execution
      const timer = setTimeout(async () => {
        await this.executeTask(task._id.toString());
      }, timeUntilExecution);
      
      // Store the timer reference
      this.activeJobs.set(task._id.toString(), timer);
      
      // Schedule notifications if enabled
      if (task.notifications && task.notifications.enabled && task.notifications.beforeExecution > 0) {
        const notificationTime = executionTime.getTime() - (task.notifications.beforeExecution * 60 * 1000);
        const timeUntilNotification = notificationTime - now.getTime();
        
        if (timeUntilNotification > 0) {
          setTimeout(async () => {
            await this.sendNotification(task._id.toString(), 'upcoming');
          }, timeUntilNotification);
        }
      }
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
      // Remove from active jobs
      this.activeJobs.delete(taskId);

      // Get the task with populated references
      const task = await Task.findById(taskId).populate('device').populate('creator');

      if (!task) {
        console.error(`Task ${taskId} not found`);
        return;
      }

      const executionTimeInUserTz = task.getFormattedNextExecution();
      console.log(`Executing task: ${task.name} (scheduled for ${executionTimeInUserTz?.formatted || 'unknown time'})`);
      console.log(`Task action: ${task.action.type} = ${task.action.value}`); // Debug log

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

          // Fixed: Emit with correct parameter structure
          taskEvents.emit('task-failed', {
            taskId: task._id.toString(),
            name: task.name,
            device: { _id: task.device._id.toString(), name: task.device.name },
            creator: { _id: task.creator._id.toString(), name: task.creator.name },
            message: 'Task skipped: Conditions not met'
          });

          // Update next execution time and save
          task.updateNextExecution();
          await task.save();

          // Schedule next execution if it exists
          if (task.nextExecution) {
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

        // Fixed: Emit with correct parameter structure
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

        // Fixed: Emit with correct parameter structure
        taskEvents.emit('task-failed', {
          taskId: task._id.toString(),
          name: task.name,
          device: { _id: task.device._id.toString(), name: task.device.name },
          creator: { _id: task.creator._id.toString(), name: task.creator.name },
          message: `Task execution failed: ${error.message}`
        });
      }

      // Update task status and next execution time
      task.lastExecuted = new Date();

      // If it's a one-time task, mark as completed
      if (task.schedule.recurrence.type === 'once') {
        task.status = 'completed';
        task.nextExecution = null;
      } else {
        // Otherwise, calculate next execution time (timezone-aware)
        task.updateNextExecution();

        // If there's no next execution (e.g., end date reached), mark as completed
        if (!task.nextExecution) {
          task.status = 'completed';
        }
      }

      // Save the updated task
      await task.save();

      // Schedule next execution if it exists
      if (task.nextExecution) {
        this.scheduleTask(task);
      }

    } catch (error) {
      console.error(`Error processing task execution ${taskId}:`, error);
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
          // Get the current sensor value from the device
          if (condition.device) {
            const sensorDevice = await Device.findById(condition.device);
            if (sensorDevice) {
              const sensorValue = await this.getDeviceValue(sensorDevice);
              
              // Check the condition based on the operator
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
          // Use the task's timezone for time window checking
          const currentUserTime = task.getCurrentTimeInUserTimezone();
          const currentHour = currentUserTime.hour();
          const currentMinute = currentUserTime.minute();
          const currentTimeMinutes = currentHour * 60 + currentMinute;
          
          // Parse time window values (assuming they're stored as "HH:MM" format)
          const [startHour, startMinute] = condition.value.split(':').map(Number);
          const startTimeMinutes = startHour * 60 + startMinute;
          
          if (condition.operator === 'between' && condition.additionalValue) {
            const [endHour, endMinute] = condition.additionalValue.split(':').map(Number);
            const endTimeMinutes = endHour * 60 + endMinute;
            
            // Handle time windows that cross midnight
            if (startTimeMinutes <= endTimeMinutes) {
              conditionMet = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
            } else {
              // Time window spans midnight (e.g., 22:00 to 06:00)
              conditionMet = currentTimeMinutes >= startTimeMinutes || currentTimeMinutes <= endTimeMinutes;
            }
          } else {
            // For specific time
            conditionMet = Math.abs(currentTimeMinutes - startTimeMinutes) <= 1; // Allow 1 minute tolerance
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
          // This would integrate with your user presence detection system
          conditionMet = true; // Placeholder
          break;
      }
      
      // If any condition is not met, return false
      if (!conditionMet) {
        return false;
      }
    }
    
    // All conditions were met
    return true;
  }

  // Perform an action on a device
  async performDeviceAction(device, action) {
    console.log(`Performing action on device ${device.name}: ${action.type} = ${action.value}`);
    
    const { normalizeState } = require('./websockets/utils/stateUtils');
    
    switch (action.type) {
      case 'status_change':
        // Normalize the action value to ensure correct state
        const normalizedState = normalizeState(action.value);
        console.log(`Original action value: ${action.value}, Normalized: ${normalizedState}`);
        
        // Update device in database
        await Device.findByIdAndUpdate(device._id, { status: normalizedState });
        
        // Publish to MQTT with the correct state
        const mqttBroker = require('./mqtt/mqtt-broker');
        mqttBroker.publishDeviceState(device._id, normalizedState, {
          updatedBy: 'task',
          taskTriggered: true
        });
        
        console.log(`Device ${device.name} state updated to: ${normalizedState}`);
        break;
        
      case 'temperature_set':
        // For a thermostat device
        const temperature = parseFloat(action.value);
        await Device.findByIdAndUpdate(device._id, { 
          temperature: temperature,
          status: 'on' // Typically turn on when setting temperature
        });
        break;
        
      default:
        console.log(`Custom action type: ${action.type} with value: ${action.value}`);
        // Handle custom actions here
        break;
    }
    
    return true;
  }

  // Get a value from a device (for condition checking)
  async getDeviceValue(device) {
    // Placeholder implementation
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
      
      // Determine recipients
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
      
      // Send emails to all recipients
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
      
      console.log(`Rescheduled ${userTasks.length} tasks for user ${userId} to timezone ${newTimezone}`);
    } catch (error) {
      console.error(`Error rescheduling tasks for user ${userId}:`, error);
    }
  }
}

module.exports = new TaskScheduler();