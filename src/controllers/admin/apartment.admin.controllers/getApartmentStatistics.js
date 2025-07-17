const Apartment = require('../../../models/Apartment');
const Room = require('../../../models/Room');
const Device = require('../../../models/Device');

// GET - Get apartment statistics and analytics (Optimized)
const getApartmentStatistics = async (req, res) => {
  try {
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      apartmentStats,
      roomStats,
      deviceStats,
      deviceStatusStats
    ] = await Promise.all([
      // Apartment statistics with aggregation
      Apartment.aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'creator',
            foreignField: '_id',
            as: 'creatorInfo'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            thisWeek: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', oneWeekAgo] }, 1, 0]
              }
            },
            thisMonth: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', oneMonthAgo] }, 1, 0]
              }
            },
            creatorRoles: {
              $push: {
                $cond: [
                  { $ne: [{ $arrayElemAt: ['$creatorInfo.role', 0] }, null] },
                  { $arrayElemAt: ['$creatorInfo.role', 0] },
                  'unknown'
                ]
              }
            },
            totalMembers: { $sum: { $size: { $ifNull: ['$members', []] } } },
            apartmentsWithMembers: {
              $sum: {
                $cond: [{ $gt: [{ $size: { $ifNull: ['$members', []] } }, 0] }, 1, 0]
              }
            }
          }
        }
      ]),

      // Room distribution
      Room.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        }
      ]),

      // Device distribution
      Device.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        }
      ]),

      // Device status distribution
      Device.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Process aggregation results
    const apartmentData = apartmentStats[0] || {
      total: 0,
      thisWeek: 0,
      thisMonth: 0,
      creatorRoles: [],
      totalMembers: 0,
      apartmentsWithMembers: 0
    };

    const roomDistribution = roomStats.reduce((acc, room) => {
      acc[room._id] = room.count;
      return acc;
    }, {});

    const deviceDistribution = deviceStats.reduce((acc, device) => {
      acc[device._id] = device.count;
      return acc;
    }, {});

    const deviceStatusDistribution = deviceStatusStats.reduce((acc, status) => {
      acc[status._id] = status.count;
      return acc;
    }, {});

    const apartmentsByCreatorRole = apartmentData.creatorRoles.reduce((acc, role) => {
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    // Get totals for calculations
    const totalRooms = roomStats.reduce((sum, room) => sum + room.count, 0);
    const totalDevices = deviceStats.reduce((sum, device) => sum + device.count, 0);

    const statistics = {
      apartmentGrowth: {
        thisWeek: apartmentData.thisWeek,
        thisMonth: apartmentData.thisMonth,
        total: apartmentData.total
      },
      roomDistribution,
      deviceDistribution,
      deviceStatusDistribution,
      apartmentsByCreatorRole,
      occupancyAnalysis: {
        totalRooms,
        totalDevices,
        averageRoomsPerApartment: apartmentData.total > 0 ? 
          Number((totalRooms / apartmentData.total).toFixed(2)) : 0,
        averageDevicesPerApartment: apartmentData.total > 0 ? 
          Number((totalDevices / apartmentData.total).toFixed(2)) : 0,
        averageDevicesPerRoom: totalRooms > 0 ? 
          Number((totalDevices / totalRooms).toFixed(2)) : 0
      },
      membershipAnalysis: {
        totalMembers: apartmentData.totalMembers,
        averageMembersPerApartment: apartmentData.total > 0 ? 
          Number((apartmentData.totalMembers / apartmentData.total).toFixed(2)) : 0,
        apartmentsWithMultipleMembers: apartmentData.apartmentsWithMembers
      }
    };

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('❌ [getApartmentStatistics] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching apartment statistics',
      error: error.message
    });
  }
};

module.exports = getApartmentStatistics;