const express = require('express');
const router = express.Router();

const { createRoom } = require('../controllers/control/rooms/createRoom');
const { updateRoomName } = require('../controllers/control/rooms/updateRoomName');
const { addUsersToRoom } = require('../controllers/control/rooms/addUsersToRoom');
const { getRoomsByUser } = require('../controllers/control/rooms/getRoomsByUser');
const { getRoomsByApartment } = require('../controllers/control/rooms/getRoomsByApartment');
const { deleteRoom } = require('../controllers/control/rooms/deleteRoom');

// Middleware for authentication (Ensures user is authenticated)
const { protect } = require('../middleware/authMiddleware');

// Routes Definitions

/**
 * @route   POST /api/rooms
 * @desc    Create a new room in an apartment. Only the apartment creator can perform this action.
 * @access  Protected (Requires authentication)
 */
router.post('/rooms/create', protect, createRoom);

/**
 * @route   PUT /api/rooms/:id/update-name
 * @desc    Update the name of a room. Only the room creator can perform this action.
 * @params  { id: string } - The ID of the room to update.
 * @body    { name: string }
 * @access  Protected (Requires authentication)
 */
router.put('/rooms/:id/update-name', protect, updateRoomName);

/**
 * @route   PUT /api/rooms/:id/add-users
 * @desc    Add users to a room. Only the room creator can perform this action.
 * @params  { id: string } - The ID of the room.
 * @body    { userIds: array } - Array of user IDs to add.
 * @access  Protected (Requires authentication)
 */
router.put('/rooms/:id/add-users', protect, addUsersToRoom);

/**
 * @route   GET /api/rooms
 * @desc    Retrieve all rooms the authenticated user is a part of.
 * @access  Protected (Requires authentication)
 */
router.get('/rooms/user/get-all', protect, getRoomsByUser);

/**
 * @route   GET /api/rooms/apartment/:apartmentId
 * @desc    Retrieve all rooms in a specific apartment that the user has access to.
 * @params  { apartmentId: string } - The ID of the apartment.
 * @access  Protected (Requires authentication)
 */
router.get('/rooms/apartment/:apartmentId', protect, getRoomsByApartment);

/**
 * @route   DELETE /api/rooms/:id
 * @desc    Delete a room. Only the room creator can perform this action.
 * @params  { id: string } - The ID of the room to delete.
 * @access  Protected (Requires authentication)
 */
router.delete('/rooms/delete/:id', protect, deleteRoom);

module.exports = router;