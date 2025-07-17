const Apartment = require('../../../models/Apartment');

// GET - Get apartment members analysis (Optimized)
const getApartmentMembersAnalysis = async (req, res) => {
  try {
    const [membersAnalysis, overallStats] = await Promise.all([
      // Get apartment details with populated members
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
            from: 'users',
            localField: 'members',
            foreignField: '_id',
            as: 'membersInfo'
          }
        },
        {
          $addFields: {
            creator: { $arrayElemAt: ['$creatorInfo', 0] },
            members: '$membersInfo'
          }
        },
        {
          $addFields: {
            totalUsers: { $add: [{ $size: '$members' }, 1] },
            activeUsers: {
              $add: [
                { $size: { $filter: { input: '$members', cond: { $eq: ['$$this.active', true] } } } },
                { $cond: [{ $eq: ['$creator.active', true] }, 1, 0] }
              ]
            },
            adminCount: {
              $add: [
                { $size: { $filter: { input: '$members', cond: { $eq: ['$$this.role', 'admin'] } } } },
                { $cond: [{ $eq: ['$creator.role', 'admin'] }, 1, 0] }
              ]
            },
            moderatorCount: {
              $add: [
                { $size: { $filter: { input: '$members', cond: { $eq: ['$$this.role', 'moderator'] } } } },
                { $cond: [{ $eq: ['$creator.role', 'moderator'] }, 1, 0] }
              ]
            },
            customerCount: {
              $add: [
                { $size: { $filter: { input: '$members', cond: { $eq: ['$$this.role', 'customer'] } } } },
                { $cond: [{ $eq: ['$creator.role', 'customer'] }, 1, 0] }
              ]
            }
          }
        },
        {
          $project: {
            apartmentId: '$_id',
            apartmentName: '$name',
            creator: {
              _id: '$creator._id',
              name: '$creator.name',
              email: '$creator.email',
              role: '$creator.role',
              active: '$creator.active',
              createdAt: '$creator.createdAt'
            },
            members: {
              $map: {
                input: '$members',
                as: 'member',
                in: {
                  _id: '$$member._id',
                  name: '$$member.name',
                  email: '$$member.email',
                  role: '$$member.role',
                  active: '$$member.active',
                  createdAt: '$$member.createdAt'
                }
              }
            },
            totalUsers: 1,
            activeUsers: 1,
            roleDistribution: {
              admin: '$adminCount',
              moderator: '$moderatorCount',
              customer: '$customerCount'
            },
            createdAt: 1,
            updatedAt: 1
          }
        }
      ]),

      // Get overall statistics
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
            from: 'users',
            localField: 'members',
            foreignField: '_id',
            as: 'membersInfo'
          }
        },
        {
          $addFields: {
            totalUsers: { $add: [{ $size: '$membersInfo' }, 1] },
            allUsers: {
              $concatArrays: [
                [{ $arrayElemAt: ['$creatorInfo._id', 0] }],
                '$members'
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            totalApartments: { $sum: 1 },
            totalUsersSum: { $sum: '$totalUsers' },
            apartmentsWithMultipleUsers: {
              $sum: { $cond: [{ $gt: ['$totalUsers', 1] }, 1, 0] }
            },
            allUniqueUsers: { $addToSet: '$allUsers' }
          }
        },
        {
          $project: {
            totalApartments: 1,
            averageUsersPerApartment: {
              $cond: [
                { $gt: ['$totalApartments', 0] },
                { $divide: ['$totalUsersSum', '$totalApartments'] },
                0
              ]
            },
            apartmentsWithMultipleUsers: 1,
            totalUniqueUsers: {
              $size: {
                $reduce: {
                  input: '$allUniqueUsers',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] }
                }
              }
            }
          }
        }
      ])
    ]);

    const overallAnalysis = overallStats[0] || {
      totalApartments: 0,
      totalUniqueUsers: 0,
      averageUsersPerApartment: 0,
      apartmentsWithMultipleUsers: 0
    };

    // Round the average to 2 decimal places
    overallAnalysis.averageUsersPerApartment = Number(overallAnalysis.averageUsersPerApartment.toFixed(2));

    res.json({
      success: true,
      data: membersAnalysis,
      overallAnalysis
    });
  } catch (error) {
    console.error('❌ [getApartmentMembersAnalysis] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching apartment members analysis',
      error: error.message
    });
  }
};

module.exports = getApartmentMembersAnalysis;