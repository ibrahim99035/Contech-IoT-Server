const Device = require('../../models/Device');
const logger = require('../utils/logger');

class TaskConditionChecker {
  constructor() {
    this.conditionHandlers = new Map([
      ['sensor_value', this._checkSensorValue.bind(this)],
      ['time_window', this._checkTimeWindow.bind(this)],
      ['device_status', this._checkDeviceStatus.bind(this)],
      ['user_presence', this._checkUserPresence.bind(this)],
    ]);
  }

  // Check if all conditions for a task are met (timezone-aware)
  async checkConditions(task) {
    if (!task.conditions || task.conditions.length === 0) {
      return true;
    }
    
    logger.debug(`Checking ${task.conditions.length} conditions for task: ${task.name}`);
    
    for (const [index, condition] of task.conditions.entries()) {
      const conditionMet = await this._checkSingleCondition(task, condition, index);
      
      // If any condition is not met, return false
      if (!conditionMet) {
        logger.debug(`Condition ${index + 1} not met for task: ${task.name}`);
        return false;
      }
    }
    
    // All conditions were met
    logger.debug(`All conditions met for task: ${task.name}`);
    return true;
  }

  async _checkSingleCondition(task, condition, index) {
    const handler = this.conditionHandlers.get(condition.type);
    
    if (!handler) {
      logger.warn(`Unknown condition type: ${condition.type} for task: ${task.name}`);
      return false;
    }
    
    try {
      const result = await handler(task, condition);
      logger.debug(`Condition ${index + 1} (${condition.type}): ${result ? 'MET' : 'NOT MET'}`);
      return result;
    } catch (error) {
      logger.error(`Error checking condition ${index + 1} for task ${task.name}:`, error);
      return false;
    }
  }

  async _checkSensorValue(task, condition) {
    if (!condition.device) {
      logger.warn('Sensor value condition missing device reference');
      return false;
    }

    const sensorDevice = await Device.findById(condition.device);
    if (!sensorDevice) {
      logger.warn(`Sensor device not found: ${condition.device}`);
      return false;
    }

    const sensorValue = await this._getDeviceValue(sensorDevice);
    logger.debug(`Sensor ${sensorDevice.name} value: ${sensorValue}, expected: ${condition.operator} ${condition.value}`);

    return this._compareValues(sensorValue, condition.operator, condition.value, condition.additionalValue);
  }

  async _checkTimeWindow(task, condition) {
    // Use the task's timezone for time window checking
    const currentUserTime = task.getCurrentTimeInUserTimezone();
    const currentHour = currentUserTime.hour();
    const currentMinute = currentUserTime.minute();
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    
    logger.debug(`Current time in user timezone: ${currentHour}:${currentMinute.toString().padStart(2, '0')}`);
    
    // Parse time window values (assuming they're stored as "HH:MM" format)
    const [startHour, startMinute] = condition.value.split(':').map(Number);
    const startTimeMinutes = startHour * 60 + startMinute;
    
    if (condition.operator === 'between' && condition.additionalValue) {
      const [endHour, endMinute] = condition.additionalValue.split(':').map(Number);
      const endTimeMinutes = endHour * 60 + endMinute;
      
      // Handle time windows that cross midnight
      if (startTimeMinutes <= endTimeMinutes) {
        return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
      } else {
        // Time window spans midnight (e.g., 22:00 to 06:00)
        return currentTimeMinutes >= startTimeMinutes || currentTimeMinutes <= endTimeMinutes;
      }
    } else {
      // For specific time
      return Math.abs(currentTimeMinutes - startTimeMinutes) <= 1; // Allow 1 minute tolerance
    }
  }

  async _checkDeviceStatus(task, condition) {
    if (!condition.device) {
      logger.warn('Device status condition missing device reference');
      return false;
    }

    const statusDevice = await Device.findById(condition.device);
    if (!statusDevice) {
      logger.warn(`Status device not found: ${condition.device}`);
      return false;
    }

    logger.debug(`Device ${statusDevice.name} status: ${statusDevice.status}, expected: ${condition.value}`);
    return statusDevice.status === condition.value;
  }

  async _checkUserPresence(task, condition) {
    // This would integrate with your user presence detection system
    // Placeholder implementation
    logger.debug('User presence check - placeholder implementation');
    return true;
  }

  // Compare values based on operator
  _compareValues(actual, operator, expected, additionalValue) {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'greater_than':
        return actual > expected;
      case 'less_than':
        return actual < expected;
      case 'greater_than_or_equal':
        return actual >= expected;
      case 'less_than_or_equal':
        return actual <= expected;
      case 'between':
        if (additionalValue === undefined) {
          logger.warn('Between operator requires additionalValue');
          return false;
        }
        return actual >= expected && actual <= additionalValue;
      default:
        logger.warn(`Unknown comparison operator: ${operator}`);
        return false;
    }
  }

  // Get a value from a device (for condition checking)
  async _getDeviceValue(device) {
    // This should be implemented based on your device model structure
    // For now, returning a simple implementation
    switch (device.type) {
      case 'temperature_sensor':
        return device.temperature || 0;
      case 'humidity_sensor':
        return device.humidity || 0;
      case 'motion_sensor':
        return device.motionDetected ? 1 : 0;
      case 'light_sensor':
        return device.lightLevel || 0;
      default:
        // Default to status-based value
        return device.status === 'on' ? 1 : 0;
    }
  }

  // Method to register custom condition handlers
  registerConditionHandler(conditionType, handler) {
    this.conditionHandlers.set(conditionType, handler);
    logger.info(`Registered custom condition handler for: ${conditionType}`);
  }

  // Method to get all registered condition types
  getRegisteredConditions() {
    return Array.from(this.conditionHandlers.keys());
  }
}

module.exports = TaskConditionChecker;