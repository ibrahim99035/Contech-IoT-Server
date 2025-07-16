const Task = require('../../../models/Task');

// Get overdue tasks
const getOverdueTasks = async (req, res) => {
  try {
    const now = new Date();
    
    const tasks = await Task.find({
      nextExecution: { $lt: now },
      status: { $in: ['scheduled', 'active'] }
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
          select: 'name type apartment',
          populate: {
            path: 'apartment',
            select: 'name'
          }
        }
      })
      .sort({ nextExecution: 1 });

    res.json({
      success: true,
      count: tasks.length,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching overdue tasks',
      error: error.message
    });
  }
};

module.exports = getOverdueTasks;