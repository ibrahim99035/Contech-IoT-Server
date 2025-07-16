const { Subscription } = require('../models/subscriptionSystemModels');
const SubscriptionLimits = require('../models/SubscriptionLimits');
const Apartment = require('../models/Apartment');
const Room = require('../models/Room');
const Device = require('../models/Device');
const Task = require('../models/Task');

class SubscriptionLimiter {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get subscription limits for a user
   */
  async getUserLimits(userId) {
    try {
      // Find user's active subscription
      const userSubscription = await Subscription.findOne({ 
        user: userId, 
        status: 'active' 
      }).populate('subscriptionPlan');

      if (!userSubscription) {
        throw new Error('No active subscription found');
      }

      const planName = userSubscription.subscriptionPlan.name.toLowerCase();
      return await this.getPlanLimits(planName);
    } catch (error) {
      // Return free plan limits as fallback
      return await this.getPlanLimits('free');
    }
  }

  /**
   * Get limits for a specific plan
   */
  async getPlanLimits(planName) {
    const cacheKey = `limits_${planName}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.limits;
    }

    const limits = await SubscriptionLimits.findOne({ 
      planName: planName.toLowerCase(),
      isActive: true 
    });

    if (!limits) {
      throw new Error(`No limits found for plan: ${planName}`);
    }

    this.cache.set(cacheKey, {
      limits: limits.limits,
      timestamp: Date.now()
    });

    return limits.limits;
  }

  /**
   * Check if user can create an apartment
   */
  async canCreateApartment(userId) {
    const limits = await this.getUserLimits(userId);
    
    // Count owned apartments
    const ownedApartments = await Apartment.countDocuments({ creator: userId });
    
    // Count memberships
    const memberships = await Apartment.countDocuments({ 
      members: userId, 
      creator: { $ne: userId } 
    });

    return {
      canCreate: ownedApartments < limits.apartments.owned,
      current: {
        owned: ownedApartments,
        memberships: memberships
      },
      limits: limits.apartments,
      message: ownedApartments < limits.apartments.owned 
        ? 'Can create apartment' 
        : `Apartment limit reached (${limits.apartments.owned})`
    };
  }

  /**
   * Check if user can create a room in an apartment
   */
  async canCreateRoom(userId, apartmentId) {
    const limits = await this.getUserLimits(userId);
    
    // Count rooms in the apartment
    const apartment = await Apartment.findById(apartmentId).populate('rooms');
    if (!apartment) {
      throw new Error('Apartment not found');
    }

    const currentRooms = apartment.rooms.length;

    return {
      canCreate: currentRooms < limits.rooms.perApartment,
      current: currentRooms,
      limit: limits.rooms.perApartment,
      message: currentRooms < limits.rooms.perApartment 
        ? 'Can create room' 
        : `Room limit reached (${limits.rooms.perApartment} per apartment)`
    };
  }

  /**
   * Check if user can create a device in a room
   */
  async canCreateDevice(userId, roomId) {
    const limits = await this.getUserLimits(userId);
    
    // Count devices in the room
    const room = await Room.findById(roomId).populate('devices');
    if (!room) {
      throw new Error('Room not found');
    }

    const currentDevices = room.devices.length;

    return {
      canCreate: currentDevices < limits.devices.perRoom,
      current: currentDevices,
      limit: limits.devices.perRoom,
      message: currentDevices < limits.devices.perRoom 
        ? 'Can create device' 
        : `Device limit reached (${limits.devices.perRoom} per room)`
    };
  }

  /**
   * Check if user can create a task for a device
   */
  async canCreateTask(userId, deviceId) {
    const limits = await this.getUserLimits(userId);
    
    // Count tasks for this device
    const deviceTasks = await Task.countDocuments({ 
      device: deviceId,
      status: { $in: ['active', 'scheduled'] }
    });

    // Count total active tasks for user
    const totalUserTasks = await Task.countDocuments({ 
      creator: userId,
      status: { $in: ['active', 'scheduled'] }
    });

    const canCreateByDevice = deviceTasks < limits.tasks.perDevice;
    const canCreateByTotal = totalUserTasks < limits.tasks.totalPerUser;

    return {
      canCreate: canCreateByDevice && canCreateByTotal,
      current: {
        deviceTasks,
        totalUserTasks
      },
      limits: limits.tasks,
      message: !canCreateByDevice 
        ? `Task limit per device reached (${limits.tasks.perDevice})`
        : !canCreateByTotal 
        ? `Total task limit reached (${limits.tasks.totalPerUser})`
        : 'Can create task'
    };
  }

  /**
   * Get user's current usage across all resources
   */
  async getUserUsage(userId) {
    const limits = await this.getUserLimits(userId);
    
    // Get apartments
    const ownedApartments = await Apartment.find({ creator: userId });
    const memberships = await Apartment.find({ 
      members: userId, 
      creator: { $ne: userId } 
    });

    // Get rooms across all apartments
    const allApartmentIds = [...ownedApartments.map(a => a._id), ...memberships.map(a => a._id)];
    const rooms = await Room.find({ apartment: { $in: allApartmentIds } });

    // Get devices across all rooms
    const roomIds = rooms.map(r => r._id);
    const devices = await Device.find({ room: { $in: roomIds } });

    // Get tasks
    const tasks = await Task.find({ 
      creator: userId,
      status: { $in: ['active', 'scheduled'] }
    });

    return {
      usage: {
        apartments: {
          owned: ownedApartments.length,
          memberships: memberships.length
        },
        rooms: {
          total: rooms.length,
          byApartment: ownedApartments.map(apt => ({
            apartmentId: apt._id,
            apartmentName: apt.name,
            roomCount: rooms.filter(r => r.apartment.toString() === apt._id.toString()).length
          }))
        },
        devices: {
          total: devices.length,
          byRoom: rooms.map(room => ({
            roomId: room._id,
            roomName: room.name,
            deviceCount: devices.filter(d => d.room.toString() === room._id.toString()).length
          }))
        },
        tasks: {
          total: tasks.length,
          byDevice: devices.map(device => ({
            deviceId: device._id,
            deviceName: device.name,
            taskCount: tasks.filter(t => t.device.toString() === device._id.toString()).length
          }))
        }
      },
      limits
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = new SubscriptionLimiter();