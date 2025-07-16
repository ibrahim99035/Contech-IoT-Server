const Task = require('../../../models/Task');

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

module.exports = searchTasks;