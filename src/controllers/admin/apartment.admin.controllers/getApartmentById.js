const Apartment = require('../../../models/Apartment');

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


module.exports = getApartmentById;