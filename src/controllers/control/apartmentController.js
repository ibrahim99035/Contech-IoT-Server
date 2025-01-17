const Apartment = require('../../models/Apartment');
const User = require('../../models/User');
const Room = require('../../models/Room');
const Device = require('../../models/Device');
const mongoose = require('mongoose');
const Joi = require('joi');
const redis = require('redis');
const { Subscription, SubscriptionPlan } = require('../../models/subscriptionSystemModels');

// Initialize Redis client (Assume it's properly configured)
const redisClient = redis.createClient();

// Validation schema for apartment input
const apartmentSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  creator: Joi.string().required(),
  members: Joi.array().items(Joi.string()),
  rooms: Joi.array().items(Joi.string())
});

// Utility: Cache invalidation
const invalidateCache = (key) => redisClient.del(key);

// Utility: Rate limiting (basic implementation)
const rateLimiter = async (userId, action, limit = 10, duration = 60) => {
  const key = `rate:${userId}:${action}`;
  const current = await redisClient.incr(key);
  if (current === 1) await redisClient.expire(key, duration);
  if (current > limit) throw new Error('Too many requests, slow down.');
};

// Create a new apartment (add creator as a member)
exports.createApartment = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { error } = apartmentSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    await rateLimiter(req.user._id, 'createApartment');

    session.startTransaction();

    // Fetch user's subscription plan
    const userSubscription = await Subscription.findOne({ user: req.user._id }).populate('subscriptionPlan');
    if (!userSubscription) {
      return res.status(400).json({ message: 'User does not have a valid subscription' });
    }

    const subscriptionPlan = userSubscription.subscriptionPlan;

    // Add creator as a member
    const apartmentData = {
      ...req.body,
      members: [...new Set([req.body.creator, ...(req.body.members || [])])]
    };

    // Check if the user is on the free plan
    if (subscriptionPlan.name === 'free') {
      // Prevent creating more than 1 apartment or being a member of an apartment
      const userApartments = await Apartment.find({ creator: req.user._id });
      const userMemberships = await Apartment.find({ members: req.user._id });

      // Prevent creating more than one apartment if the user is on the free plan
      if (userApartments.length >= 1 || userMemberships.length > 0) {
        return res.status(403).json({ message: 'Free plan users can only create one apartment and cannot be members of another apartment.' });
      }
    }

    // Check if the user is on the gold plan
    if (subscriptionPlan.name === 'gold') {
      // Prevent creating more than 1 apartment or being a member of an apartment
      const userApartments = await Apartment.find({ creator: req.user._id });
      const userMemberships = await Apartment.find({ members: req.user._id });

      // Prevent creating more than one apartment if the user is on the free plan
      if (userApartments.length >= 2 || userMemberships.length > 1) {
        return res.status(403).json({ message: 'Gold plan users can only create 2 apartments and cannot be members of another apartments.' });
      }
    }

    const apartment = await Apartment.create([apartmentData], { session });
    await User.findByIdAndUpdate(req.body.creator, { $push: { apartments: apartment[0]._id } }, { session });

    await session.commitTransaction();
    session.endSession();

    invalidateCache('apartments'); // Invalidate cache

    res.status(201).json(apartment[0]);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Error creating apartment', error: error.message });
  }
};

// Get apartments by member
exports.getApartmentsByMember = async (req, res) => {
  try {
    const memberId = req.user._id;

    const apartments = await Apartment.find({ members: memberId })
      .populate('creator', 'name email')
      .populate('rooms', 'name')
      .lean();

    res.json(apartments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching apartments by member', error: error.message });
  }
};

// Assign members to an apartment (by creator)
exports.assignMembers = async (req, res) => {
  try {
    const { apartmentId, members } = req.body;

    // Sanitize input
    if (!mongoose.Types.ObjectId.isValid(apartmentId))
      return res.status(400).json({ message: 'Invalid apartment ID' });

    const apartment = await Apartment.findById(apartmentId);
    if (!apartment) return res.status(404).json({ message: 'Apartment not found' });

    // Fetch the user's subscription plan
    const userSubscription = await Subscription.findOne({ user: req.user._id }).populate('subscriptionPlan');
    if (!userSubscription) {
      return res.status(400).json({ message: 'User does not have a valid subscription' });
    }
    const subscriptionPlan = userSubscription.subscriptionPlan;

    // Check if the user is the creator
    if (apartment.creator.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Only the creator can assign members' });

    // Check the subscription plan constraints
    const currentMembersCount = apartment.members.length;

    if (subscriptionPlan.name === 'free') {
      // Free plan: Only 1 additional member (total 2 members including the creator)
      if (currentMembersCount >= 1) {
        return res.status(403).json({ message: 'Free plan users can only have one additional member (total 2 members)' });
      }
    }

    if (subscriptionPlan.name === 'gold') {
      // Gold plan: Only 3 additional members (total 4 members including the creator)
      if (currentMembersCount >= 3) {
        return res.status(403).json({ message: 'Gold plan users can only have three additional members (total 4 members)' });
      }
    }

    // Add members and ensure no duplicates
    apartment.members = [...new Set([...apartment.members, ...members])];
    await apartment.save();

    res.json({ message: 'Members assigned successfully', apartment });
  } catch (error) {
    res.status(500).json({ message: 'Error assigning members', error: error.message });
  }
};

// Update apartment name (only by creator)
exports.updateApartmentName = async (req, res) => {
  try {
    const { apartmentId, name } = req.body;

    // Sanitize input
    if (!mongoose.Types.ObjectId.isValid(apartmentId))
      return res.status(400).json({ message: 'Invalid apartment ID' });

    const apartment = await Apartment.findById(apartmentId);
    if (!apartment) return res.status(404).json({ message: 'Apartment not found' });

    // Check if the user is the creator
    if (apartment.creator.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Only the creator can update the apartment name' });

    // Update name
    apartment.name = name;
    await apartment.save();

    res.json({ message: 'Apartment name updated successfully', apartment });
  } catch (error) {
    res.status(500).json({ message: 'Error updating apartment name', error: error.message });
  }
};

// Delete apartment (only by creator)
exports.deleteApartment = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const apartmentId = req.params.id;

    // Sanitize input
    if (!mongoose.Types.ObjectId.isValid(apartmentId))
      return res.status(400).json({ message: 'Invalid apartment ID' });

    const apartment = await Apartment.findById(apartmentId);
    if (!apartment) throw new Error('Apartment not found');

    // Check if the user is the creator
    if (apartment.creator.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Only the creator can delete the apartment' });

    await Apartment.findByIdAndDelete(apartmentId, { session });

    await User.updateMany(
      { apartments: apartmentId },
      { $pull: { apartments: apartmentId } },
      { session }
    );

    // Handle cascading deletions for related rooms, devices, etc.
    await Room.deleteMany({ apartment: apartmentId }, { session });
    await Device.deleteMany({ apartment: apartmentId }, { session });

    await session.commitTransaction();
    session.endSession();

    invalidateCache('apartments'); // Invalidate cache

    res.json({ message: 'Apartment deleted successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Error deleting apartment', error: error.message });
  }
};