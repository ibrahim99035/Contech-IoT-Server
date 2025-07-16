const Task = require('../../models/Task');
const User = require('../../models/User');
const Device = require('../../models/Device');
const Room = require('../../models/Room');
const Apartment = require('../../models/Apartment');
const moment = require('moment-timezone');

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

// Get task analytics/statistics
const getTaskAnalytics = async (req, res) => {
  try {
    // Basic counts
    const totalTasks = await Task.countDocuments();
    const activeTasks = await Task.countDocuments({ status: 'active' });
    const scheduledTasks = await Task.countDocuments({ status: 'scheduled' });
    const completedTasks = await Task.countDocuments({ status: 'completed' });
    const failedTasks = await Task.countDocuments({ status: 'failed' });
    const cancelledTasks = await Task.countDocuments({ status: 'cancelled' });

    // Tasks by recurrence type
    const tasksByRecurrence = await Task.aggregate([
      {
        $group: {
          _id: '$schedule.recurrence.type',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Tasks by action type
    const tasksByAction = await Task.aggregate([
      {
        $group: {
          _id: '$action.type',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Tasks by creator
    const tasksByCreator = await Task.aggregate([
      {
        $group: {
          _id: '$creator',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          _id: 1,
          count: 1,
          userName: '$user.name',
          userEmail: '$user.email',
          userRole: '$user.role'
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Tasks with notifications enabled
    const tasksWithNotifications = await Task.countDocuments({ 'notifications.enabled': true });

    // Recent task activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentTasks = await Task.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Task execution success rate
    const tasksWithHistory = await Task.find({
      'executionHistory.0': { $exists: true }
    });

    let totalExecutions = 0;
    let successfulExecutions = 0;

    tasksWithHistory.forEach(task => {
      totalExecutions += task.executionHistory.length;
      successfulExecutions += task.executionHistory.filter(exec => exec.status === 'success').length;
    });

    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions * 100).toFixed(2) : 0;

    // Upcoming tasks (next 24 hours)
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 24);
    
    const upcomingTasks = await Task.countDocuments({
      nextExecution: {
        $gte: new Date(),
        $lte: tomorrow
      }
    });

    res.json({
      success: true,
      analytics: {
        totalTasks,
        tasksByStatus: {
          active: activeTasks,
          scheduled: scheduledTasks,
          completed: completedTasks,
          failed: failedTasks,
          cancelled: cancelledTasks
        },
        tasksByRecurrence,
        tasksByAction,
        tasksByCreator,
        tasksWithNotifications,
        recentTasks,
        executionStats: {
          totalExecutions,
          successfulExecutions,
          successRate: `${successRate}%`
        },
        upcomingTasks
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching task analytics',
      error: error.message
    });
  }
};

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

// Search tasks
const searchTasks = async (req, res) => {
  try {
    const { q, status, recurrence, creator, device } = req.query;
    
    let query = {};
    
    // Text search
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } }
      ];
    }
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by recurrence type
    if (recurrence) {
      query['schedule.recurrence.type'] = recurrence;
    }
    
    // Filter by creator
    if (creator) {
      query.creator = creator;
    }
    
    // Filter by device
    if (device) {
      query.device = device;
    }
    
    const tasks = await Task.find(query)
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
      query: req.query,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error searching tasks',
      error: error.message
    });
  }
};

module.exports = {
  getAllTasks,
  getTaskById,
  getTasksByUser,
  getTasksByDevice,
  getTasksByStatus,
  getTasksByRecurrence,
  getTasksScheduledToday,
  getOverdueTasks,
  getTaskAnalytics,
  getTasksWithHistory,
  searchTasks
};