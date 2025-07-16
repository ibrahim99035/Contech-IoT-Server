const Task = require('../../../models/Task');

// Get all tasks with comprehensive details
const getAllTasks = async (req, res) => {
  try {
    const tasks = await Task.find({})
      .populate({
        path: 'creator',
        select: 'name email role active emailActivated'
      })
      .populate({
        path: 'device',
        select: 'name type status room componentNumber activated order',
        populate: {
          path: 'room',
          select: 'name type apartment',
          populate: {
            path: 'apartment',
            select: 'name creator members'
          }
        }
      })
      .populate({
        path: 'notifications.recipients',
        select: 'name email'
      })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: tasks.length,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks',
      error: error.message
    });
  }
};

module.exports = getAllTasks;