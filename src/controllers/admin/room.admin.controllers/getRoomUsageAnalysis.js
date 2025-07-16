const Room = require('../../../models/Room');

// GET - Get room usage analysis
const getRoomUsageAnalysis = async (req, res) => {
  try {
    const rooms = await Room.find({})
      .populate('creator', 'name email role')
      .populate('apartment', 'name')
      .populate('devices', 'name type status activated order')
      .populate('users', 'name email role active');

    const usageAnalysis = rooms.map(room => ({
      roomId: room._id,
      roomName: room.name,
      roomType: room.type,
      apartment: room.apartment,
      creator: room.creator,
      deviceCount: room.devices.length,
      userCount: room.users.length,
      activeDevices: room.devices.filter(device => device.activated).length,
      onlineDevices: room.devices.filter(device => device.status === 'on').length,
      activeUsers: room.users.filter(user => user.active).length,
      hasPassword: !!room.roomPassword,
      deviceUtilization: room.devices.length > 0 ? (room.devices.filter(device => device.activated).length / room.devices.length * 100) : 0,
      deviceTypes: room.devices.reduce((acc, device) => {
        acc[device.type] = (acc[device.type] || 0) + 1;
        return acc;
      }, {}),
      deviceOrders: room.devices.map(device => device.order).sort((a, b) => a - b),
      lastActivity: room.updatedAt,
      createdAt: room.createdAt
    }));

    // Sort by device utilization (most active rooms first)
    usageAnalysis.sort((a, b) => b.deviceUtilization - a.deviceUtilization);

    const overallAnalysis = {
      totalRooms: rooms.length,
      averageDevicesPerRoom: usageAnalysis.reduce((sum, analysis) => sum + analysis.deviceCount, 0) / usageAnalysis.length || 0,
      averageUsersPerRoom: usageAnalysis.reduce((sum, analysis) => sum + analysis.userCount, 0) / usageAnalysis.length || 0,
      averageDeviceUtilization: usageAnalysis.reduce((sum, analysis) => sum + analysis.deviceUtilization, 0) / usageAnalysis.length || 0,
      mostActiveRooms: usageAnalysis.slice(0, 5),
      leastActiveRooms: usageAnalysis.slice(-5).reverse(),
      roomsWithHighUtilization: usageAnalysis.filter(analysis => analysis.deviceUtilization > 80).length,
      roomsWithLowUtilization: usageAnalysis.filter(analysis => analysis.deviceUtilization < 20).length
    };

    res.json({
      success: true,
      data: usageAnalysis,
      overallAnalysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching room usage analysis',
      error: error.message
    });
  }
};

module.exports = getRoomUsageAnalysis;