const Task = require('../../../models/Task');
const moment = require('moment-timezone');

// Get tasks scheduled for today
const getTasksScheduledToday = async (req, res) => {
  try {
    const timezone = req.query.timezone || 'UTC';
    const today = moment.tz(timezone).startOf('day');
    const tomorrow = today.clone().add(1, 'day');

    const tasks = await Task.find({
      nextExecution: {
        $gte: today.utc().toDate(),
        $lt: tomorrow.utc().toDate()
      }
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
      date: today.format('YYYY-MM-DD'),
      timezone,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching today\'s tasks',
      error: error.message
    });
  }
};

module.exports =  getTasksScheduledToday;