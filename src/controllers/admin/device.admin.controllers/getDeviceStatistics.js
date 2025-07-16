const Device = require('../../../models/Device');
const Room = require('../../../models/Room');
const Task = require('../../../models/Task');

// GET - Get device statistics and analytics
const getDeviceStatistics = async (req, res) => {
  try {
    const devices = await Device.find({})
      .populate('creator', 'role')
      .populate('room')
      .populate('users')
      .populate('tasks');

    const tasks = await Task.find({});
    const rooms = await Room.find({});

    // Time-based analysis
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const statistics = {
      deviceGrowth: {
        thisWeek: devices.filter(device => device.createdAt > oneWeekAgo).length,
        thisMonth: devices.filter(device => device.createdAt > oneMonthAgo).length,
        total: devices.length
      },
      deviceTypeAnalysis: {
        distribution: devices.reduce((acc, device) => {
          acc[device.type] = (acc[device.type] || 0) + 1;
          return acc;
        }, {}),
        mostPopularType: Object.entries(devices.reduce((acc, device) => {
          acc[device.type] = (acc[device.type] || 0) + 1;
          return acc;
        }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
      },
      statusAnalysis: {
        distribution: devices.reduce((acc, device) => {
          acc[device.status] = (acc[device.status] || 0) + 1;
          return acc;
        }, {}),
        activeDevices: devices.filter(device => device.activated).length,
        inactiveDevices: devices.filter(device => !device.activated).length,
        activationRate: (devices.filter(device => device.activated).length / devices.length * 100) || 0
      },
      automationAnalysis: {
        totalTasks: tasks.length,
        devicesWithTasks: devices.filter(device => device.tasks.length > 0).length,
        devicesWithoutTasks: devices.filter(device => device.tasks.length === 0).length,
        averageTasksPerDevice: tasks.length / devices.length || 0,
        taskStatusDistribution: tasks.reduce((acc, task) => {
          acc[task.status] = (acc[task.status] || 0) + 1;
          return acc;
        }, {}),
        automationRate: (devices.filter(device => device.tasks.length > 0).length / devices.length * 100) || 0
      },
      capabilityAnalysis: {
        devicesWithBrightness: devices.filter(device => device.capabilities.brightness).length,
        devicesWithColor: devices.filter(device => device.capabilities.color).length,
        devicesWithBothCapabilities: devices.filter(device => device.capabilities.brightness && device.capabilities.color).length,
        smartDevicesPercentage: (devices.filter(device => device.capabilities.brightness || device.capabilities.color).length / devices.length * 100) || 0
      },
      roomDistribution: {
        totalRooms: rooms.length,
        averageDevicesPerRoom: devices.length / rooms.length || 0,
        roomsWithDevices: rooms.filter(room => room.devices.length > 0).length,
        roomsWithoutDevices: rooms.filter(room => room.devices.length === 0).length
      },
      userAccessAnalysis: {
        devicesWithUsers: devices.filter(device => device.users.length > 0).length,
        devicesWithoutUsers: devices.filter(device => device.users.length === 0).length,
        averageUsersPerDevice: devices.reduce((sum, device) => sum + device.users.length, 0) / devices.length || 0,
        totalDeviceAccess: devices.reduce((sum, device) => sum + device.users.length, 0)
      }
    };

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching device statistics',
      error: error.message
    });
  }
};

module.exports = getDeviceStatistics;