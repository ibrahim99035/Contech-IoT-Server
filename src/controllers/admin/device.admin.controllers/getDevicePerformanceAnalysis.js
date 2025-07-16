const Device = require('../../../models/Device');

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

module.exports = getDevicePerformanceAnalysis;