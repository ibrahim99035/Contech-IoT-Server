const Room = require('../../../models/Room');

// GET - Get room by ID with full details
const getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate('creator', 'name email role active')
      .populate('apartment', 'name creator members')
      .populate({
        path: 'devices',
        populate: {
          path: 'creator',
          select: 'name email'
        }
      })
      .populate('users', 'name email role active');

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Room analysis
    const roomAnalysis = {
      totalDevices: room.devices.length,
      totalUsers: room.users.length,
      deviceTypes: room.devices.reduce((acc, device) => {
        acc[device.type] = (acc[device.type] || 0) + 1;
        return acc;
      }, {}),
      deviceStatuses: room.devices.reduce((acc, device) => {
        acc[device.status] = (acc[device.status] || 0) + 1;
        return acc;
      }, {}),
      activeDevices: room.devices.filter(device => device.activated).length,
      inactiveDevices: room.devices.filter(device => !device.activated).length,
      onlineDevices: room.devices.filter(device => device.status === 'on').length,
      offlineDevices: room.devices.filter(device => device.status === 'off').length,
      activeUsers: room.users.filter(user => user.active).length,
      hasPassword: !!room.roomPassword,
      deviceOrders: room.devices.map(device => ({
        name: device.name,
        type: device.type,
        order: device.order
      })).sort((a, b) => a.order - b.order),
      lastActivity: room.updatedAt,
      roomAge: Math.floor((Date.now() - room.createdAt) / (1000 * 60 * 60 * 24)) + ' days'
    };

    res.json({
      success: true,
      data: room,
      analysis: roomAnalysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching room',
      error: error.message
    });
  }
};

module.exports = getRoomById;