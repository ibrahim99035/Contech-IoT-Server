const Task = require('../../../models/Task');

// Get tasks by recurrence type
const getTasksByRecurrence = async (req, res) => {
  try {
    const { type } = req.params;
    
    const tasks = await Task.find({ 'schedule.recurrence.type': type })
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
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: tasks.length,
      recurrenceType: type,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks by recurrence type',
      error: error.message
    });
  }
};

module.exports = getTasksByRecurrence;