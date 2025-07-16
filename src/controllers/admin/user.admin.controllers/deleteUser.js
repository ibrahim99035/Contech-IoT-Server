const User = require('../../../models/User');

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

module.exports = deleteUser;