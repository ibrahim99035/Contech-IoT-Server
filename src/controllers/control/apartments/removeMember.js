const Apartment = require('../../../models/Apartment');
const Room = require('../../../models/Room');
const Device = require('../../../models/Device');
const mongoose = require('mongoose');

exports.removeMember = async (req, res) => {
  try {
    const { apartmentId, memberId } = req.params;
    
    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(apartmentId) || !mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ message: 'Invalid apartment or member ID' });
    }

    // Find the apartment
    const apartment = await Apartment.findById(apartmentId);
    
    // Check if apartment exists
    if (!apartment) {
      return res.status(404).json({ message: 'Apartment not found' });
    }
    
    // Check if the current user is the creator of the apartment
    if (!apartment.creator.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the creator can remove members' });
    }
    
    // Check if trying to remove the creator (which is not allowed)
    if (apartment.creator.equals(memberId)) {
      return res.status(403).json({ message: 'Cannot remove the creator from the apartment' });
    }
    
    // Check if the member exists in the apartment
    if (!apartment.members.some(member => member.equals(memberId))) {
      return res.status(404).json({ message: 'Member not found in this apartment' });
    }
    
    // Remove the member from the apartment
    apartment.members = apartment.members.filter(member => !member.equals(memberId));
    
    // Get all rooms in this apartment
    const rooms = await Room.find({ apartment: apartmentId });
    
    // Remove the member from all rooms in this apartment
    for (const room of rooms) {
      room.users = room.users.filter(user => !user.equals(memberId));
      await room.save();
      
      // Get all devices in this room and remove the member from them
      const devices = await Device.find({ room: room._id });
      for (const device of devices) {
        device.users = device.users.filter(user => !user.equals(memberId));
        await device.save();
      }
    }
    
    // Save the updated apartment
    await apartment.save();
    
    res.status(200).json({ 
      message: 'Member removed successfully from apartment, rooms, and devices',
      apartment: {
        id: apartment._id,
        name: apartment.name,
        membersCount: apartment.members.length
      }
    });
    
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ 
      message: 'Error removing member from apartment', 
      error: error.message 
    });
  }
};