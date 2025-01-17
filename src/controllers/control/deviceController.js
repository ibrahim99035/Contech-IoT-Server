const Device = require('../../models/Device');
const Room = require('../../models/Room');
const mongoose = require('mongoose');
const Joi = require('joi');
const redis = require('redis');
const crypto = require('crypto');

const { Subscription, SubscriptionPlan } = require('../../models/subscriptionSystemModels');

// Initialize Redis client (Assume it's properly configured)
const redisClient = redis.createClient();

// Validation schema for device input
const deviceSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  type: Joi.string().valid('Light', 'Thermostat', 'Camera', 'Lock').required(),
  status: Joi.string().valid('on', 'off').default('off'),
  room: Joi.string().required(),
  users: Joi.array().items(Joi.string())
});

// Utility: Invalidate cache
const invalidateCache = (key) => redisClient.del(key);

// Create a new device (Only room creator)
exports.createDevice = async (req, res) => {
  try {
    const { error } = deviceSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const room = await Room.findById(req.body.room);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied. Only the room creator can create devices.' });
    }

    // Fetch the user's subscription plan
    const userSubscription = await Subscription.findOne({ user: req.user._id }).populate('subscriptionPlan');
    if (!userSubscription) {
      return res.status(400).json({ message: 'User does not have a valid subscription' });
    }

    const subscriptionPlan = userSubscription.subscriptionPlan;
    const currentDeviceCount = room.devices.length;

    // Define limits based on subscription plans
    let deviceLimit;
    switch (subscriptionPlan.name.toLowerCase()) {
      case 'free':
        deviceLimit = 2;
        break;
      case 'gold':
        deviceLimit = 4;
        break;
      default:
        deviceLimit = 6; // Default limit for other plans
        break;
    }

    // Check if the device limit has been exceeded
    if (currentDeviceCount >= deviceLimit) {
      return res.status(403).json({
        message: `Your plan (${subscriptionPlan.name}) allows only ${deviceLimit} devices per room.`,
      });
    }

    const device = await Device.create({ ...req.body, creator: req.user._id });
    await Room.findByIdAndUpdate(req.body.room, { $push: { devices: device._id } });

    invalidateCache(`devices:${req.body.room}`);
    res.status(201).json(device);
  } catch (error) {
    res.status(500).json({ message: 'Error creating device', error: error.message });
  }
};

// Update device name (Only device creator)
exports.updateDeviceName = async (req, res) => {
  try {
    const { name } = req.body;
    const deviceId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      return res.status(400).json({ message: 'Invalid device ID' });
    }

    const device = await Device.findById(deviceId);
    if (!device) return res.status(404).json({ message: 'Device not found' });

    if (device.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied. Only the creator can update the name.' });
    }

    device.name = name;
    await device.save();

    invalidateCache(`devices:${device.room}`);
    res.json(device);
  } catch (error) {
    res.status(500).json({ message: 'Error updating device name', error: error.message });
  }
};

// Update component number (Only device creator)
exports.updateComponentNumber = async (req, res) => {
  try {
    const { componentNumber } = req.body;
    const deviceId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      return res.status(400).json({ message: 'Invalid device ID' });
    }

    const device = await Device.findById(deviceId);
    if (!device) return res.status(404).json({ message: 'Device not found' });

    if (device.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied. Only the creator can update the component number.' });
    }

    const hash = crypto.createHash('sha256');
    device.componentNumber = hash.update(componentNumber).digest('hex');
    await device.save();

    res.json({ message: 'Component number updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating component number', error: error.message });
  }
};

// Get devices by room (Users in the room)
exports.getDevicesByRoom = async (req, res) => {
  const { roomId } = req.query;
  const cacheKey = `devices:${roomId}`;
  try {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid room ID' });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (!room.users.includes(req.user._id.toString()) && room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    // Check cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) return res.json(JSON.parse(cachedData));

    const devices = await Device.find({ room: roomId })
      .populate('users', 'name email')
      .lean();

    await redisClient.set(cacheKey, JSON.stringify(devices), 'EX', 300);
    res.json(devices);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching devices', error: error.message });
  }
};

// Delete a device (Only device creator)
exports.deleteDevice = async (req, res) => {
  try {
    const deviceId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(deviceId)) {
      return res.status(400).json({ message: 'Invalid device ID' });
    }

    const device = await Device.findById(deviceId);
    if (!device) return res.status(404).json({ message: 'Device not found' });

    if (device.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied. Only the creator can delete the device.' });
    }

    await Room.findByIdAndUpdate(device.room, { $pull: { devices: deviceId } });
    await device.remove();

    invalidateCache(`devices:${device.room}`);
    res.json({ message: 'Device deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting device', error: error.message });
  }
};