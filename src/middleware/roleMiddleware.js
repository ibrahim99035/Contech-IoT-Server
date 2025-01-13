const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        // Check if req.user is defined
        if (!req.user) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Check if the user's role is in the allowed roles
        let therole = req.user.role;
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access forbidden: Insufficient permissions', therole });
        }
        next();
    };
};

module.exports = { authorizeRoles };