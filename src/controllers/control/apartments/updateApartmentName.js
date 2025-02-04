const Apartment = require('../../../models/Apartment');
const mongoose = require('mongoose');

exports.updateApartmentName = async (req, res) => {
  try {
    const { apartmentId, name } = req.body;
    if (!mongoose.Types.ObjectId.isValid(apartmentId)) return res.status(400).json({ message: 'Invalid apartment ID' });

    const apartment = await Apartment.findById(apartmentId);
    if (!apartment) return res.status(404).json({ message: 'Apartment not found' });

    if (apartment.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the creator can update the apartment name' });
    }

    apartment.name = name;
    await apartment.save();
    res.json({ message: 'Apartment name updated successfully', apartment });
  } catch (error) {
    res.status(500).json({ message: 'Error updating apartment name', error: error.message });
  }
};