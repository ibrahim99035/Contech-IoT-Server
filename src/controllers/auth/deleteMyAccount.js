/**
 * User Deletion Controller - handles deletion of user accounts
 * @module controllers/UserDeletionController
 */

const User = require('../../models/User');
const Device = require('../../models/Device');
const Task = require('../../models/Task');
const Apartment = require('../../models/Apartment');
const Room = require('../../models/Room');
const mongoose = require('mongoose');

/**
 * Delete user account and cleanup related data
 * 
 * @async
 * @function deleteMyAccount
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user information
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success message or error
 */
exports.deleteMyAccount = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check authentication
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    const userId = req.user._id;
    
    // Find the user to ensure they exist
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Clean up device references
    // 1. Remove user from the users array in devices
    await Device.updateMany(
      { users: userId },
      { $pull: { users: userId } },
      { session }
    );

    // 2. Handle devices created by this user
    // Get all devices created by the user
    const userCreatedDevices = await Device.find({ creator: userId });
    
    // For each device:
    for (const device of userCreatedDevices) {
      // If there are other users assigned to this device, transfer ownership to the first user
      if (device.users && device.users.length > 0) {
        // Find first user who is not the creator
        const newOwnerId = device.users.find(id => !id.equals(userId));
        if (newOwnerId) {
          device.creator = newOwnerId;
          await device.save({ session });
        } else {
          // If no other users, delete the device
          await Device.findByIdAndDelete(device._id, { session });
        }
      } else {
        // No other users, delete the device
        await Device.findByIdAndDelete(device._id, { session });
      }
    }

    // Clean up tasks
    // 1. Remove user from assigned tasks
    await Task.updateMany(
      { assignedTo: userId },
      { $pull: { assignedTo: userId } },
      { session }
    );
    
    // 2. Handle tasks created by this user - mark them as 'system' created or delete
    await Task.updateMany(
      { creator: userId },
      { $set: { creator: null, createdBy: 'Deleted User' } },
      { session }
    );

    // Clean up apartments
    // For apartments the user has access to
    if (user.apartments && user.apartments.length > 0) {
      for (const apartmentId of user.apartments) {
        const apartment = await Apartment.findById(apartmentId);
        
        if (apartment) {
          // If user is the owner of the apartment
          if (apartment.owner && apartment.owner.toString() === userId.toString()) {
            // Check if there are other users with access
            const occupants = await User.find({ apartments: apartmentId, _id: { $ne: userId } });
            
            if (occupants.length > 0) {
              // Transfer ownership to the first occupant
              apartment.owner = occupants[0]._id;
              await apartment.save({ session });
            } else {
              // Delete the apartment and associated rooms if no other users
              await Room.deleteMany({ apartment: apartmentId }, { session });
              await Apartment.findByIdAndDelete(apartmentId, { session });
            }
          } else {
            // User is not the owner, just remove the reference
            // Check if apartment.users exists before using filter
            if (apartment.users && Array.isArray(apartment.users)) {
              apartment.users = apartment.users.filter(id => !id.equals(userId));
              await apartment.save({ session });
            }
          }
        }
      }
    }

    // Finally, delete the user account
    await User.findByIdAndDelete(userId, { session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Your account has been successfully deleted'
    });
  } catch (error) {
    // Abort transaction in case of error
    await session.abortTransaction();
    session.endSession();

    console.error('Error deleting user account:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user account',
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
};