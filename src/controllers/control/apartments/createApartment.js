const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const mongoose = require('mongoose');
const { Subscription } = require('../../../models/subscriptionSystemModels');
const { apartmentSchema } = require('../../../validation/apartmentValidation');
// const { invalidateCache } = require('../../../utils/cacheUtils'); // Redis cache invalidation disabled
// const { rateLimiter } = require('../../../utils/rateLimiter'); // Redis rate limiting disabled

exports.createApartment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    // Start the session transaction
    session.startTransaction();

    // Validate the incoming request data using the schema
    const { error } = apartmentSchema.validate(req.body);
    if (error) {
      await session.abortTransaction(); // Abort if validation fails
      session.endSession();
      return res.status(400).json({ message: error.details[0].message });
    }

    // Apply rate limiting (Redis is disabled, so skipped)
    // await rateLimiter(req.user._id, 'createApartment'); // Skipped rate limiting

    // Fetch the user's subscription
    const userSubscription = await Subscription.findOne({ user: req.user._id })
      .populate('subscriptionPlan')
      .session(session); // Use session for the query
    if (!userSubscription) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'User does not have a valid subscription' });
    }

    const subscriptionPlan = userSubscription.subscriptionPlan;

    const apartmentData = {
      ...req.body,
      members: [...new Set([req.body.creator, ...(req.body.members || [])])], // Ensure unique members
    };

    // Fetch the user's existing apartments and memberships to enforce limits
    const userApartments = await Apartment.find({ creator: req.user._id }).session(session);
    const userMemberships = await Apartment.find({ members: req.user._id }).session(session);

    if (
      (subscriptionPlan.name === 'free' && (userApartments.length >= 1 || userMemberships.length > 0)) ||
      (subscriptionPlan.name === 'gold' && (userApartments.length >= 2 || userMemberships.length > 1))
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: `${subscriptionPlan.name} plan limit reached.` });
    }

    // Create the apartment document in the database within the transaction
    const apartment = await Apartment.create([apartmentData], { session });

    // Update the user's apartment list (also in the transaction)
    await User.findByIdAndUpdate(req.body.creator, { $push: { apartments: apartment[0]._id } }, { session });

    // Commit the transaction to persist changes
    await session.commitTransaction();
    session.endSession();

    // Invalidate cache after committing (Redis is disabled, so skipped)
    // invalidateCache('apartments'); // Skipped cache invalidation

    return res.status(201).json(apartment[0]);
  } catch (error) {
    // If something goes wrong, ensure to abort the transaction and cleanup
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    return res.status(500).json({ message: 'Error creating apartment', error: error.message });
  }
};