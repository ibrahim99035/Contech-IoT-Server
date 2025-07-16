const User = require('../../../models/User');

// GET - Get user by ID with full details
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate({
        path: 'apartments',
        populate: {
          path: 'rooms',
          populate: {
            path: 'devices'
          }
        }
      })
      .populate('devices')
      .populate('tasks');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // User activity analysis
    const userAnalysis = {
      totalApartments: user.apartments.length,
      totalRooms: user.apartments.reduce((sum, apt) => sum + apt.rooms.length, 0),
      totalDevices: user.devices.length,
      totalTasks: user.tasks.length,
      activeTasks: user.tasks.filter(t => t.status === 'active').length,
      completedTasks: user.tasks.filter(t => t.status === 'completed').length,
      failedTasks: user.tasks.filter(t => t.status === 'failed').length,
      devicesByType: user.devices.reduce((acc, device) => {
        acc[device.type] = (acc[device.type] || 0) + 1;
        return acc;
      }, {}),
      lastActivity: user.updatedAt,
      accountAge: Math.floor((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24)) + ' days'
    };

    res.json({
      success: true,
      data: user,
      analysis: userAnalysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
};

module.exports = getUserById;