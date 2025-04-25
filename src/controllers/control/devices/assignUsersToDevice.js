const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');
const Device = require('../../../models/Device');
/**
 * @desc    Assign users to a device
 * @route   PUT /api/devices/:deviceId/assign-users
 * @access  Private - Device creator only
 * @param   {array} userIds - Array of user IDs to assign to the device
 * @returns {object} Response containing status, message, device data, and any additional assignment info
 */
const assignUsersToDevice = async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { userIds } = req.body;
      const requestingUserId = req.user._id;  
      // Input validation
      if (!deviceId || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request. Device ID and array of user IDs required',
        });
      }
  
      // Find the device and ensure it exists
      const device = await Device.findById(deviceId);
      if (!device) {
        return res.status(404).json({
          success: false,
          message: 'Device not found',
        });
      }
  
      // Check if requesting user is the creator of the device
      if (device.creator.toString() !== requestingUserId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only device creator can assign users',
        });
      }
  
      // Find the room this device belongs to
      const room = await Room.findById(device.room);
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room associated with this device not found',
        });
      }
  
      // Find the apartment this room belongs to
      const apartment = await Apartment.findById(room.apartment);
      if (!apartment) {
        return res.status(404).json({
          success: false,
          message: 'Apartment associated with this room not found',
        });
      }
  
      // Process each user and track assignment info
      const processResults = {
        success: true,
        message: 'Users assigned to device successfully',
        device: null,
        assignmentDetails: {
          addedToDevice: [],
          addedToRoom: [],
          addedToApartment: [],
          alreadyAssigned: [],
          invalidUsers: []
        }
      };
  
      // Check if all users exist before proceeding with any updates
      const users = await User.find({ _id: { $in: userIds }, active: true });
      const foundUserIds = users.map(user => user._id.toString());
      const missingUserIds = userIds.filter(id => !foundUserIds.includes(id.toString()));
  
      if (missingUserIds.length > 0) {
        processResults.assignmentDetails.invalidUsers = missingUserIds;
      }
  
      // Proceed with valid users only
      for (const user of users) {
        const userId = user._id.toString();
        
        // Check if user is already assigned to the device
        if (device.users.includes(userId)) {
          processResults.assignmentDetails.alreadyAssigned.push(userId);
          continue;
        }
  
        // Cascade assignment logic
        // 1. Add to apartment if not already a member
        let addedToApartment = false;
        if (!apartment.members.includes(userId)) {
          apartment.members.push(userId);
          addedToApartment = true;
          processResults.assignmentDetails.addedToApartment.push(userId);
          
          // Also update user's apartments array
          if (!user.apartments.includes(apartment._id)) {
            user.apartments.push(apartment._id);
            await user.save();
          }
        }
  
        // 2. Add to room if not already assigned
        let addedToRoom = false;
        if (!room.users.includes(userId)) {
          room.users.push(userId);
          addedToRoom = true;
          processResults.assignmentDetails.addedToRoom.push(userId);
        }
  
        // 3. Add to device
        device.users.push(userId);
        processResults.assignmentDetails.addedToDevice.push(userId);
        
        // Add device to user's devices array
        if (!user.devices.includes(device._id)) {
          user.devices.push(device._id);
          await user.save();
        }
      }
  
      // Save all updated documents
      if (processResults.assignmentDetails.addedToApartment.length > 0) {
        await apartment.save();
      }
      
      if (processResults.assignmentDetails.addedToRoom.length > 0) {
        await room.save();
      }
      
      if (processResults.assignmentDetails.addedToDevice.length > 0) {
        await device.save();
      }
  
      // Get updated device with populated users
      const updatedDevice = await Device.findById(deviceId)
        .populate('users', 'name email role')
        .populate('room', 'name')
        .populate('creator', 'name');
  
      processResults.device = updatedDevice;
  
      return res.status(200).json(processResults);
    } catch (error) {
      console.error('Error assigning users to device:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while assigning users to device',
        error: error.message,
      });
    }
};

module.exports = { assignUsersToDevice };