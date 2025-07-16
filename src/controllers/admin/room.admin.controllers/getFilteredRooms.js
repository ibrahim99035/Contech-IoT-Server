const Room = require('../../../models/Room');

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

module.exports = getFilteredRooms;