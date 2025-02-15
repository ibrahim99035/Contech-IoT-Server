const Device = require('../../../models/Device');
const Room = require('../../../models/Room');
const { Subscription } = require('../../../models/subscriptionSystemModels');
const { deviceSchema } = require('../../../validation/deviceValidation');

exports.createDevice = async (req, res) => {
  const session = await Device.startSession();
  session.startTransaction();
  
  try {
    const { error } = deviceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Unauthorized access' });
    }

    const room = await Room.findById(req.body.room).populate('devices').session(session);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the room creator can create devices.' });
    }

    const userSubscription = await Subscription.findOne({ user: req.user._id }).populate('subscriptionPlan').session(session);
    if (!userSubscription || !userSubscription.subscriptionPlan) {
      return res.status(400).json({ message: 'User does not have a valid subscription' });
    }

    const subscriptionPlanName = userSubscription.subscriptionPlan.name.toLowerCase();
    const deviceLimit = subscriptionPlanName === 'free' ? 2 : subscriptionPlanName === 'gold' ? 4 : 6;

    if (room.devices.length >= deviceLimit) {
      return res.status(403).json({ message: `Your plan (${userSubscription.subscriptionPlan.name}) allows only ${deviceLimit} devices per room.` });
    }

    const device = new Device({ ...req.body, creator: req.user._id });
    await device.save({ session });

    await Room.findByIdAndUpdate(req.body.room, { $push: { devices: device._id } }, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(device);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Error creating device', error: error.message });
  }
};