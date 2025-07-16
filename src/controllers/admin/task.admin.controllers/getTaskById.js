const Task = require('../../../models/Task');

// Get task by ID with full details
const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate({
        path: 'creator',
        select: 'name email role active emailActivated contactInfo'
      })
      .populate({
        path: 'device',
        select: 'name type status room componentNumber activated order capabilities',
        populate: {
          path: 'room',
          select: 'name type apartment users',
          populate: [
            {
              path: 'apartment',
              select: 'name creator members',
              populate: {
                path: 'creator members',
                select: 'name email role'
              }
            },
            {
              path: 'users',
              select: 'name email role'
            }
          ]
        }
      })
      .populate({
        path: 'notifications.recipients',
        select: 'name email role'
      });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Add formatted execution times
    const taskData = task.toObject();
    taskData.formattedNextExecution = task.getFormattedNextExecution();
    taskData.nextExecutionInUserTimezone = task.getNextExecutionInUserTimezone();

    res.json({
      success: true,
      data: taskData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching task',
      error: error.message
    });
  }
};

module.exports = getTaskById;