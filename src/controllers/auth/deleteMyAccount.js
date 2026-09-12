<<<<<<< Updated upstream
/**
 * User Deletion Controller - handles deletion of user accounts
 * @module controllers/UserDeletionController
 */
=======
const logger = require('../../config/logger');
>>>>>>> Stashed changes

const User = require('../../models/User');
const Device = require('../../models/Device');
const Task = require('../../models/Task');
const Apartment = require('../../models/Apartment');
const Room = require('../../models/Room');
const mongoose = require('mongoose');
const { runInTxn } = require('../../utils/transaction')(mongoose);

exports.deleteMyAccount = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHORIZED' });
    }

    const userId = req.user._id;

    await runInTxn(async (session) => {
      const opts = session ? { session } : {};

      const user = await User.findById(userId);
      if (!user) {
        throw { status: 404, code: 'USER_NOT_FOUND', message: 'User not found' };
      }

      await Device.updateMany({ users: userId }, { $pull: { users: userId } }, opts);

      const userCreatedDevices = await Device.find({ creator: userId }).lean();
      for (const device of userCreatedDevices) {
        if (device.users && device.users.length > 0) {
          const newOwnerId = device.users.find(id => !id.equals(userId));
          if (newOwnerId) {
            await Device.findByIdAndUpdate(device._id, { creator: newOwnerId }, opts);
          } else {
            await Device.findByIdAndDelete(device._id, opts);
          }
        } else {
          await Device.findByIdAndDelete(device._id, opts);
        }
      }

      await Task.updateMany({ assignedTo: userId }, { $pull: { assignedTo: userId } }, opts);
      await Task.updateMany({ creator: userId }, { $set: { creator: null, createdBy: 'Deleted User' } }, opts);

      if (user.apartments && user.apartments.length > 0) {
        for (const apartmentId of user.apartments) {
          const apartment = await Apartment.findById(apartmentId, null, opts);
          if (!apartment) continue;

          if (apartment.owner && apartment.owner.toString() === userId.toString()) {
            const occupants = await User.find({ apartments: apartmentId, _id: { $ne: userId } }).lean();
            if (occupants.length > 0) {
              await Apartment.findByIdAndUpdate(apartmentId, { owner: occupants[0]._id }, opts);
            } else {
              await Room.deleteMany({ apartment: apartmentId }, opts);
              await Apartment.findByIdAndDelete(apartmentId, opts);
            }
          } else {
            if (apartment.users && Array.isArray(apartment.users)) {
              apartment.users = apartment.users.filter(id => !id.equals(userId));
              await Apartment.findByIdAndUpdate(apartmentId, { $set: { users: apartment.users } }, opts);
            }
          }
        }
      }

<<<<<<< Updated upstream
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
=======
      await User.findByIdAndDelete(userId, opts);
    }).then(
      () => res.status(200).json({ success: true, message: 'Your account has been successfully deleted' }),
      (err) => {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message, code: err.code });
        logger.error('Error deleting user account:', err);
        return res.status(500).json({ success: false, message: 'Error deleting user account', error: err.message, code: 'SERVER_ERROR' });
      }
    );
  } catch (err) {
    logger.error('Error deleting user account:', err);
    return res.status(500).json({ success: false, message: 'Error deleting user account', error: err.message, code: 'SERVER_ERROR' });
>>>>>>> Stashed changes
  }
};
