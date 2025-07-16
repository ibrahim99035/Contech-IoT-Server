const Apartment = require('../../../models/Apartment');


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


module.exports = getAllApartments;