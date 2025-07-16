const Task = require('../../../models/Task');

// Get tasks by device ID
const getTasksByDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const tasks = await Task.find({ device: deviceId })
      .populate({
        path: 'creator',
        select: 'name email role'
      })
      .populate({
        path: 'device',
        select: 'name type status room'
      })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: tasks.length,
      deviceId,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching device tasks',
      error: error.message
    });
  }
};

module.exports = getTasksByDevice;