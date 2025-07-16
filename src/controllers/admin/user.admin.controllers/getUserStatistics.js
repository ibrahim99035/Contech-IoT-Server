const User = require('../../../models/User');
const Apartment = require('../../../models/Apartment');
const Room = require('../../../models/Room');
const Device = require('../../../models/Device');
const Task = require('../../../models/Task');

// GET - Get user statistics and analytics
const getUserStatistics = async (req, res) => {
  try {
    const users = await User.find({});
    const apartments = await Apartment.find({});
    const devices = await Device.find({});
    const tasks = await Task.find({});

    // Time-based analysis
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const statistics = {
      userGrowth: {
        thisWeek: users.filter(u => u.createdAt > oneWeekAgo).length,
        thisMonth: users.filter(u => u.createdAt > oneMonthAgo).length,
        total: users.length
      },
      engagement: {
        activeUsers: users.filter(u => u.active).length,
        emailActivatedUsers: users.filter(u => u.emailActivated).length,
        usersWithContent: users.filter(u => u.apartments.length > 0 || u.devices.length > 0).length
      },
      contentCreation: {
        totalApartments: apartments.length,
        totalDevices: devices.length,
        totalTasks: tasks.length,
        averageApartmentsPerUser: apartments.length / users.length,
        averageDevicesPerUser: devices.length / users.length,
        averageTasksPerUser: tasks.length / users.length
      },
      systemHealth: {
        activeTasks: tasks.filter(t => t.status === 'active').length,
        failedTasks: tasks.filter(t => t.status === 'failed').length,
        completedTasks: tasks.filter(t => t.status === 'completed').length,
        onlineDevices: devices.filter(d => d.status === 'on').length,
        offlineDevices: devices.filter(d => d.status === 'off').length
      }
    };

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user statistics',
      error: error.message
    });
  }
};

module.exports = getUserStatistics;