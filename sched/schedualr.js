const Task = require('../models/Task');
const Device = require('../models/Device');
const User = require('../models/User');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { taskEvents } = require('../../websockets/taskEventEmitter');

class TaskScheduler {
  constructor() {
    this.activeJobs = new Map();
    this.scheduleCheckInterval = 60000; // Check for new tasks every minute
  }

  // Start the task scheduler service
  async start() {
    console.log('Starting task scheduler service...');
    
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

  // Schedule a specific task
  scheduleTask(task) {
    // If the task is already scheduled, remove it first
    if (this.activeJobs.has(task._id.toString())) {
      this.unscheduleTask(task._id.toString());
    }
    
    const now = new Date();
    const executionTime = new Date(task.nextExecution);
    
    // Calculate milliseconds until execution
    const timeUntilExecution = executionTime.getTime() - now.getTime();
    
    // Only schedule if it's in the future
    if (timeUntilExecution > 0) {
      console.log(`Scheduling task ${task.name} to execute in ${timeUntilExecution}ms`);
      
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

      console.log(`Executing task: ${task.name}`);

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

              // Emit failure event
              taskEvents.emit('task-failed', { 
                  taskId: task._id.toString(), 
                  deviceId: task.device._id.toString(), 
                  userId: task.creator._id.toString(),
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
          await this.performDeviceAction(task.device, task.action);

          console.log(`Task executed successfully: ${task.name}`);

          // Record successful execution
          task.executionHistory.push({
              timestamp: new Date(),
              status: 'success',
              message: `Successfully executed action: ${task.action.type} = ${task.action.value}`
          });

          // Emit success event
          taskEvents.emit('task-executed', { 
              task: { 
                  _id: task._id.toString(), 
                  name: task.name, 
                  device: { _id: task.device._id.toString(), name: task.device.name }, 
                  creator: { _id: task.creator._id.toString(), name: task.creator.name } 
              } 
          });

      } catch (error) {
          console.error(`Error executing task ${task.name}:`, error);

          // Record failed execution
          task.executionHistory.push({
              timestamp: new Date(),
              status: 'failure',
              message: `Error: ${error.message}`
          });

          // Emit failure event
          taskEvents.emit('task-failed', { 
              taskId: task._id.toString(), 
              deviceId: task.device._id.toString(), 
              userId: task.creator._id.toString(),
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
          // Otherwise, calculate next execution time
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

  // Check if all conditions for a task are met
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
              // This would integrate with your actual device communication system
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
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();
          const currentTime = currentHour * 60 + currentMinute;
          
          // Parse time window values (assuming they're stored as "HH:MM" format)
          const [startHour, startMinute] = condition.value.split(':').map(Number);
          const startTime = startHour * 60 + startMinute;
          
          let endTime;
          if (condition.operator === 'between' && condition.additionalValue) {
            const [endHour, endMinute] = condition.additionalValue.split(':').map(Number);
            endTime = endHour * 60 + endMinute;
            conditionMet = currentTime >= startTime && currentTime <= endTime;
          } else {
            // For specific time
            conditionMet = currentTime === startTime;
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
          // For example, checking if a user's mobile device is connected to the home network
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
    // This would integrate with your actual device control system
    console.log(`Performing action on device ${device.name}: ${action.type} = ${action.value}`);
    
    // Example implementation
    switch (action.type) {
      case 'status_change':
        // Update the device status in the database
        await Device.findByIdAndUpdate(device._id, { status: action.value });
        
        // Here you would also send the command to the physical device
        // For example:
        // await deviceControlService.sendCommand(device.componentNumber, 'setStatus', action.value);
        break;
        
      case 'temperature_set':
        // For a thermostat device
        // await deviceControlService.sendCommand(device.componentNumber, 'setTemperature', action.value);
        break;
        
      // Handle other action types
      default:
        // Custom actions
        // await deviceControlService.sendCommand(device.componentNumber, action.type, action.value);
        break;
    }
    
    return true;
  }

  // Get a value from a device (for condition checking)
  async getDeviceValue(device) {
    // This would integrate with your actual device communication system
    // For example:
    // return await deviceControlService.getValue(device.componentNumber);
    
    // Placeholder implementation
    return device.status === 'on' ? 1 : 0;
  }

  // Send a notification about a task
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
      
      switch (type) {
        case 'upcoming':
          subject = `Upcoming Task: ${task.name}`;
          message = `Your task "${task.name}" for device "${task.device.name}" will be executed in ${task.notifications.beforeExecution} minutes.`;
          break;
          
        case 'success':
          subject = `Task Executed Successfully: ${task.name}`;
          message = `Your task "${task.name}" for device "${task.device.name}" was executed successfully.`;
          break;
          
        case 'failure':
          subject = `Task Execution Failed: ${task.name}`;
          message = `Your task "${task.name}" for device "${task.device.name}" failed to execute. Error: ${errorMessage || 'Unknown error'}`;
          break;
      }
      
      // Send emails to all recipients
      // This is a placeholder - you would use your actual email service
      const emails = recipients.map(user => user.email);
      
      console.log(`Sending ${type} notification for task "${task.name}" to:`, emails);
      console.log(`Subject: ${subject}`);
      console.log(`Message: ${message}`);
      
      // Example nodemailer implementation
      // const transporter = nodemailer.createTransport({...});
      // await transporter.sendMail({
      //   from: 'home-automation@example.com',
      //   to: emails.join(','),
      //   subject,
      //   text: message
      // });
    } catch (error) {
      console.error(`Error sending notification for task ${taskId}:`, error);
    }
  }
}

module.exports = new TaskScheduler();