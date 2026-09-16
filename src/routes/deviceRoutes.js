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
 * @openapi
 * /api/device-handler/devices/create:
 *   post:
 *     summary: Create a new device in a room
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, room]
 *             properties:
 *               name: { type: string, example: "Ceiling Light" }
 *               room: { type: string }
 *               type: { type: string, example: "light" }
 *     responses:
 *       201: { description: Device created }
 *       403: { description: Limit reached }
 * 
 * /api/device-handler/devices/{id}/update-name:
 *   put:
 *     summary: Update device name
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200: { description: Device name updated }
 * 
 * /api/device-handler/devices/{id}/update-component-number:
 *   put:
 *     summary: Update device component number
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Component number updated }
 * 
 * /api/device-handler/devices/room/{roomId}:
 *   get:
 *     summary: Get all devices in a room
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Devices list }
 * 
 * /api/device-handler/devices/delete/{id}:
 *   delete:
 *     summary: Delete a device
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Device deleted }
 * 
 * /api/device-handler/devices/get-users/device/{deviceId}:
 *   get:
 *     summary: Get users assigned to a device
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Users list }
 * 
 * /api/device-handler/devices/remove-user/device/{deviceId}/user/{userId}:
 *   put:
 *     summary: Remove a user from a device
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User removed }
 * 
 * /api/device-handler/devices/exist-device/{deviceId}:
 *   put:
 *     summary: Exit device user list
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Exited device }
 * 
 * /api/device-handler/devices/{deviceId}/assign-users:
 *   put:
 *     summary: Assign users to device
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Users assigned }
 * 
 * /api/device-handler/devices/{deviceId}/toggle-activation:
 *   put:
 *     summary: Toggle device activation status
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Device status toggled }
 * 
 * /api/device-handler/devices/room/{roomId}/orders:
 *   get:
 *     summary: Get available hardware order numbers (1-6) for room devices
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Orders list }
 * 
 * /api/device-handler/devices/{deviceId}/update-order:
 *   put:
 *     summary: Update hardware order number of a device
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order]
 *             properties:
 *               order: { type: integer, example: 1 }
 *     responses:
 *       200: { description: Device order updated }
 */

router.post('/devices/create', protect, checkDeviceLimits, createDevice);
router.put('/devices/:id/update-name', protect, updateDeviceName);
router.put('/devices/:id/update-component-number', protect, updateComponentNumber);
router.get('/devices/room/:roomId', protect, getDevicesByRoom);
router.delete('/devices/delete/:id', protect, deleteDevice);
router.get('/devices/get-users/device/:deviceId', protect, getDeviceUsers);
router.put('/devices/remove-user/device/:deviceId/user/:userId', protect, removeUserFromDevice);
router.put('/devices/exist-device/:deviceId', protect, exitDevice);
router.put('/devices/:deviceId/assign-users', protect, assignUsersToDevice);
router.put('/devices/:deviceId/toggle-activation', protect, toggleActivation);
router.get('/devices/room/:roomId/orders', protect, getAvailableOrders);
router.get('/devices/room/:roomId/orders/:deviceId', protect, getAvailableOrders);
router.put('/devices/:deviceId/update-order', protect, updateDeviceOrder);

module.exports = router;