const Room = require('../../../models/Room');
const Device = require('../../../models/Device');
const Apartment = require('../../../models/Apartment');

// GET - Get room statistics and analytics
const getRoomStatistics = async (req, res) => {
  try {
    const rooms = await Room.find({})
      .populate('creator', 'role')
      .populate('apartment')
      .populate('devices')
      .populate('users');

    const devices = await Device.find({});
    const apartments = await Apartment.find({});

    // Time-based analysis
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const statistics = {
      roomGrowth: {
        thisWeek: rooms.filter(room => room.createdAt > oneWeekAgo).length,
        thisMonth: rooms.filter(room => room.createdAt > oneMonthAgo).length,
        total: rooms.length
      },
      roomTypeAnalysis: {
        distribution: rooms.reduce((acc, room) => {
          acc[room.type] = (acc[room.type] || 0) + 1;
          return acc;
        }, {}),
        mostPopularType: Object.entries(rooms.reduce((acc, room) => {
          acc[room.type] = (acc[room.type] || 0) + 1;
          return acc;
        }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
      },
      deviceAnalysis: {
        totalDevices: devices.length,
        devicesInRooms: devices.filter(device => device.room).length,
        averageDevicesPerRoom: devices.length / rooms.length || 0,
        deviceTypesInRooms: devices.reduce((acc, device) => {
          acc[device.type] = (acc[device.type] || 0) + 1;
          return acc;
        }, {}),
        deviceStatusDistribution: devices.reduce((acc, device) => {
          acc[device.status] = (acc[device.status] || 0) + 1;
          return acc;
        }, {}),
        activeDevices: devices.filter(device => device.activated).length,
        inactiveDevices: devices.filter(device => !device.activated).length
      },
      securityAnalysis: {
        roomsWithPasswords: rooms.filter(room => room.roomPassword).length,
        roomsWithoutPasswords: rooms.filter(room => !room.roomPassword).length,
        passwordProtectionRate: (rooms.filter(room => room.roomPassword).length / rooms.length * 100) || 0
      },
      occupancyAnalysis: {
        roomsWithUsers: rooms.filter(room => room.users.length > 0).length,
        roomsWithoutUsers: rooms.filter(room => room.users.length === 0).length,
        averageUsersPerRoom: rooms.reduce((sum, room) => sum + room.users.length, 0) / rooms.length || 0,
        totalRoomUsers: rooms.reduce((sum, room) => sum + room.users.length, 0)
      },
      apartmentDistribution: {
        totalApartments: apartments.length,
        averageRoomsPerApartment: rooms.length / apartments.length || 0,
        apartmentsWithRooms: apartments.filter(apt => apt.rooms.length > 0).length
      }
    };

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching room statistics',
      error: error.message
    });
  }
};

module.exports = getRoomStatistics;