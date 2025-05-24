/**
 * Google OAuth controller for handling authentication from Flutter mobile app
 */

const User = require('../../models/User');
const generateToken = require('../../utils/generateToken');

/**
 * Handle Google authentication for mobile app
 * This endpoint receives the ID token from Flutter and authenticates the user
 */
exports.googleLogin = (req, res, next) => {
  // The authentication happens in the passport middleware
  // By the time we get here, req.user contains the authenticated user
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Google authentication failed' 
      });
    }

    // Generate JWT token for our application
    const token = generateToken(req.user._id);
    
    // Return user data and token
    res.json({
      success: true,
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        emailActivated: req.user.emailActivated
      },
      token
    });
  } catch (error) {
    console.error('Error in Google login handler:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during authentication' 
    });
  }
};

/**
 * Utility function to verify if a user has a Google account
 * Used to check if user can link or unlink Google account
 */
exports.checkGoogleLink = async (req, res) => {
  try {
    // Get user ID from authentication middleware
    const userId = req.user._id;
    
    // Find the user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Check if Google ID exists
    res.json({ 
      success: true, 
      isLinked: !!user.googleId 
    });
  } catch (error) {
    console.error('Error checking Google link:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while checking Google account link' 
    });
  }
};

/**
 * Unlink Google account from user account
 */
exports.unlinkGoogle = async (req, res) => {
  try {
    // Get user ID from authentication middleware
    const userId = req.user._id;
    
    // Find and update the user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Check if the user has a password set
    if (!user.password || user.password.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Cannot unlink Google account without setting a password first'
      });
    }
    
    // Remove Google ID
    user.googleId = undefined;
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Google account unlinked successfully' 
    });
  } catch (error) {
    console.error('Error unlinking Google account:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while unlinking Google account' 
    });
  }
};