const Apartment = require('../../../models/Apartment');

exports.getApartmentsByMember = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'Unauthorized access' });
    }
    
    const userId = req.user._id;
    
    // Find apartments where user is either a member OR creator
    const apartmentsArray = await Apartment.find({
      $or: [
        { members: userId },
        { creator: userId }
      ]
    })
    .populate('creator', 'name email role')
    .populate('members', 'name email role')
    .populate('rooms', 'name')
    .select('name creator members rooms')
    .lean();
    
    // Convert array to object of objects using _id as keys
    const apartmentsObject = {};
    apartmentsArray.forEach(apartment => {
      apartmentsObject[apartment._id] = apartment;
    });
    
    // Debugging info
    console.log('User ID:', userId);
    console.log('Found apartments:', Object.keys(apartmentsObject).length);
    
    res.json(apartmentsObject);
  } catch (error) {
    console.error('Error fetching apartments:', error);
    res.status(500).json({ message: 'Error fetching apartments for the user', error: error.message });
  }
};