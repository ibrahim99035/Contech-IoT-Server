/**
 * Room Controller - Get Rooms By User
 * 
 * This controller retrieves all rooms that the authenticated user
 * has access to, across all apartments, with populated apartment and device information.
 * 
 * @module controllers/room/getRoomsByUser
 */

const Room = require('../../../models/Room');
const mongoose = require('mongoose');

/**
 * Get all rooms that the authenticated user has access to
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {number} [req.query.page=1] - Page number for pagination
 * @param {number} [req.query.limit=10] - Number of rooms per page
 * @param {string} [req.query.sortBy=name] - Field to sort by
 * @param {string} [req.query.sortOrder=asc] - Sort order (asc or desc)
 * @param {boolean} [req.query.includeUsers=false] - Whether to include user details in response
 * @param {Object} req.user - Authenticated user object
 * @param {string} req.user._id - ID of the authenticated user
 * @param {Object} res - Express response object
 * @returns {Object} Paginated rooms with metadata or error message
 */
exports.getRoomsByUser = async (req, res) => {
  try {
    // Get pagination and sorting parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const sortBy = req.query.sortBy || 'name';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder;
    
    // Check if we should include users in the response
    const includeUsers = req.query.includeUsers === 'true';
    
    // Build base query
    const query = { users: req.user._id };
    
    // Add optional filters if provided
    if (req.query.apartmentId && mongoose.Types.ObjectId.isValid(req.query.apartmentId)) {
      query.apartment = req.query.apartmentId;
    }
    
    // Get total count for pagination
    const totalRooms = await Room.countDocuments(query);
    
    // If no rooms exist, return empty array with pagination metadata
    if (totalRooms === 0) {
      return res.status(200).json({
        success: true,
        message: 'No rooms found for this user',
        data: {
          rooms: []
        },
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0
        }
      });
    }
    
    // Build populate configuration
    const populateConfig = [
      { path: 'apartment', select: 'name location creator' },
      { path: 'devices', select: 'name type status lastUpdated' }
    ];
    
    // Conditionally add users population
    if (includeUsers) {
      populateConfig.push({ path: 'users', select: '_id name email profileImage' });
      populateConfig.push({ path: 'creator', select: '_id name email' });
    }
    
    // Fetch rooms with pagination and populated fields
    const rooms = await Room.find(query)
      .populate(populateConfig)
      .select('_id name description apartment devices createdAt updatedAt creator')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Calculate total pages
    const totalPages = Math.ceil(totalRooms / limit);
    
    // Process rooms to add computed properties
    const processedRooms = rooms.map(room => {
      const result = {
        id: room._id,
        name: room.name,
        description: room.description || '',
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        apartment: room.apartment ? {
          id: room.apartment._id,
          name: room.apartment.name,
          isApartmentCreator: room.apartment.creator && 
                              room.apartment.creator.toString() === req.user._id.toString()
        } : null,
        devices: room.devices || [],
        deviceCount: room.devices ? room.devices.length : 0,
        isRoomCreator: room.creator && room.creator.toString() === req.user._id.toString()
      };
      
      // Add users if requested
      if (includeUsers) {
        result.users = room.users || [];
        result.userCount = room.users ? room.users.length : 0;
        result.creator = room.creator;
      }
      
      return result;
    });
    
    // Return structured response
    return res.status(200).json({
      success: true,
      message: 'Rooms retrieved successfully',
      data: {
        rooms: processedRooms
      },
      pagination: {
        total: totalRooms,
        page,
        limit,
        pages: totalPages
      },
      filters: {
        apartmentId: req.query.apartmentId || null,
        includeUsers
      }
    });
    
  } catch (error) {
    console.error('Error in getRoomsByUser:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Error fetching rooms',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An internal server error occurred'
    });
  }
};