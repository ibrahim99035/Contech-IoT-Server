const Apartment = require('../../../models/Apartment');
const mongoose = require('mongoose');
const { Subscription } = require('../../../models/subscriptionSystemModels');

exports.assignMembers = async (req, res) => {
  try {
    const { apartmentId, members } = req.body;
    if (!mongoose.Types.ObjectId.isValid(apartmentId)) return res.status(400).json({ message: 'Invalid apartment ID' });

    const apartment = await Apartment.findById(apartmentId);
    if (!apartment) return res.status(404).json({ message: 'Apartment not found' });

    if (apartment.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can assign members' });
    }

    const userSubscription = await Subscription.findOne({ user: req.user._id }).populate('subscriptionPlan');
    if (!userSubscription) return res.status(400).json({ message: 'User does not have a valid subscription' });

    const currentMembersCount = apartment.members.length;
    if (
      (userSubscription.subscriptionPlan.name === 'free' && currentMembersCount >= 1) ||
      (userSubscription.subscriptionPlan.name === 'gold' && currentMembersCount >= 3)
    ) {
      return res.status(403).json({ message: `${userSubscription.subscriptionPlan.name} plan limit reached.` });
    }

    apartment.members = [...new Set([...apartment.members, ...members])];
    await apartment.save();
    res.json({ message: 'Members assigned successfully', apartment });
  } catch (error) {
    res.status(500).json({ message: 'Error assigning members', error: error.message });
  }
};