const User = require('../../models/User');

// Get all users (admin access)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.id; // Get the user ID from the request parameters

    // Find the user by ID
    const user = await User.findById(userId);

    // Check if the user was found
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user' });
  }
};

// Delete a user by ID
exports.deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting user' });
  }
};

// Get all customers
exports.getCustomers = async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching customers' });
  }
};

// Get all admins
exports.getAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' });
    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching admins' });
  }
};

// Get all moderators
exports.getModerators = async (req, res) => {
  try {
    const moderators = await User.find({ role: 'moderator' });
    res.json(moderators);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching moderators' });
  }
};

// Get Current User Info
exports.getCurrentUser = async (req, res) => {
  try {
    const { userId } = req.body; // Extract user ID from the request body

    // Validate if userId is provided
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Fetch the user by ID and exclude the password field
    const user = await User.findById(userId).select('-password');

    // If no user is found, return a 404 response
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Respond with the user data
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user data' });
  }
};

// Update user details
exports.updateUser = async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }); 
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: 'Error updating user' });
  }
};