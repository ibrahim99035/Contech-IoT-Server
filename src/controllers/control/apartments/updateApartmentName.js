const Apartment = require('../../../models/Apartment');
const mongoose = require('mongoose');

exports.updateApartmentName = async (req, res) => {
  try {
    const { apartmentId, name } = req.body;

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Unauthorized access' });
    }

    if (!mongoose.Types.ObjectId.isValid(apartmentId)) {
      return res.status(400).json({ message: 'Invalid apartment ID' });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Apartment name cannot be empty' });
    }

    const updatedApartment = await Apartment.findOneAndUpdate(
      { _id: apartmentId, creator: req.user._id }, // Ensures only the creator can update
      { name },
      { new: true } // Returns the updated document
    );

    if (!updatedApartment) {
      return res.status(404).json({ message: 'Apartment not found or unauthorized' });
    }

    res.json({ message: 'Apartment name updated successfully', apartment: updatedApartment });
  } catch (error) {
    res.status(500).json({ message: 'Error updating apartment name', error: error.message });
  }
};