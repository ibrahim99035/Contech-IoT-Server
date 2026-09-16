const express = require('express');
const router = express.Router();

const { createRoom } = require('../controllers/control/rooms/createRoom');
const { updateRoomName } = require('../controllers/control/rooms/updateRoomName');
const { addUsersToRoom } = require('../controllers/control/rooms/addUsersToRoom');
const { getRoomsByUser } = require('../controllers/control/rooms/getRoomsByUser');
const { getRoomsByApartment } = require('../controllers/control/rooms/getRoomsByApartment');
const { deleteRoom } = require('../controllers/control/rooms/deleteRoom');
const { getUsersByRoom } = require('../controllers/control/rooms/getUsersByRoom');
const { removeUsersFromRoom } = require('../controllers/control/rooms/removeUsersFromRoom');
const { exitRoom } = require('../controllers/control/rooms/exitRoom');
const { updateRoomPassword } = require('../controllers/control/rooms/updateRoomPassword'); // Import the new controller

// Middleware for authentication (Ensures user is authenticated)
const { protect } = require('../middleware/authMiddleware');

const { checkRoomLimits } = require('../middleware/checkSubscriptionLimits');

// Routes Definitions

/**
 * @openapi
 * /api/rooms-handler/rooms/create:
 *   post:
 *     summary: Create a new room in an apartment
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, apartment]
 *             properties:
 *               name: { type: string, example: "Living Room" }
 *               apartment: { type: string }
 *     responses:
 *       201: { description: Room created successfully }
 *       403: { description: Subscription limit reached }
 * 
 * /api/rooms-handler/rooms/{id}/update-name:
 *   put:
 *     summary: Update room name
 *     tags: [Rooms]
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
 *       200: { description: Room name updated }
 * 
 * /api/rooms-handler/rooms/{id}/add-users:
 *   put:
 *     summary: Add users to room
 *     tags: [Rooms]
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
 *             required: [userIds]
 *             properties:
 *               userIds: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Users added to room }
 * 
 * /api/rooms-handler/rooms/user/get-all:
 *   get:
 *     summary: Get all rooms accessible to the authenticated user
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of rooms }
 * 
 * /api/rooms-handler/rooms/apartment/{apartmentId}:
 *   get:
 *     summary: Get all rooms in a specific apartment
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: apartmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Rooms in apartment }
 * 
 * /api/rooms-handler/rooms/delete/{id}:
 *   delete:
 *     summary: Delete a room by ID
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Room deleted }
 * 
 * /api/rooms-handler/rooms/get-users/{roomId}:
 *   get:
 *     summary: Get all users in a room
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Room users list }
 * 
 * /api/rooms-handler/rooms/remove-user/{roomId}:
 *   put:
 *     summary: Remove users from room
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User removed from room }
 * 
 * /api/rooms-handler/rooms/exit-room/{roomId}:
 *   put:
 *     summary: Exit a room
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Exited room }
 * 
 * /api/rooms-handler/rooms/{roomId}/update-password:
 *   put:
 *     summary: Update room password for hardware authentication
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword]
 *             properties:
 *               newPassword: { type: string }
 *     responses:
 *       200: { description: Room password updated }
 */

router.post('/rooms/create', protect, checkRoomLimits, createRoom);
router.put('/rooms/:id/update-name', protect, updateRoomName);
router.put('/rooms/:id/add-users', protect, addUsersToRoom);
router.get('/rooms/user/get-all', protect, getRoomsByUser);
router.get('/rooms/apartment/:apartmentId', protect, getRoomsByApartment);
router.delete('/rooms/delete/:id', protect, deleteRoom);
router.get('/rooms/get-users/:roomId', protect, getUsersByRoom);
router.put('/rooms/remove-user/:roomId', protect, removeUsersFromRoom);
router.put('/rooms/exit-room/:roomId', protect, exitRoom);
router.put('/rooms/:roomId/update-password', protect, updateRoomPassword);

module.exports = router;