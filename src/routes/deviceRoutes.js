const express = require('express');
const router = express.Router();

const { createDevice } = require('../controllers/control/devices/createDevice');
const { updateDeviceName } = require('../controllers/control/devices/updateDeviceName');
const { updateComponentNumber } = require('../controllers/control/devices/updateComponentNumber');
const { getDevicesByRoom } = require('../controllers/control/devices/getDevicesByRoom');
const { deleteDevice } = require('../controllers/control/devices/deleteDevice');

// Middleware for authentication (Ensures user is authenticated)
const { protect } = require('../middleware/authMiddleware');

/**
 * @route   POST /api/devices/create
 * @desc    Create a new device within a specific room. Only the room creator can perform this action.
 * @body    { name: string, room: string }
 * @access  Protected (Requires authentication)
 */
router.post('/devices/create', protect, createDevice);

/**
 * @route   PUT /api/devices/:id/update-name
 * @desc    Update the name of a device. Only the device creator can perform this action.
 * @params  { id: string } - The ID of the device.
 * @body    { name: string }
 * @access  Protected (Requires authentication)
 */
router.put('/devices/:id/update-name', protect, updateDeviceName);

/**
 * @route   PUT /api/devices/:id/update-component-number
 * @desc    Update the component number of a device. The component number is stored as a hashed value.
 *          Only the device creator can perform this action.
 * @params  { id: string } - The ID of the device.
 * @body    { componentNumber: string }
 * @access  Protected (Requires authentication)
 */
router.put('/devices/:id/update-component-number', protect, updateComponentNumber);

/**
 * @route   GET /api/devices/room/:roomId
 * @desc    Retrieve all devices within a specific room. Accessible to the room's creator and users.
 * @params  { roomId: string } - The ID of the room.
 * @access  Protected (Requires authentication)
 */
router.get('/devices/room/:roomId', protect, getDevicesByRoom);

/**
 * @route   DELETE /api/devices/:id
 * @desc    Delete a device from a room. Only the device creator can perform this action.
 * @params  { id: string } - The ID of the device.
 * @access  Protected (Requires authentication)
 */
router.delete('/devices/:id', protect, deleteDevice);

module.exports = router;