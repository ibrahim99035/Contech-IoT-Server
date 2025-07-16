const Device = require('../../../models/Device');

// GET - Get all devices with comprehensive analysis
const getAllDevices = async (req, res) => {
  try {
    const devices = await Device.find({})
      .populate('creator', 'name email role')
      .populate('room', 'name type apartment')
      .populate('users', 'name email role')
      .populate('tasks', 'name status nextExecution')
      .sort({ createdAt: -1 });

    // Analysis data
    const analysis = {
      totalDevices: devices.length,
      activeDevices: devices.filter(device => device.activated).length,
      inactiveDevices: devices.filter(device => !device.activated).length,
      deviceTypeDistribution: devices.reduce((acc, device) => {
        acc[device.type] = (acc[device.type] || 0) + 1;
        return acc;
      }, {}),
      deviceStatusDistribution: devices.reduce((acc, device) => {
        acc[device.status] = (acc[device.status] || 0) + 1;
        return acc;
      }, {}),
      devicesWithTasks: devices.filter(device => device.tasks.length > 0).length,
      devicesWithUsers: devices.filter(device => device.users.length > 0).length,
      averageTasksPerDevice: devices.reduce((sum, device) => sum + device.tasks.length, 0) / devices.length || 0,
      averageUsersPerDevice: devices.reduce((sum, device) => sum + device.users.length, 0) / devices.length || 0,
      devicesWithCapabilities: {
        brightness: devices.filter(device => device.capabilities.brightness).length,
        color: devices.filter(device => device.capabilities.color).length
      },
      devicesByCreatorRole: devices.reduce((acc, device) => {
        const role = device.creator.role;
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {}),
      recentDevices: devices.filter(device => {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        return device.createdAt > oneWeekAgo;
      }).length
    };

    res.json({
      success: true,
      data: devices,
      analysis,
      pagination: {
        total: devices.length,
        page: 1,
        pages: 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching devices',
      error: error.message
    });
  }
};

module.exports = getAllDevices;