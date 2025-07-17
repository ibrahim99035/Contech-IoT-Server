const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // Enhanced debugging to understand the issue
    console.log('🔍 [Auth Debug] req.user:', req.user);
    console.log('🔍 [Auth Debug] req.user type:', typeof req.user);
    console.log('🔍 [Auth Debug] req.user === null:', req.user === null);
    console.log('🔍 [Auth Debug] req.user === undefined:', req.user === undefined);

    // More comprehensive check
    if (!req.user) {
      console.log('❌ [Auth Error] req.user is falsy:', req.user);
      return res.status(401).json({
        message: 'User not authenticated',
        debug: {
          userExists: !!req.user,
          userType: typeof req.user,
          userValue: req.user
        }
      });
    }

    // Check if user object has role property
    if (!req.user.role) {
      console.log('❌ [Auth Error] User object missing role:', req.user);
      return res.status(401).json({
        message: 'User missing role information',
        debug: {
          user: req.user,
          hasRole: 'role' in req.user,
          roleValue: req.user.role
        }
      });
    }

    const userRole = req.user.role;
    console.log('🔍 [Auth Debug] User role:', userRole);
    console.log('🔍 [Auth Debug] Required roles:', roles);

    if (!roles.includes(userRole)) {
      console.log('❌ [Auth Error] Insufficient permissions');
      return res.status(403).json({
        message: 'Access forbidden: Insufficient permissions',
        userRole: userRole,
        requiredRoles: roles
      });
    }

    console.log('✅ [Auth Success] User authorized with role:', userRole);
    next();
  };
};

module.exports = { authorizeRoles };