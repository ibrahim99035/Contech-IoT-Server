const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const mongoose = require('mongoose');
const { Subscription } = require('../../../models/subscriptionSystemModels');
const { invalidateCache } = require('../../../utils/cacheUtils');
const { roomSchema } = require('../../../validation/roomValidation');


// Create a new room (creator must be creator of the apartment)
exports.createRoom = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { error } = roomSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    session.startTransaction();

    const apartment = await Apartment.findById(req.body.apartment);
    if (!apartment) throw new Error('Apartment not found');

    if (apartment.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator of the apartment can create rooms' });
    }

    const userSubscription = await Subscription.findOne({ user: req.user._id }).populate('subscriptionPlan');
    if (!userSubscription) {
      return res.status(400).json({ message: 'User does not have a valid subscription' });
    }

    const subscriptionPlan = userSubscription.subscriptionPlan;
    const currentRoomCount = apartment.rooms.length;
    const roomLimits = { free: 3, gold: 8 };
    const maxRooms = roomLimits[subscriptionPlan.name.toLowerCase()] || 10;

    if (currentRoomCount >= maxRooms) {
      return res.status(403).json({ message: `Your plan allows only ${maxRooms} rooms per apartment.` });
    }

    const roomData = { ...req.body, creator: req.user._id, users: [req.user._id] };
    const room = await Room.create([roomData], { session });

    await Apartment.findByIdAndUpdate(req.body.apartment, { $push: { rooms: room[0]._id } }, { session });

    await session.commitTransaction();
    session.endSession();

    invalidateCache(`rooms:${req.body.apartment}`);

    res.status(201).json(room[0]);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Error creating room', error: error.message });
  }
};