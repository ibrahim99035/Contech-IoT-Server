/**
 * User Controller - Get Users By Room
 * 
 * This controller retrieves all users that belong to a specific room,
 * with permission checks to ensure the requester has access to the room.
 * 
 * @module controllers/user/getUsersByRoom
 */

const Room = require('../../../models/Room');
const User = require('../../../models/User');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

/**
 * Get all users that belong to a specific room
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.roomId - ID of the room to get users for
 * @param {Object} req.query - Query parameters
 * @param {number} [req.query.page=1] - Page number for pagination
 * @param {number} [req.query.limit=10] - Number of users per page
 * @param {string} [req.query.sortBy=name] - Field to sort by
 * @param {string} [req.query.sortOrder=asc] - Sort order (asc or desc)
 * @param {string} [req.query.search] - Search term for filtering users by name or email
 * @param {Object} req.user - Authenticated user object
 * @param {string} req.user._id - ID of the authenticated user
 * @param {Object} res - Express response object
 * @returns {Object} Paginated users with metadata or error message
 */
exports.getUsersByRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    
    // Validate room ID format
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID format',
        error: 'The provided room ID is not in a valid format'
      });
    }

    // Get pagination and sorting parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const sortBy = req.query.sortBy || 'name';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder;

    // Check if room exists and user has access
    const room = await Room.findOne({
      _id: roomId,
      users: req.user._id
    }).select('name creator apartment');
    
    if (!room) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        error: 'You are not a member of this room or it does not exist'
      });
    }

    // Get search parameter
    const searchTerm = req.query.search;
    
    // Build the aggregation pipeline
    const aggregationPipeline = [];
    
    // First, get the room and its users
    aggregationPipeline.push(
      { $match: { _id: new ObjectId(roomId) } }, // Fixed: using 'new ObjectId()'
      { $project: { users: 1 } }
    );
    
    // Lookup the user documents
    aggregationPipeline.push(
      {
        $lookup: {
          from: 'users',
          localField: 'users',
          foreignField: '_id',
          as: 'userDetails'
        }
      }
    );
    
    // Unwind the user array
    aggregationPipeline.push({ $unwind: '$userDetails' });
    
    // Apply search filter if provided
    if (searchTerm) {
      aggregationPipeline.push({
        $match: {
          $or: [
            { 'userDetails.name': { $regex: searchTerm, $options: 'i' } },
            { 'userDetails.email': { $regex: searchTerm, $options: 'i' } }
          ]
        }
      });
    }
    
    // Project only the user details
    aggregationPipeline.push({
      $project: {
        _id: '$userDetails._id',
        name: '$userDetails.name',
        email: '$userDetails.email',
        profileImage: '$userDetails.profileImage',
        isCreator: { $eq: ['$userDetails._id', room.creator] },
        joinedAt: '$userDetails.createdAt',
        lastActive: '$userDetails.lastActive',
        role: '$userDetails.role'
      }
    });
    
    // Count total matching users for pagination before applying skip and limit
    const countPipeline = [...aggregationPipeline];
    countPipeline.push({ $count: 'total' });
    
    const countResults = await Room.aggregate(countPipeline);
    const totalUsers = countResults.length > 0 ? countResults[0].total : 0;
    
    // If no users found, return early with empty array
    if (totalUsers === 0) {
      return res.status(200).json({
        success: true,
        message: 'No users found for this room',
        data: {
          users: [],
          room: {
            id: room._id,
            name: room.name,
            isCreator: room.creator.toString() === req.user._id.toString(),
            apartmentId: room.apartment
          }
        },
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0
        }
      });
    }
    
    // Apply sort, skip and limit for pagination
    aggregationPipeline.push(
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: limit }
    );
    
    // Execute the aggregation pipeline
    const userResults = await Room.aggregate(aggregationPipeline);
    
    // Calculate total pages
    const totalPages = Math.ceil(totalUsers / limit);
    
    // Process users to protect sensitive data
    const processedUsers = userResults.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage || null,
      isCreator: user.isCreator,
      joinedAt: user.joinedAt,
      lastActive: user.lastActive || null,
      role: user.role || 'member'
    }));
    
    // Return structured response
    return res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users: processedUsers,
        room: {
          id: room._id,
          name: room.name,
          isCreator: room.creator.toString() === req.user._id.toString(),
          apartmentId: room.apartment
        }
      },
      pagination: {
        total: totalUsers,
        page,
        limit,
        pages: totalPages
      },
      filters: {
        search: searchTerm || null
      }
    });
    
  } catch (error) {
    console.error('Error in getUsersByRoom:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An internal server error occurred'
    });
  }
};