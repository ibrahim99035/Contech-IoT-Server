const setupUserNamespace = require('./namespaces/userNamespace');
const setupDeviceNamespace = require('./namespaces/deviceNamespace');
const setupRoomEspNameSpcae = require('./namespaces/roomEspNamespace');
const setupRoomUserNameSpcae = require('./namespaces/roomUserNamespace');
const setupMqttNamespace = require('./namespaces/mqttNamespace');
const deviceRoomUtils = require('./utils/deviceRooms');
const mqttBroker = require('../mqtt/mqtt-broker');

module.exports = (io) => {
  // Initialize MQTT broker
  mqttBroker.initialize(io);
  
  // Setup namespaces
  setupUserNamespace(io);
  setupDeviceNamespace(io);
  setupRoomEspNameSpcae(io);
  setupRoomUserNameSpcae(io);
  setupMqttNamespace(io);
  
  // Export room utilities for potential use elsewhere
  return {
    joinUserDeviceRooms: deviceRoomUtils.joinUserDeviceRooms
  };
};