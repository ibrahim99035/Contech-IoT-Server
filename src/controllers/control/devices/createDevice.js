const Device = require('../../../models/Device');
const Room = require('../../../models/Room');
const { Subscription } = require('../../../models/subscriptionSystemModels');
const { deviceSchema } = require('../../../validation/deviceValidation');
const { invalidateCache } = require('../../../utils/cacheUtils');

exports.createDevice = async (req, res) => {
  try {
    const { error } = deviceSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const room = await Room.findById(req.body.room);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the room creator can create devices.' });
    }

    const userSubscription = await Subscription.findOne({ user: req.user._id }).populate('subscriptionPlan');
    if (!userSubscription) return res.status(400).json({ message: 'User does not have a valid subscription' });

    const subscriptionPlan = userSubscription.subscriptionPlan;
    const deviceLimit = subscriptionPlan.name.toLowerCase() === 'free' ? 2 : subscriptionPlan.name.toLowerCase() === 'gold' ? 4 : 6;

    if (room.devices.length >= deviceLimit) {
      return res.status(403).json({ message: `Your plan (${subscriptionPlan.name}) allows only ${deviceLimit} devices per room.` });
    }

    const device = await Device.create({ ...req.body, creator: req.user._id });
    await Room.findByIdAndUpdate(req.body.room, { $push: { devices: device._id } });

    invalidateCache(`devices:${req.body.room}`);
    res.status(201).json(device);
  } catch (error) {
    res.status(500).json({ message: 'Error creating device', error: error.message });
  }
};