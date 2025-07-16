const Device = require('../../../models/Device');

// GET - Get devices with filters and search
const getFilteredDevices = async (req, res) => {
  try {
    const {
      type,
      status,
      activated,
      roomId,
      creatorId,
      hasCapabilities,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    // Build filter object
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (activated !== undefined) filter.activated = activated === 'true';
    if (roomId) filter.room = roomId;
    if (creatorId) filter.creator = creatorId;
    if (hasCapabilities) {
      if (hasCapabilities === 'brightness') filter['capabilities.brightness'] = true;
      if (hasCapabilities === 'color') filter['capabilities.color'] = true;
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const devices = await Device.find(filter)
      .populate('creator', 'name email role')
      .populate('room', 'name type')
      .populate('users', 'name email')
      .populate('tasks', 'name status')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalDevices = await Device.countDocuments(filter);

    res.json({
      success: true,
      data: devices,
      pagination: {
        total: totalDevices,
        page: parseInt(page),
        pages: Math.ceil(totalDevices / parseInt(limit)),
        hasNext: skip + devices.length < totalDevices,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching filtered devices',
      error: error.message
    });
  }
};

module.exports = getFilteredDevices;