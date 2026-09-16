const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const mongoose = require('mongoose');
const SubscriptionLimiter = require('../../../utils/subscriptionLimiter');
const logger = require('../../../config/logger');

exports.assignMembers = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { apartmentId, members } = req.body;
    if (!mongoose.Types.ObjectId.isValid(apartmentId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid apartment ID' });
    }

    const apartment = await Apartment.findById(apartmentId).session(session);
    if (!apartment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Apartment not found' });
    }

    if (apartment.creator.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: 'Only the creator can assign members' });
    }

    // Enforce the membership limit from the user's subscription plan
    const result = await SubscriptionLimiter.canAssignMember(req.user._id, apartmentId, members.length);
    if (!result.canAssign) {
      await session.abortTransaction();
      session.endSession();
      logger.warn('Member limit reached on assignment', { apartmentId, ...result });
      return res.status(403).json({ message: result.message });
    }

    // Ensure all members exist
    const validMembers = await User.find({ _id: { $in: members } }).select('_id').session(session);
    const validMemberIds = validMembers.map(user => user._id.toString());

    apartment.members = [...new Set([...apartment.members, ...validMemberIds])];
    await apartment.save({ session });

    await session.commitTransaction();
    session.endSession();

    logger.info('Members assigned to apartment', { apartmentId, count: validMemberIds.length });
    res.json({ message: 'Members assigned successfully', apartment });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    logger.error('Error assigning members', { error: error.message });
    res.status(500).json({ message: 'Error assigning members', error: error.message });
  }
};