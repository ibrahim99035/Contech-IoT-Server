const setupUserNamespace = require('./namespaces/userNamespace');
const setupDeviceNamespace = require('./namespaces/deviceNamespace');
const setupRoomEspNameSpcae = require('./namespaces/roomEspNamespace');
const setupRoomUserNameSpcae = require('./namespaces/roomUserNamespace');
const deviceRoomUtils = require('./utils/deviceRooms');

module.exports = (io) => {
  // Setup namespaces
  setupUserNamespace(io);
  setupDeviceNamespace(io);
  setupRoomEspNameSpcae(io)
  setupRoomUserNameSpcae(io)
  
  // Export room utilities for potential use elsewhere
  return {
    joinUserDeviceRooms: deviceRoomUtils.joinUserDeviceRooms
  };
};