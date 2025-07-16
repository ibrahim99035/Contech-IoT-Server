const Room = require('../../models/Room');
const Device = require('../../models/Device');
const Apartment = require('../../models/Apartment');
const User = require('../../models/User');

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

// GET - Get rooms with filters and search
const getFilteredRooms = async (req, res) => {
  try {
    const {
      type,
      apartmentId,
      creatorId,
      hasPassword,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    // Build filter object
    const filter = {};
    if (type) filter.type = type;
    if (apartmentId) filter.apartment = apartmentId;
    if (creatorId) filter.creator = creatorId;
    if (hasPassword !== undefined) {
      filter.roomPassword = hasPassword === 'true' ? { $exists: true, $ne: null } : { $exists: false };
    }
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const rooms = await Room.find(filter)
      .populate('creator', 'name email role')
      .populate('apartment', 'name')
      .populate('devices', 'name type status')
      .populate('users', 'name email')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalRooms = await Room.countDocuments(filter);

    res.json({
      success: true,
      data: rooms,
      pagination: {
        total: totalRooms,
        page: parseInt(page),
        pages: Math.ceil(totalRooms / parseInt(limit)),
        hasNext: skip + rooms.length < totalRooms,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching filtered rooms',
      error: error.message
    });
  }
};

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

module.exports = {
  getAllRooms,
  getRoomById,
  getFilteredRooms,
  getRoomStatistics,
  getRoomUsageAnalysis
};