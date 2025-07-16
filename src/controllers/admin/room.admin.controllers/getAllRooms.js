const Room = require('../../../models/Room');
const Device = require('../../../models/Device');
const Apartment = require('../../../models/Apartment');

// GET - Get all rooms with comprehensive analysis
const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find({})
      .populate('creator', 'name email role')
      .populate('apartment', 'name')
      .populate('devices', 'name type status activated')
      .populate('users', 'name email role')
      .sort({ createdAt: -1 });

    // Analysis data
    const analysis = {
      totalRooms: rooms.length,
      totalDevices: rooms.reduce((sum, room) => sum + room.devices.length, 0),
      roomTypeDistribution: rooms.reduce((acc, room) => {
        acc[room.type] = (acc[room.type] || 0) + 1;
        return acc;
      }, {}),
      roomsWithDevices: rooms.filter(room => room.devices.length > 0).length,
      roomsWithUsers: rooms.filter(room => room.users.length > 0).length,
      roomsWithPasswords: rooms.filter(room => room.roomPassword).length,
      averageDevicesPerRoom: rooms.reduce((sum, room) => sum + room.devices.length, 0) / rooms.length || 0,
      averageUsersPerRoom: rooms.reduce((sum, room) => sum + room.users.length, 0) / rooms.length || 0,
      deviceStatusDistribution: rooms.reduce((acc, room) => {
        room.devices.forEach(device => {
          acc[device.status] = (acc[device.status] || 0) + 1;
        });
        return acc;
      }, {}),
      deviceTypeDistribution: rooms.reduce((acc, room) => {
        room.devices.forEach(device => {
          acc[device.type] = (acc[device.type] || 0) + 1;
        });
        return acc;
      }, {}),
      recentRooms: rooms.filter(room => {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        return room.createdAt > oneWeekAgo;
      }).length
    };

    res.json({
      success: true,
      data: rooms,
      analysis,
      pagination: {
        total: rooms.length,
        page: 1,
        pages: 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching rooms',
      error: error.message
    });
  }
};

module.exports = getAllRooms;