const verifyToken = async (req, res) => {
  // The protect middleware has already verified the token and set req.user
  // Just return the user data that the frontend needs
  
  console.log('✅ [Verify] User verified:', req.user.email, 'Role:', req.user.role);

  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role,
      name: req.user.name,
      emailActivated: req.user.emailActivated,
      createdAt: req.user.createdAt
    },
    role: req.user.role, // Include role at root level for backward compatibility
    message: 'Token verified successfully'
  });
};

module.exports = { verifyToken };