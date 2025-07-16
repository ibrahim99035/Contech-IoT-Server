const User = require('../../../models/User');

// GET - Get all users with comprehensive analysis
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .populate('apartments', 'name')
      .populate('devices', 'name type status')
      .populate('tasks', 'name status nextExecution')
      .sort({ createdAt: -1 });

    // Analysis data
    const analysis = {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.active).length,
      inactiveUsers: users.filter(u => !u.active).length,
      emailActivatedUsers: users.filter(u => u.emailActivated).length,
      roleDistribution: {
        admin: users.filter(u => u.role === 'admin').length,
        moderator: users.filter(u => u.role === 'moderator').length,
        customer: users.filter(u => u.role === 'customer').length
      },
      googleAuthUsers: users.filter(u => u.googleId).length,
      usersWithApartments: users.filter(u => u.apartments.length > 0).length,
      usersWithDevices: users.filter(u => u.devices.length > 0).length,
      usersWithTasks: users.filter(u => u.tasks.length > 0).length,
      averageApartmentsPerUser: users.reduce((sum, u) => sum + u.apartments.length, 0) / users.length,
      averageDevicesPerUser: users.reduce((sum, u) => sum + u.devices.length, 0) / users.length,
      averageTasksPerUser: users.reduce((sum, u) => sum + u.tasks.length, 0) / users.length,
      recentRegistrations: users.filter(u => {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        return u.createdAt > oneWeekAgo;
      }).length
    };

    res.json({
      success: true,
      data: users,
      analysis,
      pagination: {
        total: users.length,
        page: 1,
        pages: 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

module.exports = getAllUsers;