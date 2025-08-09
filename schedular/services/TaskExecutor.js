const taskEvents = require('../../websockets/taskEventEmitter');
const DeviceActionHandler = require('./DeviceActionHandler');
const logger = require('../utils/logger');

class TaskExecutor {
  constructor() {
    this.deviceActionHandler = new DeviceActionHandler();
  }

  async execute(task, conditionChecker) {
    const executionTimeInUserTz = task.getFormattedNextExecution();
    logger.info(`Executing task: ${task.name} (scheduled for ${executionTimeInUserTz?.formatted || 'unknown time'})`);
    logger.debug(`Task action: ${task.action.type} = ${task.action.value}`);

    // Check if conditions are met before executing
    if (task.conditions && task.conditions.length > 0) {
      const conditionsMet = await conditionChecker.checkConditions(task);
      if (!conditionsMet) {
        return await this._handleConditionsNotMet(task);
      }
    }

    // Execute the action on the device
    try {
      await this._executeDeviceAction(task);
      return await this._handleSuccessfulExecution(task);
    } catch (error) {
      return await this._handleFailedExecution(task, error);
    } finally {
      await this._updateTaskStatus(task);
    }
  }

  async _handleConditionsNotMet(task) {
    logger.info(`Conditions not met for task ${task.name}, skipping execution`);

    // Record the skipped execution
    task.executionHistory.push({
      timestamp: new Date(),
      status: 'failure',
      message: 'Execution conditions not met'
    });

    // Emit event
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

    return { success: false, reason: 'conditions_not_met' };
  }

  async _executeDeviceAction(task) {
    logger.info(`About to perform action: ${task.action.type} = ${task.action.value} on device ${task.device.name}`);
    await this.deviceActionHandler.performAction(task.device, task.action);
    logger.info(`Task executed successfully: ${task.name}`);
  }

  async _handleSuccessfulExecution(task) {
    // Record successful execution
    task.executionHistory.push({
      timestamp: new Date(),
      status: 'success',
      message: `Successfully executed action: ${task.action.type} = ${task.action.value}`
    });

    // Emit success event
    taskEvents.emit('task-executed', {
      _id: task._id.toString(),
      name: task.name,
      device: { _id: task.device._id.toString(), name: task.device.name },
      creator: { _id: task.creator._id.toString(), name: task.creator.name },
      action: task.action
    });

    return { success: true };
  }

  async _handleFailedExecution(task, error) {
    logger.error(`Error executing task ${task.name}:`, error);

    // Record failed execution
    task.executionHistory.push({
      timestamp: new Date(),
      status: 'failure',
      message: `Error: ${error.message}`
    });

    // Emit failure event
    taskEvents.emit('task-failed', {
      taskId: task._id.toString(),
      name: task.name,
      device: { _id: task.device._id.toString(), name: task.device.name },
      creator: { _id: task.creator._id.toString(), name: task.creator.name },
      message: `Task execution failed: ${error.message}`
    });

    return { success: false, reason: 'execution_error', error: error.message };
  }

  async _updateTaskStatus(task) {
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
  }
}

module.exports = TaskExecutor;