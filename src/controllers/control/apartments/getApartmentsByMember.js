const Apartment = require('../../../models/Apartment');

exports.getApartmentsByMember = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'Unauthorized access' });
    }

    const apartments = await Apartment.find({ members: req.user._id })
      .populate('creator', 'name email') // Fetches only name & email of creator
      .populate('rooms', 'name') // Fetches only room names
      .select('name creator members rooms') // Fetches only necessary fields
      .lean(); 

    res.json(apartments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching apartments for the user', error: error.message });
  }
};