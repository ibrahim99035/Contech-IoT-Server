const Apartment = require('../../../models/Apartment');
const Room = require('../../../models/Room');
const Device = require('../../../models/Device');
const mongoose = require('mongoose');

/**
 * Controller for members to exit an apartment themselves
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.exitApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;
    const userId = req.user._id;
    
    // Validate apartment ID
    if (!mongoose.Types.ObjectId.isValid(apartmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid apartment ID format',
        data: null
      });
    }
    
    // Find the apartment
    const apartment = await Apartment.findById(apartmentId);
    
    // Check if apartment exists
    if (!apartment) {
      return res.status(404).json({
        success: false,
        message: 'Apartment not found',
        data: null
      });
    }
    
    // Check if user is the creator (creators can't exit their own apartments)
    if (apartment.creator.equals(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Apartment creator cannot exit their own apartment. Consider deleting the apartment instead.',
        data: null
      });
    }
    
    // Check if the user is a member of the apartment
    if (!apartment.members.some(member => member.equals(userId))) {
      return res.status(400).json({
        success: false,
        message: 'You are not a member of this apartment',
        data: null
      });
    }
    
    // Remove the user from the apartment members
    apartment.members = apartment.members.filter(member => !member.equals(userId));
    
    // Get all rooms in this apartment
    const rooms = await Room.find({ apartment: apartmentId });
    
    // Remove the user from all rooms in this apartment
    for (const room of rooms) {
      room.users = room.users.filter(user => !user.equals(userId));
      await room.save();
      
      // Get all devices in this room and remove the member from them
      const devices = await Device.find({ room: room._id });
      for (const device of devices) {
        device.users = device.users.filter(user => !user.equals(userId));
        await device.save();
      }
    }
    
    // Save the updated apartment
    await apartment.save();
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: 'You have successfully left the apartment and been removed from all associated rooms and devices',
      data: {
        apartmentId: apartment._id,
        apartmentName: apartment.name,
        remainingMembers: apartment.members.length
      }
    });
    
  } catch (error) {
    console.error('Error exiting apartment:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while exiting apartment',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};