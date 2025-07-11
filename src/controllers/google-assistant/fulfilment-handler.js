/**
 * controllers/google-assistant/fulfilment-handler.js
 * Complete Google Assistant Fulfillment Handler - All Device Types with Socket.io Integration
 */

const Device = require('../../models/Device');
const { normalizeState } = require('../../websockets/utils/stateUtils');
const mqttBroker = require('../../mqtt/mqtt-broker');

/**
 * Validate Google Smart Home request
 */
function validateRequest(body) {
  if (!body.requestId) {
    throw new Error('Missing requestId');
  }
  
  if (!body.inputs || !Array.isArray(body.inputs) || body.inputs.length === 0) {
    throw new Error('Missing or invalid inputs');
  }

  const intent = body.inputs[0].intent;
  if (!intent) {
    throw new Error('Missing intent');
  }

  return intent;
}

/**
 * Map device to Google Smart Home format
 */
function mapDeviceToGoogleFormat(device) {
  // Determine device type based on your device type
  const deviceTypeMap = {
    'light': 'action.devices.types.LIGHT',
    'switch': 'action.devices.types.SWITCH',
    'outlet': 'action.devices.types.OUTLET',
    'fan': 'action.devices.types.FAN',
    'thermostat': 'action.devices.types.THERMOSTAT',
    'lock': 'action.devices.types.LOCK'
  };

  const traits = ['action.devices.traits.OnOff'];
  const attributes = {};
  
  // Add additional traits based on device capabilities
  if (device.type === 'light' && device.capabilities?.brightness) {
    traits.push('action.devices.traits.Brightness');
  }
  
  if (device.type === 'light' && device.capabilities?.color) {
    traits.push('action.devices.traits.ColorSetting');
    attributes.colorModel = 'rgb';
  }
  
  if (device.type === 'thermostat') {
    traits.push('action.devices.traits.TemperatureSetting');
    attributes.availableThermostatModes = ['heat', 'cool', 'auto', 'off'];
    attributes.thermostatTemperatureUnit = 'C';
  }
  
  if (device.type === 'lock') {
    traits.push('action.devices.traits.LockUnlock');
  }

  return {
    id: device._id.toString(),
    type: deviceTypeMap[device.type] || 'action.devices.types.SWITCH',
    traits: traits,
    name: {
      name: device.name,
      nicknames: device.nicknames && device.nicknames.length > 0 ? device.nicknames : [device.name]
    },
    willReportState: false,
    roomHint: device.room?.name || undefined,
    deviceInfo: {
      manufacturer: 'Contech',
      model: device.type,
      hwVersion: '1.0',
      swVersion: '1.0'
    },
    attributes: attributes
  };
}

/**
 * Get device state for Google Assistant
 */
function getDeviceState(device) {
  const state = {
    on: device.status === 'on',
    online: true
  };

  // Add additional state properties based on device capabilities
  if (device.capabilities?.brightness && device.brightness !== undefined) {
    state.brightness = device.brightness;
  }
  
  if (device.capabilities?.color && device.color) {
    state.color = device.color;
  }
  
  if (device.type === 'thermostat') {
    state.thermostatMode = device.thermostatMode || 'auto';
    state.thermostatTemperatureSetpoint = device.targetTemperature || 20;
    state.thermostatTemperatureAmbient = device.currentTemperature || 20;
  }
  
  if (device.type === 'lock') {
    state.isLocked = device.status === 'locked';
  }

  return state;
}

/**
 * Execute device command and emit Socket.io updates
 */
async function executeDeviceCommand(device, execution, user, io) {
  const updateData = {};
  const responseStates = { online: true };

  // Handle OnOff command
  if (execution.command === 'action.devices.commands.OnOff') {
    const rawState = execution.params.on ? 'on' : 'off';
    updateData.status = normalizeState(rawState);
    responseStates.on = execution.params.on;
  }

  // Handle Brightness command
  if (execution.command === 'action.devices.commands.BrightnessAbsolute' && device.capabilities?.brightness) {
    updateData.brightness = execution.params.brightness;
    responseStates.brightness = execution.params.brightness;
  }

  // Handle Color command
  if (execution.command === 'action.devices.commands.ColorAbsolute' && device.capabilities?.color) {
    if (execution.params.color) {
      updateData.color = execution.params.color;
      responseStates.color = execution.params.color;
    }
  }

  // Handle Thermostat commands
  if (execution.command === 'action.devices.commands.ThermostatTemperatureSetpoint' && device.type === 'thermostat') {
    updateData.targetTemperature = execution.params.thermostatTemperatureSetpoint;
    responseStates.thermostatTemperatureSetpoint = execution.params.thermostatTemperatureSetpoint;
  }
  
  if (execution.command === 'action.devices.commands.ThermostatSetMode' && device.type === 'thermostat') {
    updateData.thermostatMode = execution.params.thermostatMode;
    responseStates.thermostatMode = execution.params.thermostatMode;
  }

  // Handle Lock command
  if (execution.command === 'action.devices.commands.LockUnlock' && device.type === 'lock') {
    const rawState = execution.params.lock ? 'locked' : 'unlocked';
    updateData.status = normalizeState(rawState);
    responseStates.isLocked = execution.params.lock;
  }

  // Update device in database
  await Device.findByIdAndUpdate(device._id, updateData);

  // Publish to MQTT
  mqttBroker.publishDeviceState(device._id, normalizeState(updateData.status) || device.status, {
    updatedBy: 'google-assistant',
    userId: user._id.toString(),
    ...updateData
  });

  // Emit Socket.io updates to mobile apps
  if (io) {
    const deviceNamespace = io.of('/ws/device');
    const userNamespace = io.of('/ws/user');
    
    // Notify the specific device via websocket
    deviceNamespace.to(`device:${device._id}`).emit('state-update', { 
      deviceId: device._id, 
      state: normalizeState(updateData.status) || device.status,
      updatedBy: 'google-assistant',
      userId: user._id.toString(),
      ...updateData
    });
    
    // Notify all users with access to this device
    userNamespace.to(`device:${device._id}`).emit('state-updated', { 
      deviceId: device._id, 
      state: normalizeState(updateData.status) || device.status,
      updatedBy: 'google-assistant',
      userId: user._id.toString(),
      roomId: device.room,
      ...updateData
    });
    
    console.log(`📱 Socket.io notifications sent for device ${device.name} updated by Google Assistant`);
  }

  return responseStates;
}

/**
 * Google Smart Home Fulfillment Handler
 */
exports.googleAssistantFulfillment = async (req, res) => {
  try {
    console.log('🎯 Google Assistant Request:', JSON.stringify(req.body, null, 2));
    
    // User is already authenticated by protect middleware
    const user = req.user;
    const intent = validateRequest(req.body);
    
    // Get Socket.io instance from app
    const io = req.app.get('io');
    
    console.log(`👤 User: ${user.email}, Intent: ${intent}`);

    // SYNC: List user's devices
    if (intent === 'action.devices.SYNC') {
      const devices = await Device.find({
        $or: [
          { users: user._id },
          { creator: user._id }
        ],
        active: true // Only include active devices
      }).populate('room', 'name'); // Populate room name for roomHint

      const googleDevices = devices.map(mapDeviceToGoogleFormat);
      
      const response = {
        requestId: req.body.requestId,
        payload: {
          agentUserId: user._id.toString(),
          devices: googleDevices
        }
      };

      console.log('🔄 SYNC Response:', JSON.stringify(response, null, 2));
      return res.json(response);
    }

    // QUERY: Report device states
    if (intent === 'action.devices.QUERY') {
      const deviceIds = req.body.inputs[0].payload.devices.map(d => d.id);
      const devices = await Device.find({ 
        _id: { $in: deviceIds },
        $or: [
          { users: user._id },
          { creator: user._id }
        ]
      });

      const deviceStates = {};
      devices.forEach(device => {
        deviceStates[device._id.toString()] = getDeviceState(device);
      });

      const response = {
        requestId: req.body.requestId,
        payload: {
          devices: deviceStates
        }
      };

      console.log('🔍 QUERY Response:', JSON.stringify(response, null, 2));
      return res.json(response);
    }

    // EXECUTE: Change device state
    if (intent === 'action.devices.EXECUTE') {
      const commands = req.body.inputs[0].payload.commands;
      const results = [];

      for (const command of commands) {
        for (const deviceRequest of command.devices) {
          const deviceId = deviceRequest.id;
          
          try {
            // Find device and check ownership
            const device = await Device.findById(deviceId);
            if (!device) {
              results.push({
                ids: [deviceId],
                status: 'ERROR',
                errorCode: 'deviceNotFound'
              });
              continue;
            }

            // Check ownership
            if (!device.users.includes(user._id) && !device.creator.equals(user._id)) {
              results.push({
                ids: [deviceId],
                status: 'ERROR',
                errorCode: 'authFailure'
              });
              continue;
            }

            // Execute each command
            let responseStates = { online: true };
            for (const execution of command.execution) {
              const executionResult = await executeDeviceCommand(device, execution, user, io);
              responseStates = { ...responseStates, ...executionResult };
            }

            results.push({
              ids: [deviceId],
              status: 'SUCCESS',
              states: responseStates
            });

          } catch (error) {
            console.error(`❌ Execute error for device ${deviceId}:`, error);
            results.push({
              ids: [deviceId],
              status: 'ERROR',
              errorCode: 'deviceTurnedOff'
            });
          }
        }
      }

      const response = {
        requestId: req.body.requestId,
        payload: {
          commands: results
        }
      };

      console.log('⚡ EXECUTE Response:', JSON.stringify(response, null, 2));
      return res.json(response);
    }

    // DISCONNECT: Unlink account
    if (intent === 'action.devices.DISCONNECT') {
      console.log(`🔌 Disconnecting user: ${user.email}`);
      // Optional: Clean up user sessions, revoke tokens, etc.
      return res.status(200).json({});
    }

    // Unknown intent
    console.log(`❓ Unknown intent: ${intent}`);
    res.status(400).json({ 
      error: 'Unsupported intent',
      intent: intent 
    });

  } catch (error) {
    console.error('❌ Google Assistant Fulfillment Error:', error);
    
    // Return proper error response
    const errorResponse = {
      requestId: req.body?.requestId || 'unknown',
      payload: {
        errorCode: error.message.includes('token') ? 'authFailure' : 'protocolError',
        debugString: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    };

    res.status(200).json(errorResponse); // Google expects 200 with error payload
  }
};