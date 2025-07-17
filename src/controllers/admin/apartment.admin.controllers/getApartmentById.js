const Apartment = require('../../../models/Apartment');

// GET - Get apartment by ID with full details (Optimized)
const getApartmentById = async (req, res) => {
  try {
    const [apartment, apartmentAnalysis] = await Promise.all([
      // Get apartment with populated fields
      Apartment.findById(req.params.id)
        .populate('creator', 'name email role active')
        .populate('members', 'name email role active')
        .populate({
          path: 'rooms',
          populate: [
            {
              path: 'creator',
              select: 'name email'
            },
            {
              path: 'devices',
              populate: {
                path: 'creator',
                select: 'name email'
              }
            },
            {
              path: 'users',
              select: 'name email'
            }
          ]
        })
        .lean(),

      // Get apartment analysis using aggregation
      Apartment.aggregate([
        { $match: { _id: require('mongoose').Types.ObjectId(req.params.id) } },
        {
          $lookup: {
            from: 'users',
            localField: 'members',
            foreignField: '_id',
            as: 'membersInfo'
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
            totalRooms: { $sum: { $cond: [{ $ne: ['$roomsInfo', null] }, 1, 0] } },
            totalMembers: { $first: { $add: [{ $size: '$membersInfo' }, 1] } },
            totalDevices: { $sum: { $size: '$devicesInfo' } },
            roomTypes: {
              $push: {
                $cond: [
                  { $ne: ['$roomsInfo', null] },
                  '$roomsInfo.type',
                  null
                ]
              }
            },
            deviceTypes: {
              $push: {
                $map: {
                  input: '$devicesInfo',
                  as: 'device',
                  in: '$$device.type'
                }
              }
            },
            deviceStatuses: {
              $push: {
                $map: {
                  input: '$devicesInfo',
                  as: 'device',
                  in: '$$device.status'
                }
              }
            },
            activeMembersCount: {
              $first: {
                $size: {
                  $filter: {
                    input: '$membersInfo',
                    cond: { $eq: ['$$this.active', true] }
                  }
                }
              }
            },
            roomsWithPasswords: {
              $sum: {
                $cond: [
                  { $and: [{ $ne: ['$roomsInfo', null] }, { $ne: ['$roomsInfo.roomPassword', null] }] },
                  1,
                  0
                ]
              }
            },
            updatedAt: { $first: '$updatedAt' }
          }
        },
        {
          $project: {
            totalRooms: 1,
            totalMembers: 1,
            totalDevices: 1,
            roomTypes: {
              $arrayToObject: {
                $map: {
                  input: {
                    $setUnion: [
                      { $filter: { input: '$roomTypes', cond: { $ne: ['$$this', null] } } }
                    ]
                  },
                  as: 'type',
                  in: {
                    k: '$$type',
                    v: {
                      $size: {
                        $filter: {
                          input: '$roomTypes',
                          cond: { $eq: ['$$this', '$$type'] }
                        }
                      }
                    }
                  }
                }
              }
            },
            deviceTypes: {
              $arrayToObject: {
                $map: {
                  input: {
                    $setUnion: [
                      {
                        $reduce: {
                          input: '$deviceTypes',
                          initialValue: [],
                          in: { $concatArrays: ['$$value', '$$this'] }
                        }
                      }
                    ]
                  },
                  as: 'type',
                  in: {
                    k: '$$type',
                    v: {
                      $size: {
                        $filter: {
                          input: {
                            $reduce: {
                              input: '$deviceTypes',
                              initialValue: [],
                              in: { $concatArrays: ['$$value', '$$this'] }
                            }
                          },
                          cond: { $eq: ['$$this', '$$type'] }
                        }
                      }
                    }
                  }
                }
              }
            },
            deviceStatuses: {
              $arrayToObject: {
                $map: {
                  input: {
                    $setUnion: [
                      {
                        $reduce: {
                          input: '$deviceStatuses',
                          initialValue: [],
                          in: { $concatArrays: ['$$value', '$$this'] }
                        }
                      }
                    ]
                  },
                  as: 'status',
                  in: {
                    k: '$$status',
                    v: {
                      $size: {
                        $filter: {
                          input: {
                            $reduce: {
                              input: '$deviceStatuses',
                              initialValue: [],
                              in: { $concatArrays: ['$$value', '$$this'] }
                            }
                          },
                          cond: { $eq: ['$$this', '$$status'] }
                        }
                      }
                    }
                  }
                }
              }
            },
            activeMembersCount: 1,
            roomsWithPasswords: 1,
            averageDevicesPerRoom: {
              $cond: [
                { $gt: ['$totalRooms', 0] },
                { $divide: ['$totalDevices', '$totalRooms'] },
                0
              ]
            },
            lastActivity: '$updatedAt'
          }
        }
      ])
    ]);

    if (!apartment) {
      return res.status(404).json({
        success: false,
        message: 'Apartment not found'
      });
    }

    const analysis = apartmentAnalysis[0] || {
      totalRooms: 0,
      totalMembers: 1,
      totalDevices: 0,
      roomTypes: {},
      deviceTypes: {},
      deviceStatuses: {},
      activeMembersCount: 0,
      roomsWithPasswords: 0,
      averageDevicesPerRoom: 0,
      lastActivity: apartment.updatedAt
    };

    // Round the average to 2 decimal places
    analysis.averageDevicesPerRoom = Number(analysis.averageDevicesPerRoom.toFixed(2));

    res.json({
      success: true,
      data: apartment,
      analysis
    });
  } catch (error) {
    console.error('❌ [getApartmentById] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching apartment',
      error: error.message
    });
  }
};

module.exports = getApartmentById;