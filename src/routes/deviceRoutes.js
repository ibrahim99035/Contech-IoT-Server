const express = require('express');
const router = express.Router();

const { createDevice } = require('../controllers/control/devices/createDevice');
const { updateDeviceName } = require('../controllers/control/devices/updateDeviceName');
const { updateComponentNumber } = require('../controllers/control/devices/updateComponentNumber');
const { getDevicesByRoom } = require('../controllers/control/devices/getDevicesByRoom');
// const { getDevicesByUser } = require('../controllers/control/devices/getDevicesbyUser');
const { deleteDevice } = require('../controllers/control/devices/deleteDevice');
const { getDeviceUsers } = require('../controllers/control/devices/getDeviceUsers');
const { removeUserFromDevice } = require('../controllers/control/devices/removeUserFromDevice');
const { exitDevice } = require('../controllers/control/devices/exitDevice');
const { assignUsersToDevice } = require('../controllers/control/devices/assignUsersToDevice');
const { toggleActivation } = require('../controllers/control/devices/activationController');
const { getAvailableOrders } = require('../controllers/control/devices/GetAvailableOrders');
const { updateDeviceOrder } = require('../controllers/control/devices/UpdateDeviceOrder');

// Middleware for authentication (Ensures user is authenticated)
const { protect } = require('../middleware/authMiddleware');

const { checkDeviceLimits } = require('../middleware/checkSubscriptionLimits');

/**
 * @route   POST /api/devices/create
 * @desc    Create a new device within a specific room. Only the room creator can perform this action.
 * @body    { name: string, room: string }
 * @access  Protected (Requires authentication)
 */
router.post('/devices/create', protect, checkDeviceLimits, createDevice);

/**
 * @route   PUT /api/devices/:id/update-name
 * @desc    Update the name of a device. Only the device creator can perform this action.
 * @params  { id: string } - The ID of the device.
 * @body    { name: string }
 * @access  Protected
 */
router.put('/devices/:id/update-name', protect, updateDeviceName);

/**
 * @route   PUT /api/devices/:id/update-component-number
 * @desc    Update the component number of a device. The component number is stored as a hashed value.
 * @params  { id: string } - The ID of the device.
 * @access  Protected
 */
router.put('/devices/:id/update-component-number', protect, updateComponentNumber);

/**
 * @route   GET /api/devices/room/:roomId
 * @desc    Retrieve all devices within a specific room. Accessible to the room's creator and users.
 * @params  { roomId: string }
 * @access  Protected
 */
router.get('/devices/room/:roomId', protect, getDevicesByRoom);

/**
 * @route   DELETE /api/devices/delete/:id
 * @desc    Delete a device. Only the device creator can perform this action.
 * @params  { id: string }
 * @access  Protected
 */
router.delete('/devices/delete/:id', protect, deleteDevice);

/**
 * @route   GET /api/devices/get-users/device/:deviceId
 * @desc    Retrieve all users assigned to a specific device.
 * @params  { deviceId: string }
 * @access  Protected
 */
router.get('/devices/get-users/device/:deviceId', protect, getDeviceUsers);

/**
 * @route   PUT /api/devices/remove-user/device/:deviceId/user/:userId
 * @desc    Remove a specific user from a device's user list. Only the device creator can perform this action.
 * @params  { deviceId: string, userId: string }
 * @access  Protected
 */
router.put('/devices/remove-user/device/:deviceId/user/:userId', protect, removeUserFromDevice);

/**
 * @route   PUT /api/devices/exit-device/:deviceId
 * @desc    Remove the current user from a device they are part of.
 * @params  { deviceId: string }
 * @access  Protected
 */
router.put('/devices/exist-device/:deviceId', protect, exitDevice);

/**
 * @route   PUT /api/devices/:deviceId/assign-users
 * @desc    Assign users to a device. Only the device creator can perform this action.
 * @params  { deviceId: string }
 * @body    { userIds: string[] }
 * @access  Protected
 */
router.put('/devices/:deviceId/assign-users', protect, assignUsersToDevice);

/**
 * @route   GET /api/devices/my-devices
 * @desc    Retrieve all devices the authenticated user has access to.
 * @access  Protected
 */
// router.get('/devices/get-devices/user', protect, getDevicesByUser);

/**
 * @route   PUT /api/devices/:deviceId/toggle-activation
 * @desc    Toggle the activation status of a device. Only the device creator can perform this action.
 * @params  { deviceId: string }
 * @access  Protected
 */
router.put('/devices/:deviceId/toggle-activation', protect, toggleActivation);

/**
 * @route   GET /api/devices/room/:roomId/orders
 * @desc    Get available orders (1-6) for devices in a specific room. Only room creator can access.
 * @params  { roomId: string }
 * @access  Protected
 */
router.get('/devices/room/:roomId/orders', protect, getAvailableOrders);

/**
 * @route   GET /api/devices/room/:roomId/orders/:deviceId
 * @desc    Get available orders for a room and current order of a specific device. Only room creator can access.
 * @params  { roomId: string, deviceId: string }
 * @access  Protected
 */
router.get('/devices/room/:roomId/orders/:deviceId', protect, getAvailableOrders);

/**
 * @route   PUT /api/devices/:deviceId/order
 * @desc    Update the order of a specific device (1-6). Only device creator or room creator can perform this action.
 * @params  { deviceId: string }
 * @body    { order: number }
 * @access  Protected
 */
router.put('/devices/:deviceId/update-order', protect, updateDeviceOrder);

module.exports = router;