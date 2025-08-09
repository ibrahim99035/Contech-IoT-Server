const mqtt = require('mqtt');
const taskEvents = require('../websockets/taskEventEmitter');
const DeviceHandler = require('./handlers/deviceHandler');
const RoomHandler = require('./handlers/roomHandler');
const EspHandler = require('./handlers/espHandler');
const Publisher = require('./publishers/mqttPublisher');
const { EspMappingManager } = require('./utils/espMappingManager');

class MQTTManager {
  constructor() {
    this.client = null;
    this.io = null;
    this.espMappingManager = new EspMappingManager();
    
    // Initialize handlers
    this.deviceHandler = new DeviceHandler(this.espMappingManager);
    this.roomHandler = new RoomHandler(this.espMappingManager);
    this.espHandler = new EspHandler(this.espMappingManager);
    this.publisher = new Publisher();
  }

  /**
   * Initialize the MQTT client and connect to the MQTT broker
   * @param {Object} socketIo - Socket.IO instance for broadcasting events
   */
  initialize(socketIo) {
    this.io = socketIo;
    
    // Connect to MQTT broker
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    const options = {
      clientId: `home-automation-server-${Math.random().toString(16).substring(2, 10)}`,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      clean: true,
      reconnectPeriod: 5000
    };
    
    this.client = mqtt.connect(brokerUrl, options);
    
    // Initialize publisher with client
    this.publisher.initialize(this.client);
    
    // Initialize handlers with dependencies
    this.deviceHandler.initialize(this.io, this.publisher);
    this.roomHandler.initialize(this.io, this.publisher);
    this.espHandler.initialize(this.io, this.publisher);
    
    this._setupEventHandlers();
    this._subscribeToTopics();
    this._registerTaskEventHandlers();
  }

  /**
   * Set up MQTT client event handlers
   */
  _setupEventHandlers() {
    this.client.on('connect', () => {
      console.log('Connected to MQTT broker');
    });
    
    this.client.on('error', (err) => {
      console.error('MQTT error:', err);
    });
    
    this.client.on('reconnect', () => {
      console.log('Reconnecting to MQTT broker...');
    });
    
    this.client.on('message', this._handleMqttMessage.bind(this));
  }

  /**
   * Subscribe to all required MQTT topics
   */
  _subscribeToTopics() {
    const subscriptions = [
      { topic: 'home-automation/+/state', description: 'device state topics' },
      { topic: 'home-automation/+/status', description: 'device status topics' },
      { topic: 'home-automation/room/+/state', description: 'room state topics' },
      { topic: 'home-automation/esp/+/compact-state', description: 'ESP compact state topics' },
      { topic: 'home-automation/esp/+/auth', description: 'ESP auth topics' },
      { topic: 'home-automation/esp/+/disconnect', description: 'ESP disconnect topics' }
    ];

    subscriptions.forEach(({ topic, description }) => {
      this.client.subscribe(topic, (err) => {
        if (err) {
          console.error(`Error subscribing to ${description}:`, err);
        } else {
          console.log(`Subscribed to ${description}`);
        }
      });
    });
  }

  /**
   * Handle incoming MQTT messages and route to appropriate handlers
   */
  async _handleMqttMessage(topic, message) {
    try {
      console.log(`MQTT message received: ${topic} - ${message.toString()}`);
      
      // Parse the message
      let payload;
      try {
        payload = JSON.parse(message.toString());
      } catch (e) {
        // If not JSON, use raw string
        payload = { state: message.toString() };
      }
      
      // Route to appropriate handler based on topic pattern
      if (topic.match(/^home-automation\/([^\/]+)\/state$/)) {
        const deviceId = topic.split('/')[1];
        await this.deviceHandler.handleDeviceStateMessage(deviceId, payload);
      } 
      else if (topic.match(/^home-automation\/([^\/]+)\/status$/)) {
        const deviceId = topic.split('/')[1];
        await this.deviceHandler.handleDeviceStatusMessage(deviceId, payload);
      }
      else if (topic.match(/^home-automation\/room\/([^\/]+)\/state$/)) {
        const roomId = topic.split('/')[2];
        await this.roomHandler.handleRoomStateMessage(roomId, payload);
      }
      else if (topic.match(/^home-automation\/esp\/([^\/]+)\/compact-state$/)) {
        const espId = topic.split('/')[2];
        await this.espHandler.handleEspCompactStateMessage(espId, message.toString(), payload);
      }
      else if (topic.match(/^home-automation\/esp\/([^\/]+)\/auth$/)) {
        const espId = topic.split('/')[2];
        await this.espHandler.handleEspAuthMessage(espId, payload);
      }
      else if (topic.match(/^home-automation\/esp\/([^\/]+)\/disconnect$/)) {
        const espId = topic.split('/')[2];
        await this.espHandler.handleEspDisconnection(espId);
      }
    } catch (error) {
      console.error('Error handling MQTT message:', error);
    }
  }

  /**
   * Register task event handlers
   */
  _registerTaskEventHandlers() {
    taskEvents.on('task-executed', async (task) => {
      try {
        await this.publisher.publishTaskExecution(task);
        
        if (task.device.room) {
          await this.publisher.publishEspTaskUpdate(task.device.room.toString(), {
            _id: task._id,
            device: task.device,
            status: 'executed',
            message: `Task "${task.name}" was executed.`
          });
        }
      } catch (error) {
        console.error('Error publishing task execution to MQTT:', error);
      }
    });
    
    taskEvents.on('task-failed', async (task, error) => {
      try {
        await this.publisher.publishTaskFailure(task, error);
        
        if (task.device.room) {
          await this.publisher.publishEspTaskUpdate(task.device.room.toString(), {
            _id: task._id,
            device: task.device,
            status: 'failed',
            message: `Task "${task.name}" failed: ${error}`
          });
        }
      } catch (err) {
        console.error('Error publishing task failure to MQTT:', err);
      }
    });
  }

  /**
   * Public API methods for external use
   */
  publishDeviceState(deviceId, state, options = {}) {
    return this.publisher.publishDeviceState(deviceId, state, options);
  }

  publishRoomState(roomId, updates, options = {}) {
    return this.publisher.publishRoomState(roomId, updates, options);
  }

  getEspRoomMapping(espId) {
    return this.espMappingManager.getMapping(espId);
  }

  removeEspRoomMapping(espId) {
    return this.espMappingManager.removeMapping(espId);
  }

  /**
   * Close the MQTT connection and cleanup
   */
  close() {
    if (this.client) {
      this.client.end();
      console.log('MQTT connection closed');
    }
    
    this.espMappingManager.clear();
  }

  /**
   * Get client for direct access (if needed)
   */
  getClient() {
    return this.client;
  }
}

// Create singleton instance
const mqttManager = new MQTTManager();

module.exports = {
  initialize: (socketIo) => mqttManager.initialize(socketIo),
  publishDeviceState: (deviceId, state, options) => mqttManager.publishDeviceState(deviceId, state, options),
  publishRoomState: (roomId, updates, options) => mqttManager.publishRoomState(roomId, updates, options),
  getEspRoomMapping: (espId) => mqttManager.getEspRoomMapping(espId),
  removeEspRoomMapping: (espId) => mqttManager.removeEspRoomMapping(espId),
  close: () => mqttManager.close(),
  client: mqttManager.getClient()
};