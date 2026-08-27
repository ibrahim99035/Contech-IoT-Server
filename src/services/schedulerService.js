/**
 * Production-Grade Task Scheduler Service
 * Powered by BullMQ (Redis-backed distributed queue) with in-memory timer fallback.
 * Handles timezone-aware scheduled execution, notifications, and event emission.
 * @module services/schedulerService
 */

const { Queue, Worker } = require('bullmq');
const moment = require('moment-timezone');
const Task = require('../models/Task');
const Device = require('../models/Device');
const User = require('../models/User');
const taskEvents = require('../websockets/taskEventEmitter');
const { getRedisConnectionOptions } = require('../config/redis');
const { sendEmail } = require('../utils/emailService');
const logger = require('../config/logger');

class TaskSchedulerService {
  constructor() {
    this.queueName = 'device-task-queue';
    this.queue = null;
    this.worker = null;
    this.activeInMemoryJobs = new Map();
    this.useBullMQ = false;
    // 2^31 - 1 (~24.8 days): Node.js setTimeout limit before 32-bit integer overflow occurs
    this.MAX_TIMEOUT_MS = 2147483647;
  }

  /**
   * Initialize BullMQ queue and worker (with graceful in-memory fallback)
   */
  async start() {
    logger.info('Initializing production Task Scheduler service...');

    try {
      const connectionOptions = getRedisConnectionOptions();
      const { getRedisClient } = require('../config/redis');
      const redisClient = await getRedisClient();

      if (redisClient && redisClient.isOpen) {
        this.queue = new Queue(this.queueName, { connection: connectionOptions });
        this.worker = new Worker(
          this.queueName,
          async (job) => {
            if (job.name === 'execute-task') {
              logger.info(`Processing scheduled task job`, { jobId: job.id, taskId: job.data.taskId });
              await this.executeTask(job.data.taskId);
            } else if (job.name === 'send-notification') {
              const task = await Task.findById(job.data.taskId);
              if (task) {
                await this.sendNotification(task, job.data.type);
              }
            }
          },
          { connection: connectionOptions, concurrency: 5 }
        );

        this.queue.on('error', (err) => {
          logger.error('BullMQ Queue error', { error: err.message });
        });

        this.worker.on('failed', (job, err) => {
          logger.error(`Task job failed in queue`, { jobId: job?.id, error: err.message });
        });

        this.worker.on('error', (err) => {
          logger.error('BullMQ Worker error', { error: err.message });
        });

        this.useBullMQ = true;
        logger.info('BullMQ Task Queue & Worker connected successfully');
      } else {
        logger.warn('Redis unavailable, initializing Task Scheduler with in-memory fallback');
        this.useBullMQ = false;
      }
    } catch (error) {
      logger.warn('Failed to initialize BullMQ, falling back to in-memory scheduler', { error: error.message });
      this.useBullMQ = false;
    }

    // Set periodic sync to catch distant/upcoming/overdue tasks every 60 seconds
    setInterval(async () => {
      await this.scheduleUpcomingTasks();
    }, 60000);

    // Sync active tasks from MongoDB on boot
    await this.scheduleUpcomingTasks();
  }

  /**
   * Schedule all active upcoming tasks from MongoDB
   */
  async scheduleUpcomingTasks() {
    try {
      const now = new Date();
      const activeTasks = await Task.find({
        status: 'active',
        nextExecution: { $exists: true, $ne: null }
      }).populate('device').populate('creator');

      logger.info(`Found ${activeTasks.length} active tasks to sync`);

      for (const task of activeTasks) {
        const executionTime = new Date(task.nextExecution).getTime();

        // Overdue task handling: If nextExecution is in the past, process/update
        if (executionTime <= now.getTime()) {
          logger.warn(`Task "${task.name}" is overdue (scheduled for ${task.nextExecution}). Processing execution/recurrence...`, { taskId: task._id });
          await this.executeTask(task._id.toString());
        } else {
          await this.scheduleTask(task);
        }
      }
    } catch (error) {
      logger.error('Error scheduling upcoming tasks', { error: error.message });
    }
  }

  /**
   * Schedule a specific task safely
   * @param {Object} task - Mongoose task document
   */
  async scheduleTask(task) {
    const taskId = task._id.toString();

    // Remove existing scheduled job first
    await this.unscheduleTask(taskId);

    if (task.status !== 'active' || !task.nextExecution) {
      return;
    }

    const now = Date.now();
    const executionTime = new Date(task.nextExecution).getTime();
    const timeUntilExecution = executionTime - now;

    // Overdue or immediate execution trigger
    if (timeUntilExecution <= 0) {
      logger.info(`Executing due task immediately`, { taskId, name: task.name });
      setImmediate(() => this.executeTask(taskId));
      return;
    }

    const formattedExecution = task.getFormattedNextExecution();
    logger.info(`Scheduling task "${task.name}" for ${formattedExecution?.formatted || 'unknown time'} (in ${Math.round(timeUntilExecution / 60000)}m)`, { taskId });

    // BullMQ path
    if (this.useBullMQ && this.queue) {
      try {
        await this.queue.add(
          'execute-task',
          { taskId },
          {
            jobId: taskId,
            delay: timeUntilExecution,
            removeOnComplete: true,
            removeOnFail: 100
          }
        );

        if (task.notifications?.enabled && task.notifications.beforeExecution > 0) {
          const notificationDelay = timeUntilExecution - (task.notifications.beforeExecution * 60 * 1000);
          if (notificationDelay > 1000) {
            await this.queue.add(
              'send-notification',
              { taskId, type: 'upcoming' },
              {
                jobId: `notif-${taskId}`,
                delay: notificationDelay,
                removeOnComplete: true
              }
            );
          }
        }
        return;
      } catch (err) {
        logger.error(`Failed to add task to BullMQ, falling back to in-memory timer`, { taskId, error: err.message });
      }
    }

    // In-memory fallback path
    // CRITICAL: Protect against Node.js setTimeout 32-bit integer overflow (MAX_TIMEOUT_MS = 2,147,483,647 ms)
    // If timeUntilExecution > 2147483647 ms (~24.8 days), setting setTimeout will overflow to 1ms, causing an infinite execution loop!
    if (timeUntilExecution > this.MAX_TIMEOUT_MS) {
      logger.info(`Task "${task.name}" is scheduled beyond Node.js max timeout limit (${Math.round(timeUntilExecution / 86400000)} days away). Periodic check will queue it when date approaches.`, { taskId });
      return;
    }

    const timer = setTimeout(async () => {
      await this.executeTask(taskId);
    }, timeUntilExecution);

    this.activeInMemoryJobs.set(taskId, timer);

    // Schedule notification in-memory if enabled
    if (task.notifications?.enabled && task.notifications.beforeExecution > 0) {
      const notificationDelay = timeUntilExecution - (task.notifications.beforeExecution * 60 * 1000);
      if (notificationDelay > 0 && notificationDelay <= this.MAX_TIMEOUT_MS) {
        setTimeout(async () => {
          await this.sendNotification(task, 'upcoming');
        }, notificationDelay);
      }
    }
  }

  /**
   * Remove a scheduled task from queue or in-memory
   * @param {string} taskId
   */
  async unscheduleTask(taskId) {
    if (this.useBullMQ && this.queue) {
      try {
        const job = await this.queue.getJob(taskId);
        if (job) {
          await job.remove();
        }
        const notifJob = await this.queue.getJob(`notif-${taskId}`);
        if (notifJob) {
          await notifJob.remove();
        }
      } catch (err) {
        // Ignore job not found errors
      }
    }

    if (this.activeInMemoryJobs.has(taskId)) {
      clearTimeout(this.activeInMemoryJobs.get(taskId));
      this.activeInMemoryJobs.delete(taskId);
    }
  }

  /**
   * Alias for scheduleTask (called from createTask controller)
   */
  async scheduleNewTask(task) {
    if (!task.nextExecution) {
      task.updateNextExecution();
      await task.save();
    }
    if (task.nextExecution && task.status === 'active') {
      await this.scheduleTask(task);
    }
  }

  /**
   * Task execution logic
   * @param {string} taskId
   */
  async executeTask(taskId) {
    try {
      this.activeInMemoryJobs.delete(taskId);

      const task = await Task.findById(taskId).populate('device').populate('creator');

      if (!task) {
        logger.error(`Task not found during execution`, { taskId });
        return;
      }

      if (task.status !== 'active') {
        logger.info(`Task is no longer active, skipping execution`, { taskId, status: task.status });
        return;
      }

      // Check pre-execution conditions
      if (task.conditions && task.conditions.length > 0) {
        const conditionsMet = await this.checkConditions(task);
        if (!conditionsMet) {
          logger.warn(`Execution conditions not met for task "${task.name}", skipping`, { taskId });

          task.executionHistory.push({
            timestamp: new Date(),
            status: 'failure',
            message: 'Execution conditions not met'
          });

          taskEvents.emit('task-failed', {
            taskId: task._id.toString(),
            name: task.name,
            device: task.device ? { _id: task.device._id.toString(), name: task.device.name } : null,
            creator: task.creator ? { _id: task.creator._id.toString(), name: task.creator.name } : null,
            message: 'Task skipped: Conditions not met'
          });

          task.updateNextExecution();
          await task.save();

          if (task.nextExecution && task.status === 'active') {
            await this.scheduleTask(task);
          }
          return;
        }
      }

      // Perform device action
      try {
        await this.performDeviceAction(task.device, task.action);

        logger.info(`Task executed successfully`, { taskId, name: task.name });

        task.executionHistory.push({
          timestamp: new Date(),
          status: 'success',
          message: `Successfully executed action: ${task.action.type} = ${task.action.value}`
        });

        taskEvents.emit('task-executed', {
          _id: task._id.toString(),
          name: task.name,
          device: task.device ? { _id: task.device._id.toString(), name: task.device.name } : null,
          creator: task.creator ? { _id: task.creator._id.toString(), name: task.creator.name } : null,
          action: task.action
        });

        // Send success notification if enabled
        await this.sendNotification(task, 'success');

      } catch (execError) {
        logger.error(`Task action execution failed`, { taskId, error: execError.message });

        task.executionHistory.push({
          timestamp: new Date(),
          status: 'failure',
          message: `Error: ${execError.message}`
        });

        taskEvents.emit('task-failed', {
          taskId: task._id.toString(),
          name: task.name,
          device: task.device ? { _id: task.device._id.toString(), name: task.device.name } : null,
          creator: task.creator ? { _id: task.creator._id.toString(), name: task.creator.name } : null,
          message: `Task execution failed: ${execError.message}`
        });

        if (task.notifications?.onFailure) {
          await this.sendNotification(task, 'failure', execError.message);
        }
      }

      // Update task status and next execution
      task.lastExecuted = new Date();

      if (task.schedule.recurrence.type === 'once') {
        task.status = 'completed';
        task.nextExecution = null;
      } else {
        task.updateNextExecution();
        if (!task.nextExecution) {
          task.status = 'completed';
        }
      }

      await task.save();

      // Schedule next occurrence if task remains active
      if (task.nextExecution && task.status === 'active') {
        await this.scheduleTask(task);
      }

    } catch (error) {
      logger.error(`Error processing task execution`, { taskId, error: error.message });
    }
  }

  /**
   * Evaluate task execution conditions
   */
  async checkConditions(task) {
    if (!task.conditions || task.conditions.length === 0) return true;

    for (const condition of task.conditions) {
      let conditionMet = false;

      switch (condition.type) {
        case 'sensor_value':
          if (condition.device) {
            const sensorDevice = await Device.findById(condition.device);
            if (sensorDevice) {
              const sensorValue = sensorDevice.status === 'on' ? 1 : 0;
              switch (condition.operator) {
                case 'equals': conditionMet = sensorValue === condition.value; break;
                case 'not_equals': conditionMet = sensorValue !== condition.value; break;
                case 'greater_than': conditionMet = sensorValue > condition.value; break;
                case 'less_than': conditionMet = sensorValue < condition.value; break;
                case 'between': conditionMet = sensorValue >= condition.value && sensorValue <= condition.additionalValue; break;
              }
            }
          }
          break;

        case 'time_window':
          const currentUserTime = task.getCurrentTimeInUserTimezone();
          const currentTimeMinutes = currentUserTime.hour() * 60 + currentUserTime.minute();
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
          conditionMet = true;
          break;
      }

      if (!conditionMet) return false;
    }

    return true;
  }

  /**
   * Perform device action safely
   */
  async performDeviceAction(device, action) {
    if (!device) {
      throw new Error('No device specified for task action execution');
    }

    const { normalizeState } = require('../websockets/utils/stateUtils');
    const mqttBroker = require('../mqtt/mqtt-broker');

    switch (action.type) {
      case 'status_change':
        const normalizedState = normalizeState(action.value);
        await Device.findByIdAndUpdate(device._id, { status: normalizedState });
        mqttBroker.publishDeviceState(device._id, normalizedState, {
          updatedBy: 'task',
          taskTriggered: true
        });
        break;

      case 'temperature_set':
        const temperature = parseFloat(action.value);
        await Device.findByIdAndUpdate(device._id, {
          targetTemperature: temperature,
          status: 'on'
        });
        break;

      default:
        logger.info(`Custom device action executed`, { type: action.type, value: action.value });
        break;
    }
  }

  /**
   * Send notification via email service
   */
  async sendNotification(task, type, errorMessage = null) {
    try {
      if (!task.notifications?.enabled) return;

      const populatedTask = await Task.findById(task._id)
        .populate('creator', 'email name')
        .populate('device', 'name')
        .populate('notifications.recipients', 'email name');

      if (!populatedTask) return;

      const recipients = populatedTask.notifications.recipients?.length > 0
        ? populatedTask.notifications.recipients
        : [populatedTask.creator];

      const emails = recipients.map(u => u?.email).filter(Boolean);
      if (emails.length === 0) return;

      const formattedTime = populatedTask.getFormattedNextExecution();
      let subject = '';
      let body = '';

      switch (type) {
        case 'upcoming':
          subject = `Upcoming Task: ${populatedTask.name}`;
          body = `<p>Your task <b>"${populatedTask.name}"</b> for device <b>"${populatedTask.device?.name || 'Device'}"</b> will be executed at ${formattedTime?.formatted || 'scheduled time'}.</p>`;
          break;
        case 'success':
          subject = `Task Executed: ${populatedTask.name}`;
          body = `<p>Your task <b>"${populatedTask.name}"</b> for device <b>"${populatedTask.device?.name || 'Device'}"</b> was executed successfully.</p>`;
          break;
        case 'failure':
          subject = `Task Failed: ${populatedTask.name}`;
          body = `<p>Your task <b>"${populatedTask.name}"</b> for device <b>"${populatedTask.device?.name || 'Device'}"</b> failed: ${errorMessage || 'Unknown error'}.</p>`;
          break;
      }

      for (const email of emails) {
        await sendEmail({ to: email, subject, html: body });
      }
    } catch (err) {
      logger.error('Failed to send task notification', { taskId: task._id, error: err.message });
    }
  }

  /**
   * Reschedule user tasks when user changes timezone
   */
  async rescheduleUserTasks(userId, newTimezone) {
    try {
      const userTasks = await Task.find({
        creator: userId,
        status: 'active',
        nextExecution: { $ne: null }
      });

      for (const task of userTasks) {
        await this.unscheduleTask(task._id.toString());
        task.timezone = newTimezone;
        task.updateNextExecution();
        await task.save();

        if (task.nextExecution) {
          await this.scheduleTask(task);
        }
      }

      logger.info(`Rescheduled ${userTasks.length} tasks for user to new timezone`, { userId, newTimezone });
    } catch (error) {
      logger.error('Error rescheduling user tasks', { userId, error: error.message });
    }
  }
}

const schedulerInstance = new TaskSchedulerService();
module.exports = schedulerInstance;
