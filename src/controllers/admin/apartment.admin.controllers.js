const Apartment = require('../../models/Apartment');
const Room = require('../../models/Room');
const Device = require('../../models/Device');
const User = require('../../models/User');

// GET - Get all apartments with comprehensive analysis
const getAllApartments = async (req, res) => {
  try {
    const apartments = await Apartment.find({})
      .populate('creator', 'name email role')
      .populate('members', 'name email role')
      .populate({
        path: 'rooms',
        populate: {
          path: 'devices',
          select: 'name type status'
        }
      })
      .sort({ createdAt: -1 });

    // Analysis data
    const analysis = {
      totalApartments: apartments.length,
      totalRooms: apartments.reduce((sum, apt) => sum + apt.rooms.length, 0),
      totalDevices: apartments.reduce((sum, apt) => {
        return sum + apt.rooms.reduce((roomSum, room) => roomSum + room.devices.length, 0);
      }, 0),
      averageRoomsPerApartment: apartments.reduce((sum, apt) => sum + apt.rooms.length, 0) / apartments.length || 0,
      averageMembersPerApartment: apartments.reduce((sum, apt) => sum + apt.members.length, 0) / apartments.length || 0,
      averageDevicesPerApartment: apartments.reduce((sum, apt) => {
        return sum + apt.rooms.reduce((roomSum, room) => roomSum + room.devices.length, 0);
      }, 0) / apartments.length || 0,
      apartmentsByCreatorRole: apartments.reduce((acc, apt) => {
        const role = apt.creator.role;
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {}),
      recentApartments: apartments.filter(apt => {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        return apt.createdAt > oneWeekAgo;
      }).length
    };

    res.json({
      success: true,
      data: apartments,
      analysis,
      pagination: {
        total: apartments.length,
        page: 1,
        pages: 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching apartments',
      error: error.message
    });
  }
};

// GET - Get apartment by ID with full details
const getApartmentById = async (req, res) => {
  try {
    const apartment = await Apartment.findById(req.params.id)
      .populate('creator', 'name email role active')
      .populate('members', 'name email role active')
      .populate({
        path: 'rooms',
        populate: [
          {
            path: 'creator',
            select: 'name email'
          },
          {
            path: 'devices',
            populate: {
              path: 'creator',
              select: 'name email'
            }
          },
          {
            path: 'users',
            select: 'name email'
          }
        ]
      });

    if (!apartment) {
      return res.status(404).json({
        success: false,
        message: 'Apartment not found'
      });
    }

    // Apartment analysis
    const apartmentAnalysis = {
      totalRooms: apartment.rooms.length,
      totalMembers: apartment.members.length + 1, // +1 for creator
      totalDevices: apartment.rooms.reduce((sum, room) => sum + room.devices.length, 0),
      roomTypes: apartment.rooms.reduce((acc, room) => {
        acc[room.type] = (acc[room.type] || 0) + 1;
        return acc;
      }, {}),
      deviceTypes: apartment.rooms.reduce((acc, room) => {
        room.devices.forEach(device => {
          acc[device.type] = (acc[device.type] || 0) + 1;
        });
        return acc;
      }, {}),
      deviceStatuses: apartment.rooms.reduce((acc, room) => {
        room.devices.forEach(device => {
          acc[device.status] = (acc[device.status] || 0) + 1;
        });
        return acc;
      }, {}),
      activeMembersCount: apartment.members.filter(member => member.active).length,
      roomsWithPasswords: apartment.rooms.filter(room => room.roomPassword).length,
      averageDevicesPerRoom: apartment.rooms.reduce((sum, room) => sum + room.devices.length, 0) / apartment.rooms.length || 0,
      lastActivity: apartment.updatedAt
    };

    res.json({
      success: true,
      data: apartment,
      analysis: apartmentAnalysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching apartment',
      error: error.message
    });
  }
};

// GET - Get apartments with filters and search
const getFilteredApartments = async (req, res) => {
  try {
    const {
      creatorId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    // Build filter object
    const filter = {};
    if (creatorId) filter.creator = creatorId;
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const apartments = await Apartment.find(filter)
      .populate('creator', 'name email role')
      .populate('members', 'name email role')
      .populate('rooms', 'name type')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalApartments = await Apartment.countDocuments(filter);

    res.json({
      success: true,
      data: apartments,
      pagination: {
        total: totalApartments,
        page: parseInt(page),
        pages: Math.ceil(totalApartments / parseInt(limit)),
        hasNext: skip + apartments.length < totalApartments,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching filtered apartments',
      error: error.message
    });
  }
};

// GET - Get apartment statistics and analytics
const getApartmentStatistics = async (req, res) => {
  try {
    const apartments = await Apartment.find({})
      .populate('creator', 'role')
      .populate('members')
      .populate('rooms');

    const rooms = await Room.find({});
    const devices = await Device.find({});

    // Time-based analysis
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const statistics = {
      apartmentGrowth: {
        thisWeek: apartments.filter(apt => apt.createdAt > oneWeekAgo).length,
        thisMonth: apartments.filter(apt => apt.createdAt > oneMonthAgo).length,
        total: apartments.length
      },
      roomDistribution: rooms.reduce((acc, room) => {
        acc[room.type] = (acc[room.type] || 0) + 1;
        return acc;
      }, {}),
      deviceDistribution: devices.reduce((acc, device) => {
        acc[device.type] = (acc[device.type] || 0) + 1;
        return acc;
      }, {}),
      deviceStatusDistribution: devices.reduce((acc, device) => {
        acc[device.status] = (acc[device.status] || 0) + 1;
        return acc;
      }, {}),
      apartmentsByCreatorRole: apartments.reduce((acc, apt) => {
        const role = apt.creator.role;
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {}),
      occupancyAnalysis: {
        totalRooms: rooms.length,
        totalDevices: devices.length,
        averageRoomsPerApartment: rooms.length / apartments.length || 0,
        averageDevicesPerApartment: devices.length / apartments.length || 0,
        averageDevicesPerRoom: devices.length / rooms.length || 0
      },
      membershipAnalysis: {
        totalMembers: apartments.reduce((sum, apt) => sum + apt.members.length, 0),
        averageMembersPerApartment: apartments.reduce((sum, apt) => sum + apt.members.length, 0) / apartments.length || 0,
        apartmentsWithMultipleMembers: apartments.filter(apt => apt.members.length > 0).length
      }
    };

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching apartment statistics',
      error: error.message
    });
  }
};

// GET - Get apartment members analysis
const getApartmentMembersAnalysis = async (req, res) => {
  try {
    const apartments = await Apartment.find({})
      .populate('creator', 'name email role active createdAt')
      .populate('members', 'name email role active createdAt');

    const membersAnalysis = apartments.map(apartment => ({
      apartmentId: apartment._id,
      apartmentName: apartment.name,
      creator: apartment.creator,
      members: apartment.members,
      totalUsers: apartment.members.length + 1, // +1 for creator
      activeUsers: apartment.members.filter(member => member.active).length + (apartment.creator.active ? 1 : 0),
      roleDistribution: {
        admin: apartment.members.filter(member => member.role === 'admin').length + (apartment.creator.role === 'admin' ? 1 : 0),
        moderator: apartment.members.filter(member => member.role === 'moderator').length + (apartment.creator.role === 'moderator' ? 1 : 0),
        customer: apartment.members.filter(member => member.role === 'customer').length + (apartment.creator.role === 'customer' ? 1 : 0)
      },
      createdAt: apartment.createdAt,
      updatedAt: apartment.updatedAt
    }));

    const overallAnalysis = {
      totalApartments: apartments.length,
      totalUniqueUsers: [...new Set([
        ...apartments.map(apt => apt.creator._id.toString()),
        ...apartments.flatMap(apt => apt.members.map(member => member._id.toString()))
      ])].length,
      averageUsersPerApartment: membersAnalysis.reduce((sum, analysis) => sum + analysis.totalUsers, 0) / membersAnalysis.length || 0,
      apartmentsWithMultipleUsers: membersAnalysis.filter(analysis => analysis.totalUsers > 1).length
    };

    res.json({
      success: true,
      data: membersAnalysis,
      overallAnalysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching apartment members analysis',
      error: error.message
    });
  }
};

module.exports = {
  getAllApartments,
  getApartmentById,
  getFilteredApartments,
  getApartmentStatistics,
  getApartmentMembersAnalysis
};