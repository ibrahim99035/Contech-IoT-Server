const User = require('../../../models/User');

// GET - Get users with filters and search
const getFilteredUsers = async (req, res) => {
  try {
    const {
      role,
      active,
      emailActivated,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    // Build filter object
    const filter = {};
    if (role) filter.role = role;
    if (active !== undefined) filter.active = active === 'true';
    if (emailActivated !== undefined) filter.emailActivated = emailActivated === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(filter)
      .populate('apartments', 'name')
      .populate('devices', 'name type status')
      .populate('tasks', 'name status')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments(filter);

    res.json({
      success: true,
      data: users,
      pagination: {
        total: totalUsers,
        page: parseInt(page),
        pages: Math.ceil(totalUsers / parseInt(limit)),
        hasNext: skip + users.length < totalUsers,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching filtered users',
      error: error.message
    });
  }
};

module.exports = getFilteredUsers;