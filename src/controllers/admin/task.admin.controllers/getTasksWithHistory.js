const Task = require('../../../models/Task');

// Get tasks with execution history
const getTasksWithHistory = async (req, res) => {
  try {
    const tasks = await Task.find({
      'executionHistory.0': { $exists: true }
    })
      .populate({
        path: 'creator',
        select: 'name email role'
      })
      .populate({
        path: 'device',
        select: 'name type status room',
        populate: {
          path: 'room',
          select: 'name type'
        }
      })
      .sort({ 'executionHistory.timestamp': -1 });

    res.json({
      success: true,
      count: tasks.length,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks with history',
      error: error.message
    });
  }
};

module.exports = getTasksWithHistory;