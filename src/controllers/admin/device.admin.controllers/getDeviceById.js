const Device = require('../../../models/Device');

// GET - Get device by ID with full details
const getDeviceById = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id)
      .populate('creator', 'name email role active')
      .populate({
        path: 'room',
        populate: {
          path: 'apartment',
          select: 'name creator'
        }
      })
      .populate('users', 'name email role active')
      .populate('tasks', 'name status nextExecution action schedule');

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    // Device analysis
    const deviceAnalysis = {
      totalUsers: device.users.length,
      totalTasks: device.tasks.length,
      activeUsers: device.users.filter(user => user.active).length,
      activeTasks: device.tasks.filter(task => task.status === 'active').length,
      completedTasks: device.tasks.filter(task => task.status === 'completed').length,
      failedTasks: device.tasks.filter(task => task.status === 'failed').length,
      scheduledTasks: device.tasks.filter(task => task.status === 'scheduled').length,
      taskActionTypes: device.tasks.reduce((acc, task) => {
        acc[task.action.type] = (acc[task.action.type] || 0) + 1;
        return acc;
      }, {}),
      hasCapabilities: {
        brightness: device.capabilities.brightness,
        color: device.capabilities.color
      },
      currentSettings: {
        brightness: device.brightness,
        color: device.color,
        thermostatMode: device.thermostatMode,
        targetTemperature: device.targetTemperature,
        currentTemperature: device.currentTemperature,
        lockState: device.lockState
      },
      nicknames: device.nicknames || [],
      upcomingTasks: device.tasks
        .filter(task => task.nextExecution && task.nextExecution > new Date())
        .sort((a, b) => new Date(a.nextExecution) - new Date(b.nextExecution))
        .slice(0, 5),
      lastActivity: device.updatedAt,
      deviceAge: Math.floor((Date.now() - device.createdAt) / (1000 * 60 * 60 * 24)) + ' days'
    };

    res.json({
      success: true,
      data: device,
      analysis: deviceAnalysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching device',
      error: error.message
    });
  }
};

module.exports = getDeviceById;