const Device = require('../../models/Device');
const logger = require('../../config/logger');

async function joinUserDeviceRooms(io, socket) {
  try {
    // Find all devices this user has access to
    const devices = await Device.find({ users: socket.user._id });
    
    // Join a room for each device
    devices.forEach(device => {
      socket.join(`device:${device._id}`);
    });
    
    logger.info(`User ${socket.user.name} joined ${devices.length} device rooms`);
  } catch (error) {
    logger.error('Error joining device rooms:', error);
  }
}

module.exports = {
  joinUserDeviceRooms
};