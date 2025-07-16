const Task = require('../../../models/Task');

// Get tasks by status
const getTasksByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    
    const tasks = await Task.find({ status })
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
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: tasks.length,
      status,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks by status',
      error: error.message
    });
  }
};

module.exports = getTasksByStatus;