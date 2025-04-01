const Device = require('../../models/Device');

async function joinUserDeviceRooms(io, socket) {
  try {
    // Find all devices this user has access to
    const devices = await Device.find({ users: socket.user._id });
    
    // Join a room for each device
    devices.forEach(device => {
      socket.join(`device:${device._id}`);
    });
    
    console.log(`User ${socket.user.name} joined ${devices.length} device rooms`);
  } catch (error) {
    console.error('Error joining device rooms:', error);
  }
}

module.exports = {
  joinUserDeviceRooms
};