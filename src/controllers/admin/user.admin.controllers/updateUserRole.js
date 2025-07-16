const User = require('../../../models/User');

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

module.exports = updateUserRole;