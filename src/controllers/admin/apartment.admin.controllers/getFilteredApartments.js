const Apartment = require('../../../models/Apartment');

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

module.exports = getFilteredApartments;