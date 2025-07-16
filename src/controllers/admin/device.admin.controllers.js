const Device = require('../../models/Device');
const Room = require('../../models/Room');
const Task = require('../../models/Task');
const User = require('../../models/User');

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

// GET - Get device performance analysis
const getDevicePerformanceAnalysis = async (req, res) => {
  try {
    const devices = await Device.find({})
      .populate('creator', 'name email role')
      .populate('room', 'name type')
      .populate('users', 'name email')
      .populate('tasks', 'name status executionHistory lastExecuted');

    const performanceAnalysis = devices.map(device => {
      const taskSuccessRate = device.tasks.length > 0 ? 
        (device.tasks.filter(task => task.status === 'completed').length / device.tasks.length * 100) : 0;
      
      const totalExecutions = device.tasks.reduce((sum, task) => sum + (task.executionHistory?.length || 0), 0);
      const successfulExecutions = device.tasks.reduce((sum, task) => 
        sum + (task.executionHistory?.filter(exec => exec.status === 'success').length || 0), 0);
      
      const executionSuccessRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions * 100) : 0;

      return {
        deviceId: device._id,
        deviceName: device.name,
        deviceType: device.type,
        status: device.status,
        activated: device.activated,
        room: device.room,
        creator: device.creator,
        totalTasks: device.tasks.length,
        activeTasks: device.tasks.filter(task => task.status === 'active').length,
        completedTasks: device.tasks.filter(task => task.status === 'completed').length,
        failedTasks: device.tasks.filter(task => task.status === 'failed').length,
        taskSuccessRate,
        totalExecutions,
        successfulExecutions,
        executionSuccessRate,
        lastTaskExecution: device.tasks.reduce((latest, task) => {
          const taskLastExec = task.lastExecuted ? new Date(task.lastExecuted) : null;
          return taskLastExec && (!latest || taskLastExec > latest) ? taskLastExec : latest;
        }, null),
        userAccessCount: device.users.length,
        hasCapabilities: device.capabilities.brightness || device.capabilities.color,
        componentNumber: device.componentNumber,
        order: device.order,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt
      };
    });

    // Sort by execution success rate (best performing first)
    performanceAnalysis.sort((a, b) => b.executionSuccessRate - a.executionSuccessRate);

    const overallAnalysis = {
      totalDevices: devices.length,
      averageTaskSuccessRate: performanceAnalysis.reduce((sum, analysis) => sum + analysis.taskSuccessRate, 0) / performanceAnalysis.length || 0,
      averageExecutionSuccessRate: performanceAnalysis.reduce((sum, analysis) => sum + analysis.executionSuccessRate, 0) / performanceAnalysis.length || 0,
      topPerformingDevices: performanceAnalysis.slice(0, 10),
      poorPerformingDevices: performanceAnalysis.filter(analysis => analysis.executionSuccessRate < 50),
      devicesWithoutTasks: performanceAnalysis.filter(analysis => analysis.totalTasks === 0).length,
      devicesWithFailedTasks: performanceAnalysis.filter(analysis => analysis.failedTasks > 0).length,
      totalTaskExecutions: performanceAnalysis.reduce((sum, analysis) => sum + analysis.totalExecutions, 0),
      totalSuccessfulExecutions: performanceAnalysis.reduce((sum, analysis) => sum + analysis.successfulExecutions, 0)
    };

    res.json({
      success: true,
      data: performanceAnalysis,
      overallAnalysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching device performance analysis',
      error: error.message
    });
  }
};

module.exports = {
  getAllDevices,
  getDeviceById,
  getFilteredDevices,
  getDeviceStatistics,
  getDevicePerformanceAnalysis
};