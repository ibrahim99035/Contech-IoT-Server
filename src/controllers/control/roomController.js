const Room = require('../../models/Room');
const Apartment = require('../../models/Apartment');
const User = require('../../models/User');
const Device = require('../../models/Device');
const mongoose = require('mongoose');
const Joi = require('joi');
const redis = require('redis');

const { Subscription, SubscriptionPlan } = require('../../models/subscriptionSystemModels');

// Initialize Redis client (Assume it's properly configured)
const redisClient = redis.createClient();

// Validation schema for room input
const roomSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  apartment: Joi.string().required(),
  devices: Joi.array().items(Joi.string()),
  users: Joi.array().items(Joi.string())
});

// Utility: Invalidate cache
const invalidateCache = (key) => redisClient.del(key);

// Create a new room (creator must be creator of the apartment)
exports.createRoom = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { error } = roomSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    session.startTransaction();

    const apartment = await Apartment.findById(req.body.apartment);
    if (!apartment) throw new Error('Apartment not found');

    // Ensure the creator is the creator of the apartment
    if (apartment.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator of the apartment can create rooms' });
    }

    // Fetch the user's subscription plan
    const userSubscription = await Subscription.findOne({ user: req.user._id }).populate('subscriptionPlan');
    if (!userSubscription) {
      return res.status(400).json({ message: 'User does not have a valid subscription' });
    }

    const subscriptionPlan = userSubscription.subscriptionPlan;

    // Check the room limits based on the subscription plan
    const currentRoomCount = apartment.rooms.length;

    if (subscriptionPlan.name === 'free') {
      // Free plan: Max 3 rooms per apartment
      if (currentRoomCount >= 3) {
        return res.status(403).json({ message: 'Free plan users can only create up to 3 rooms per apartment' });
      }
    }

    if (subscriptionPlan.name === 'gold') {
      // Gold plan: Max 8 rooms per apartment
      if (currentRoomCount >= 8) {
        return res.status(403).json({ message: 'Gold plan users can only create up to 8 rooms per apartment' });
      }
    }

    const roomData = { ...req.body, creator: req.user._id, users: [req.user._id] };
    const room = await Room.create([roomData], { session });

    await Apartment.findByIdAndUpdate(req.body.apartment, { $push: { rooms: room[0]._id } }, { session });

    await session.commitTransaction();
    session.endSession();

    invalidateCache(`rooms:${req.body.apartment}`); // Invalidate cache for the apartment's rooms

    res.status(201).json(room[0]);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Error creating room', error: error.message });
  }
};

// Update room name (only creator can update)
exports.updateRoomName = async (req, res) => {
  try {
    const roomId = req.params.id;
    const { name } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(roomId))
      return res.status(400).json({ message: 'Invalid room ID' });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    // Ensure the user is the creator of the room
    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can update the room name' });
    }

    room.name = name;
    await room.save();

    invalidateCache(`rooms:${room.apartment}`); // Invalidate cache

    res.json({ message: 'Room name updated successfully', room });
  } catch (error) {
    res.status(500).json({ message: 'Error updating room name', error: error.message });
  }
};

// Add users to the room (only creator can add users)
exports.addUsersToRoom = async (req, res) => {
  try {
    const roomId = req.params.id;
    const { userIds } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(roomId))
      return res.status(400).json({ message: 'Invalid room ID' });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    // Ensure the user is the creator of the room
    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can add users' });
    }

    room.users.push(...userIds);
    await room.save();

    res.json({ message: 'Users added to room successfully', room });
  } catch (error) {
    res.status(500).json({ message: 'Error adding users to room', error: error.message });
  }
};

// Get rooms by user (based on the user making the request)
exports.getRoomsByUser = async (req, res) => {
  try {
    const rooms = await Room.find({ users: req.user._id })
      .populate('apartment', 'name')
      .populate('devices', 'name type status')
      .lean();

    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching rooms', error: error.message });
  }
};

// Get rooms by apartment (only members of the apartment and users of the rooms)
exports.getRoomsByApartment = async (req, res) => {
    const { apartmentId } = req.params;
  
    try {
      // Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(apartmentId)) {
        return res.status(400).json({ message: 'Invalid apartment ID' });
      }
  
      // Fetch the apartment and its members
      const apartment = await Apartment.findById(apartmentId).populate('members', '_id');
      if (!apartment) {
        return res.status(404).json({ message: 'Apartment not found' });
      }
  
      // Check if the requesting user is a member of the apartment
      if (!apartment.members.some(member => member._id.toString() === req.user._id.toString())) {
        return res.status(403).json({ message: 'Access denied. You are not a member of this apartment.' });
      }
  
      // Fetch rooms associated with the apartment
      const rooms = await Room.find({ apartment: apartmentId })
        .populate('devices', 'name type status') // Populate devices in the room
        .populate('users', '_id name email') // Populate users in the room
        .lean();
  
      // Filter rooms where the requesting user is a user
      const filteredRooms = rooms.filter(room =>
        room.users.some(user => user._id.toString() === req.user._id.toString())
      );
  
      // Check if there are any rooms to return
      if (filteredRooms.length === 0) {
        return res.status(404).json({
          message: 'No rooms found. You are not a user in any room of this apartment.',
        });
      }
  
      res.json(filteredRooms);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching rooms by apartment', error: error.message });
    }
};  

// Delete a room (only creator can delete)
exports.deleteRoom = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const roomId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(roomId))
      return res.status(400).json({ message: 'Invalid room ID' });

    const room = await Room.findById(roomId);
    if (!room) throw new Error('Room not found');

    // Ensure the user is the creator of the room
    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can delete the room' });
    }

    // Remove the room reference from the apartment
    await Apartment.findByIdAndUpdate(room.apartment, { $pull: { rooms: roomId } }, { session });

    // Delete related devices
    await Device.deleteMany({ room: roomId }, { session });

    await Room.findByIdAndDelete(roomId, { session });

    await session.commitTransaction();
    session.endSession();

    invalidateCache(`rooms:${room.apartment}`); // Invalidate cache for rooms of the apartment

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Error deleting room', error: error.message });
  }
};