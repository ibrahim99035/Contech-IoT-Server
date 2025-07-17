const Apartment = require('../../../models/Apartment');

// GET - Get all apartments with comprehensive analysis (Optimized)
const getAllApartments = async (req, res) => {
  try {
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Use aggregation pipeline for better performance
    const [apartments, analysisData] = await Promise.all([
      // Get paginated apartments with minimal data
      Apartment.find({})
        .select('name location creator members rooms createdAt updatedAt')
        .populate('creator', 'name')
        .populate('members', 'name')
        .populate({
          path: 'rooms',
          select: 'name devices',
          populate: {
            path: 'devices',
            select: 'name type status'
          }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(), // Use lean() for better performance

      // Get analysis data using aggregation (much faster)
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
          $lookup: {
            from: 'rooms',
            localField: 'rooms',
            foreignField: '_id',
            as: 'roomsInfo'
          }
        },
        {
          $unwind: {
            path: '$roomsInfo',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: 'devices',
            localField: 'roomsInfo.devices',
            foreignField: '_id',
            as: 'devicesInfo'
          }
        },
        {
          $group: {
            _id: '$_id',
            apartmentId: { $first: '$_id' },
            creatorRole: { $first: { $arrayElemAt: ['$creatorInfo.role', 0] } },
            createdAt: { $first: '$createdAt' },
            membersCount: { $first: { $size: { $ifNull: ['$members', []] } } },
            roomsCount: { $sum: { $cond: [{ $ne: ['$roomsInfo', null] }, 1, 0] } },
            devicesCount: { $sum: { $size: { $ifNull: ['$devicesInfo', []] } } }
          }
        },
        {
          $group: {
            _id: null,
            totalApartments: { $sum: 1 },
            totalRooms: { $sum: '$roomsCount' },
            totalDevices: { $sum: '$devicesCount' },
            totalMembers: { $sum: '$membersCount' },
            creatorRoles: {
              $push: {
                $cond: [
                  { $ne: ['$creatorRole', null] },
                  '$creatorRole',
                  'unknown'
                ]
              }
            },
            recentApartments: {
              $sum: {
                $cond: [
                  { $gte: ['$createdAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
                  1,
                  0
                ]
              }
            }
          }
        }
      ])
    ]);

    // Get total count for pagination
    const totalCount = await Apartment.countDocuments();

    // Process analysis data
    const analysis = analysisData[0] || {
      totalApartments: 0,
      totalRooms: 0,
      totalDevices: 0,
      totalMembers: 0,
      creatorRoles: [],
      recentApartments: 0
    };

    // Calculate role distribution
    const apartmentsByCreatorRole = analysis.creatorRoles.reduce((acc, role) => {
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    // Calculate averages
    const processedAnalysis = {
      totalApartments: analysis.totalApartments,
      totalRooms: analysis.totalRooms,
      totalDevices: analysis.totalDevices,
      totalMembers: analysis.totalMembers,
      averageRoomsPerApartment: analysis.totalApartments > 0 ? 
        (analysis.totalRooms / analysis.totalApartments).toFixed(2) : 0,
      averageMembersPerApartment: analysis.totalApartments > 0 ? 
        (analysis.totalMembers / analysis.totalApartments).toFixed(2) : 0,
      averageDevicesPerApartment: analysis.totalApartments > 0 ? 
        (analysis.totalDevices / analysis.totalApartments).toFixed(2) : 0,
      apartmentsByCreatorRole,
      recentApartments: analysis.recentApartments
    };

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: apartments,
      analysis: processedAnalysis,
      pagination: {
        total: totalCount,
        page: page,
        limit: limit,
        pages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('❌ [getAllApartments] Error:', error);
    console.error('❌ [getAllApartments] Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error fetching apartments',
      error: error.message
    });
  }
};

module.exports = getAllApartments;