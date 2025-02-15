const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const mongoose = require('mongoose');
const { Subscription } = require('../../../models/subscriptionSystemModels');

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

    const userSubscription = await Subscription.findOne({ user: req.user._id })
      .populate('subscriptionPlan')
      .session(session);
    if (!userSubscription) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'User does not have a valid subscription' });
    }

    const currentMembersCount = apartment.members.length;
    const maxMembers = userSubscription.subscriptionPlan.name === 'free' ? 1 : 3;
    
    if (currentMembersCount + members.length > maxMembers) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: `${userSubscription.subscriptionPlan.name} plan limit reached.` });
    }

    // Ensure all members exist
    const validMembers = await User.find({ _id: { $in: members } }).select('_id').session(session);
    const validMemberIds = validMembers.map(user => user._id.toString());

    apartment.members = [...new Set([...apartment.members, ...validMemberIds])];
    await apartment.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Members assigned successfully', apartment });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(500).json({ message: 'Error assigning members', error: error.message });
  }
};