const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const mongoose = require('mongoose');
<<<<<<< Updated upstream
const { Subscription } = require('../../../models/subscriptionSystemModels');
=======
const SubscriptionLimiter = require('../../../utils/subscriptionLimiter');
const logger = require('../../../config/logger');
const { runInTxn } = require('../../../utils/transaction')(mongoose);
>>>>>>> Stashed changes

exports.assignMembers = async (req, res) => {
  try {
    const { apartmentId, members } = req.body;
    if (!mongoose.Types.ObjectId.isValid(apartmentId)) {
      return res.status(400).json({ message: 'Invalid apartment ID' });
    }

    await runInTxn(async (session) => {
      const opts = session ? { session } : {};

      const apartment = await Apartment.findById(apartmentId, null, opts);
      if (!apartment) {
        throw { status: 404, message: 'Apartment not found' };
      }

<<<<<<< Updated upstream
    const userSubscription = await Subscription.findOne({ user: req.user._id })
      .populate('subscriptionPlan')
      .session(session);
    if (!userSubscription) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'User does not have a valid subscription' });
    }

    const currentMembersCount = apartment.members.length;
    const maxMembers = userSubscription.subscriptionPlan.name === 'free' ? 3 : 6;
    
    if (currentMembersCount + members.length > maxMembers) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: `${userSubscription.subscriptionPlan.name} plan limit reached.` });
    }
=======
      if (apartment.creator.toString() !== req.user._id.toString()) {
        throw { status: 403, message: 'Only the creator can assign members' };
      }
>>>>>>> Stashed changes

      const result = await SubscriptionLimiter.canAssignMember(req.user._id, apartmentId, members.length);
      if (!result.canAssign) {
        logger.warn('Member limit reached on assignment', { apartmentId, ...result });
        throw { status: 403, message: result.message };
      }

      const validMembers = await User.find({ _id: { $in: members } }).select('_id').lean();
      const validMemberIds = validMembers.map(user => user._id.toString());

<<<<<<< Updated upstream
    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Members assigned successfully', apartment });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(500).json({ message: 'Error assigning members', error: error.message });
=======
      apartment.members = [...new Set([...apartment.members, ...validMemberIds])];
      await apartment.save(opts);
    }).then(
      () => {
        logger.info('Members assigned to apartment');
        return res.json({ message: 'Members assigned successfully' });
      },
      (err) => {
        if (err.status) return res.status(err.status).json({ message: err.message });
        logger.error('Error assigning members', { error: err.message });
        return res.status(500).json({ message: 'Error assigning members', error: err.message });
      }
    );
  } catch (err) {
    // top-level unexpected errors
    logger.error('Error assigning members', { error: err.message });
    return res.status(500).json({ message: 'Error assigning members', error: err.message });
>>>>>>> Stashed changes
  }
};
