const Apartment = require('../../../models/Apartment');

exports.getApartmentsByMember = async (req, res) => {
  try {
    const apartments = await Apartment.find({ members: req.user._id })
      .populate('creator', 'name email')
      .populate('rooms', 'name')
      .lean();
    res.json(apartments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching apartments', error: error.message });
  }
};