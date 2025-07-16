const User = require('../../models/User');
const Apartment = require('../../models/Apartment');
const Room = require('../../models/Room');
const Device = require('../../models/Device');
const Task = require('../../models/Task');

// GET - Get all users with comprehensive analysis
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .populate('apartments', 'name')
      .populate('devices', 'name type status')
      .populate('tasks', 'name status nextExecution')
      .sort({ createdAt: -1 });

    // Analysis data
    const analysis = {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.active).length,
      inactiveUsers: users.filter(u => !u.active).length,
      emailActivatedUsers: users.filter(u => u.emailActivated).length,
      roleDistribution: {
        admin: users.filter(u => u.role === 'admin').length,
        moderator: users.filter(u => u.role === 'moderator').length,
        customer: users.filter(u => u.role === 'customer').length
      },
      googleAuthUsers: users.filter(u => u.googleId).length,
      usersWithApartments: users.filter(u => u.apartments.length > 0).length,
      usersWithDevices: users.filter(u => u.devices.length > 0).length,
      usersWithTasks: users.filter(u => u.tasks.length > 0).length,
      averageApartmentsPerUser: users.reduce((sum, u) => sum + u.apartments.length, 0) / users.length,
      averageDevicesPerUser: users.reduce((sum, u) => sum + u.devices.length, 0) / users.length,
      averageTasksPerUser: users.reduce((sum, u) => sum + u.tasks.length, 0) / users.length,
      recentRegistrations: users.filter(u => {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        return u.createdAt > oneWeekAgo;
      }).length
    };

    res.json({
      success: true,
      data: users,
      analysis,
      pagination: {
        total: users.length,
        page: 1,
        pages: 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

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

// GET - Get users with filters and search
const getFilteredUsers = async (req, res) => {
  try {
    const {
      role,
      active,
      emailActivated,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    // Build filter object
    const filter = {};
    if (role) filter.role = role;
    if (active !== undefined) filter.active = active === 'true';
    if (emailActivated !== undefined) filter.emailActivated = emailActivated === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(filter)
      .populate('apartments', 'name')
      .populate('devices', 'name type status')
      .populate('tasks', 'name status')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments(filter);

    res.json({
      success: true,
      data: users,
      pagination: {
        total: totalUsers,
        page: parseInt(page),
        pages: Math.ceil(totalUsers / parseInt(limit)),
        hasNext: skip + users.length < totalUsers,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching filtered users',
      error: error.message
    });
  }
};

// GET - Get user statistics and analytics
const getUserStatistics = async (req, res) => {
  try {
    const users = await User.find({});
    const apartments = await Apartment.find({});
    const devices = await Device.find({});
    const tasks = await Task.find({});

    // Time-based analysis
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const statistics = {
      userGrowth: {
        thisWeek: users.filter(u => u.createdAt > oneWeekAgo).length,
        thisMonth: users.filter(u => u.createdAt > oneMonthAgo).length,
        total: users.length
      },
      engagement: {
        activeUsers: users.filter(u => u.active).length,
        emailActivatedUsers: users.filter(u => u.emailActivated).length,
        usersWithContent: users.filter(u => u.apartments.length > 0 || u.devices.length > 0).length
      },
      contentCreation: {
        totalApartments: apartments.length,
        totalDevices: devices.length,
        totalTasks: tasks.length,
        averageApartmentsPerUser: apartments.length / users.length,
        averageDevicesPerUser: devices.length / users.length,
        averageTasksPerUser: tasks.length / users.length
      },
      systemHealth: {
        activeTasks: tasks.filter(t => t.status === 'active').length,
        failedTasks: tasks.filter(t => t.status === 'failed').length,
        completedTasks: tasks.filter(t => t.status === 'completed').length,
        onlineDevices: devices.filter(d => d.status === 'on').length,
        offlineDevices: devices.filter(d => d.status === 'off').length
      }
    };

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user statistics',
      error: error.message
    });
  }
};

// PUT - Update user role (admin only action)
const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;

    // Validate role
    if (!['admin', 'moderator', 'customer'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be admin, moderator, or customer'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update only the role
    user.role = role;
    await user.save();

    res.json({
      success: true,
      message: `User role updated to ${role}`,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating user role',
      error: error.message
    });
  }
};

// DELETE - Delete user (admin only action)
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent admin from deleting themselves
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Store user info for response
    const deletedUserInfo = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'User deleted successfully',
      deletedUser: deletedUserInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  getFilteredUsers,
  getUserStatistics,
  updateUserRole,
  deleteUser
};