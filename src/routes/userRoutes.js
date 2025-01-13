const express = require('express');

const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const { 
        getAllUsers, 
        getUserById, 
        deleteUser,
        getCustomers,
        getAdmins,
        getModerators,
        getCurrentUser,
        updateUser
} = require('../controllers/user/userController');

const router = express.Router();

router.get('/users', protect, authorizeRoles('admin'), getAllUsers); // Admin can get all users
router.get('/user/:id', protect, authorizeRoles('admin'), getUserById); // Admin can get a user by ID
router.delete('/user/:id/delete', protect, authorizeRoles('admin'), deleteUser); // Admin can delete user

router.get('/users/get-one', protect, getCurrentUser);

router.put('/user/update', protect, updateUser);

// Get all customers
router.get('/users/customers', protect, authorizeRoles('admin'), getCustomers);

// Get all admins
router.get('/users/admins', protect, authorizeRoles('admin'), getAdmins);

// Get all moderators
router.get('/users/moderators', protect, authorizeRoles('admin'), getModerators);

module.exports = router;