/**
 * Room Controller - Update Room Password
 *
 * This controller handles updating the password for a specific room.
 * Only the creator of the room can perform this action.
 *
 * @module controllers/room/updateRoomPassword
 */

const Room = require('../../../models/Room');
const mongoose = require('mongoose');
const Joi = require('joi');

// Validation schema for updating room password
const updatePasswordSchema = Joi.object({
  newPassword: Joi.string().min(6).max(30).required()
    .messages({
      'string.base': `"newPassword" should be a type of 'text'`,
      'string.empty': `"newPassword" cannot be an empty field`,
      'string.min': `"newPassword" should have a minimum length of {#limit}`,
      'string.max': `"newPassword" should have a maximum length of {#limit}`,
      'any.required': `"newPassword" is a required field`
    }),
});

/**
 * Update the password for a specific room
 *
 * @param {Object} req - Express request object
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.roomId - ID of the room to update
 * @param {Object} req.body - Request body
 * @param {string} req.body.newPassword - The new password for the room
 * @param {Object} req.user - Authenticated user object
 * @param {string} req.user._id - ID of the authenticated user
 * @param {Object} res - Express response object
 * @returns {Object} Success message or error message
 */
exports.updateRoomPassword = async (req, res) => {
  try {
    const { roomId } = req.params;

    // Validate roomId format
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID format' });
    }

    // Validate request body
    const { error, value } = updatePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const { newPassword } = value;

    // Find the room
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    // Check if the authenticated user is the creator of the room
    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Permission denied: Only the room creator can update the password.' });
    }

    // Update the room password (the pre-save hook in Room.js will hash it)
    room.roomPassword = newPassword;
    await room.save();

    return res.status(200).json({
      success: true,
      message: 'Room password updated successfully.'
    });

  } catch (err) {
    console.error('Error updating room password:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the room password.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};