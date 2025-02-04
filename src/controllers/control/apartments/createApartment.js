const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const mongoose = require('mongoose');
const { Subscription } = require('../../../models/subscriptionSystemModels');
const { apartmentSchema } = require('../../../validation/apartmentValidation');
const { invalidateCache } = require('../../../utils/cacheUtils');
const { rateLimiter } = require('../../../utils/rateLimiter');

exports.createApartment = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { error } = apartmentSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    await rateLimiter(req.user._id, 'createApartment');

    session.startTransaction();

    const userSubscription = await Subscription.findOne({ user: req.user._id }).populate('subscriptionPlan');
    if (!userSubscription) return res.status(400).json({ message: 'User does not have a valid subscription' });

    const subscriptionPlan = userSubscription.subscriptionPlan;

    const apartmentData = {
      ...req.body,
      members: [...new Set([req.body.creator, ...(req.body.members || [])])]
    };

    // Check subscription plan constraints
    const userApartments = await Apartment.find({ creator: req.user._id });
    const userMemberships = await Apartment.find({ members: req.user._id });

    if (
      (subscriptionPlan.name === 'free' && (userApartments.length >= 1 || userMemberships.length > 0)) ||
      (subscriptionPlan.name === 'gold' && (userApartments.length >= 2 || userMemberships.length > 1))
    ) {
      return res.status(403).json({ message: `${subscriptionPlan.name} plan limit reached.` });
    }

    const apartment = await Apartment.create([apartmentData], { session });
    await User.findByIdAndUpdate(req.body.creator, { $push: { apartments: apartment[0]._id } }, { session });

    await session.commitTransaction();
    session.endSession();

    invalidateCache('apartments');
    res.status(201).json(apartment[0]);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Error creating apartment', error: error.message });
  }
};