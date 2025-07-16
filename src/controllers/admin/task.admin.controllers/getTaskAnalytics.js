const Task = require('../../../models/Task');

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

module.exports = getTaskAnalytics;