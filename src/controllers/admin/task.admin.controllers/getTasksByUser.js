const Task = require('../../../models/Task');

// Get tasks by user ID
const getTasksByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const tasks = await Task.find({ creator: userId })
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
      userId,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user tasks',
      error: error.message
    });
  }
};

module.exports = getTasksByUser;