const User = require('../../../models/User');

// GET - Get all users with optimized pagination
const getAllUsers = async (req, res) => {
  try {
    // Extract and validate pagination parameters
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100); // Max 100 per page
    const skip = (page - 1) * limit;

    // Use aggregation pipeline for better performance
    const pipeline = [
      // Match stage (add filters here if needed)
      { $match: {} },
      
      // Add analysis calculations
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: {
            $sum: { $cond: [{ $eq: ['$active', true] }, 1, 0] }
          },
          inactiveUsers: {
            $sum: { $cond: [{ $eq: ['$active', false] }, 1, 0] }
          },
          emailActivatedUsers: {
            $sum: { $cond: [{ $eq: ['$emailActivated', true] }, 1, 0] }
          },
          adminUsers: {
            $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] }
          },
          moderatorUsers: {
            $sum: { $cond: [{ $eq: ['$role', 'moderator'] }, 1, 0] }
          },
          customerUsers: {
            $sum: { $cond: [{ $eq: ['$role', 'customer'] }, 1, 0] }
          },
          googleAuthUsers: {
            $sum: { $cond: [{ $ne: ['$googleId', null] }, 1, 0] }
          },
          totalApartments: { $sum: { $size: { $ifNull: ['$apartments', []] } } },
          totalDevices: { $sum: { $size: { $ifNull: ['$devices', []] } } },
          totalTasks: { $sum: { $size: { $ifNull: ['$tasks', []] } } }
        }
      }
    ];

    // Get analysis data efficiently
    const [analysisResult] = await User.aggregate(pipeline);
    const totalUsers = analysisResult?.totalUsers || 0;
    const totalPages = Math.ceil(totalUsers / limit);

    // Validate page number
    if (page > totalPages && totalPages > 0) {
      return res.status(400).json({
        success: false,
        message: `Page ${page} does not exist. Total pages: ${totalPages}`
      });
    }

    // Fetch paginated users
    const users = await User.find({})
      .select('-password -__v')
      .populate('apartments', 'name')
      .populate('devices', 'name type status')
      .populate('tasks', 'name status nextExecution')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() for better performance

    // Calculate recent registrations
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentRegistrations = await User.countDocuments({
      createdAt: { $gt: oneWeekAgo }
    });

    // Build analysis object
    const analysis = {
      totalUsers: analysisResult?.totalUsers || 0,
      activeUsers: analysisResult?.activeUsers || 0,
      inactiveUsers: analysisResult?.inactiveUsers || 0,
      emailActivatedUsers: analysisResult?.emailActivatedUsers || 0,
      roleDistribution: {
        admin: analysisResult?.adminUsers || 0,
        moderator: analysisResult?.moderatorUsers || 0,
        customer: analysisResult?.customerUsers || 0
      },
      googleAuthUsers: analysisResult?.googleAuthUsers || 0,
      usersWithApartments: await User.countDocuments({ 
        apartments: { $exists: true, $not: { $size: 0 } } 
      }),
      usersWithDevices: await User.countDocuments({ 
        devices: { $exists: true, $not: { $size: 0 } } 
      }),
      usersWithTasks: await User.countDocuments({ 
        tasks: { $exists: true, $not: { $size: 0 } } 
      }),
      averageApartmentsPerUser: totalUsers > 0 ? 
        (analysisResult?.totalApartments || 0) / totalUsers : 0,
      averageDevicesPerUser: totalUsers > 0 ? 
        (analysisResult?.totalDevices || 0) / totalUsers : 0,
      averageTasksPerUser: totalUsers > 0 ? 
        (analysisResult?.totalTasks || 0) / totalUsers : 0,
      recentRegistrations
    };

    // Pagination info
    const pagination = {
      total: totalUsers,
      page: page,
      pages: totalPages,
      limit: limit,
      showing: users.length,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      startIndex: skip + 1,
      endIndex: skip + users.length
    };

    res.json({
      success: true,
      data: users,
      analysis,
      pagination
    });

  } catch (error) {
    console.error('Error in getAllUsers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = getAllUsers;