const mongoose = require('mongoose');
const Apartment = require('../../../models/Apartment');
const User = require('../../../models/User');

exports.getApartmentMembers = async (req, res) => {
  try {
    const apartmentId = req.params.id;

    // Validate Apartment ID
    if (!mongoose.Types.ObjectId.isValid(apartmentId)) {
      return res.status(400).json({ message: 'Invalid apartment ID' });
    }

    // Fetch only necessary fields (creator and members)
    const apartment = await Apartment.findById(apartmentId)
      .select('creator members') // Fetch only needed fields
      .lean(); // Converts document to plain JS object for better performance

    if (!apartment) {
      return res.status(404).json({ message: 'Apartment not found' });
    }

    // Fetch user details in a single query to reduce DB calls
    const users = await User.find(
      { _id: { $in: [apartment.creator, ...apartment.members] } }, // Get both creator & members
      'name email' // Select only needed fields
    ).lean();

    // Map users to include roles
    const members = users.map(user => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user._id.equals(apartment.creator) ? 'Creator' : 'Member'
    }));

    res.json({ apartmentId, members });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching apartment members', error: error.message });
  }
};