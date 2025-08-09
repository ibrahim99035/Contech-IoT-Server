const Device = require('../../models/Device');
const logger = require('../utils/logger');

class DeviceActionHandler {
  constructor() {
    this.actionHandlers = new Map([
      ['status_change', this._handleStatusChange.bind(this)],
      ['temperature_set', this._handleTemperatureSet.bind(this)],
    ]);
  }

  async performAction(device, action) {
    logger.info(`Performing action on device ${device.name}: ${action.type} = ${action.value}`);
    
    const handler = this.actionHandlers.get(action.type);
    
    if (handler) {
      await handler(device, action);
    } else {
      await this._handleCustomAction(device, action);
    }
    
    return true;
  }

  async _handleStatusChange(device, action) {
    const { normalizeState } = require('../websockets/utils/stateUtils');
    
    // Normalize the action value to ensure correct state
    const normalizedState = normalizeState(action.value);
    logger.debug(`Original action value: ${action.value}, Normalized: ${normalizedState}`);
    
    // Update device in database
    await Device.findByIdAndUpdate(device._id, { status: normalizedState });
    
    // Publish to MQTT with the correct state
    const mqttBroker = require('../mqtt/mqtt-broker');
    mqttBroker.publishDeviceState(device._id, normalizedState, {
      updatedBy: 'task',
      taskTriggered: true
    });
    
    logger.info(`Device ${device.name} state updated to: ${normalizedState}`);
  }

  async _handleTemperatureSet(device, action) {
    // For a thermostat device
    const temperature = parseFloat(action.value);
    
    if (isNaN(temperature)) {
      throw new Error(`Invalid temperature value: ${action.value}`);
    }
    
    await Device.findByIdAndUpdate(device._id, { 
      temperature: temperature,
      status: 'on' // Typically turn on when setting temperature
    });
    
    logger.info(`Device ${device.name} temperature set to: ${temperature}°`);
  }

  async _handleCustomAction(device, action) {
    logger.info(`Custom action type: ${action.type} with value: ${action.value}`);
    
    // Handle custom actions here
    // This could be extended to support plugin-based actions
    switch (action.type) {
      case 'brightness_set':
        await this._handleBrightnessSet(device, action);
        break;
      case 'color_change':
        await this._handleColorChange(device, action);
        break;
      case 'volume_set':
        await this._handleVolumeSet(device, action);
        break;
      default:
        logger.warn(`Unhandled action type: ${action.type}`);
        break;
    }
  }

  async _handleBrightnessSet(device, action) {
    const brightness = parseInt(action.value);
    
    if (isNaN(brightness) || brightness < 0 || brightness > 100) {
      throw new Error(`Invalid brightness value: ${action.value}. Must be 0-100`);
    }
    
    await Device.findByIdAndUpdate(device._id, { 
      brightness: brightness,
      status: brightness > 0 ? 'on' : 'off'
    });
    
    logger.info(`Device ${device.name} brightness set to: ${brightness}%`);
  }

  async _handleColorChange(device, action) {
    // Validate color format (hex, rgb, etc.)
    const colorValue = action.value;
    
    await Device.findByIdAndUpdate(device._id, { 
      color: colorValue,
      status: 'on'
    });
    
    logger.info(`Device ${device.name} color changed to: ${colorValue}`);
  }

  async _handleVolumeSet(device, action) {
    const volume = parseInt(action.value);
    
    if (isNaN(volume) || volume < 0 || volume > 100) {
      throw new Error(`Invalid volume value: ${action.value}. Must be 0-100`);
    }
    
    await Device.findByIdAndUpdate(device._id, { 
      volume: volume,
      status: volume > 0 ? 'on' : 'off'
    });
    
    logger.info(`Device ${device.name} volume set to: ${volume}%`);
  }

  // Method to register custom action handlers
  registerActionHandler(actionType, handler) {
    this.actionHandlers.set(actionType, handler);
    logger.info(`Registered custom action handler for: ${actionType}`);
  }

  // Method to get all registered action types
  getRegisteredActions() {
    return Array.from(this.actionHandlers.keys());
  }
}

module.exports = DeviceActionHandler;