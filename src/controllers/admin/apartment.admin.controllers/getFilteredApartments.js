const Apartment = require('../../../models/Apartment');

// GET - Get apartments with filters and search (Optimized)
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
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const parsedLimit = parseInt(limit);

    // Execute queries in parallel
    const [apartments, totalApartments] = await Promise.all([
      Apartment.find(filter)
        .select('name location creator members rooms createdAt updatedAt')
        .populate('creator', 'name email role')
        .populate('members', 'name email role')
        .populate('rooms', 'name type')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),

      Apartment.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalApartments / parsedLimit);

    res.json({
      success: true,
      data: apartments,
      pagination: {
        total: totalApartments,
        page: parseInt(page),
        limit: parsedLimit,
        pages: totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('❌ [getFilteredApartments] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching filtered apartments',
      error: error.message
    });
  }
};

module.exports = getFilteredApartments;