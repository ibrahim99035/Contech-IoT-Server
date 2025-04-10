const Apartment = require('../../../models/Apartment');

exports.getApartmentsByMember = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'Unauthorized access' });
    }
    
    const userId = req.user._id;
    
    // Find apartments where user is either a member OR creator
    const apartments = await Apartment.find({
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
    
    // Debugging info
    console.log('User ID:', userId);
    console.log('Found apartments:', apartments.length);
    
    // Send structured response
    res.status(200).json({
      status: "success",
      message: "Apartments fetched successfully",
      data: apartments
    });
    
  } catch (error) {
    console.error('Error fetching apartments:', error);
    res.status(500).json({ 
      status: "error",
      message: 'Error fetching apartments for the user', 
      error: error.message 
    });
  }
};