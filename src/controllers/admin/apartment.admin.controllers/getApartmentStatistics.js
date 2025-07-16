const Apartment = require('../../../models/Apartment');
const Room = require('../../../models/Room');
const Device = require('../../../models/Device');

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

module.exports = getApartmentStatistics;