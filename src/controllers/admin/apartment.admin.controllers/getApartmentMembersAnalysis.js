const Apartment = require('../../../models/Apartment');

// GET - Get apartment members analysis
const getApartmentMembersAnalysis = async (req, res) => {
  try {
    const apartments = await Apartment.find({})
      .populate('creator', 'name email role active createdAt')
      .populate('members', 'name email role active createdAt');

    const membersAnalysis = apartments.map(apartment => ({
      apartmentId: apartment._id,
      apartmentName: apartment.name,
      creator: apartment.creator,
      members: apartment.members,
      totalUsers: apartment.members.length + 1, // +1 for creator
      activeUsers: apartment.members.filter(member => member.active).length + (apartment.creator.active ? 1 : 0),
      roleDistribution: {
        admin: apartment.members.filter(member => member.role === 'admin').length + (apartment.creator.role === 'admin' ? 1 : 0),
        moderator: apartment.members.filter(member => member.role === 'moderator').length + (apartment.creator.role === 'moderator' ? 1 : 0),
        customer: apartment.members.filter(member => member.role === 'customer').length + (apartment.creator.role === 'customer' ? 1 : 0)
      },
      createdAt: apartment.createdAt,
      updatedAt: apartment.updatedAt
    }));

    const overallAnalysis = {
      totalApartments: apartments.length,
      totalUniqueUsers: [...new Set([
        ...apartments.map(apt => apt.creator._id.toString()),
        ...apartments.flatMap(apt => apt.members.map(member => member._id.toString()))
      ])].length,
      averageUsersPerApartment: membersAnalysis.reduce((sum, analysis) => sum + analysis.totalUsers, 0) / membersAnalysis.length || 0,
      apartmentsWithMultipleUsers: membersAnalysis.filter(analysis => analysis.totalUsers > 1).length
    };

    res.json({
      success: true,
      data: membersAnalysis,
      overallAnalysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching apartment members analysis',
      error: error.message
    });
  }
};

module.exports = getApartmentMembersAnalysis;