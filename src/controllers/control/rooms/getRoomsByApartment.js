/**
 * Room Controller - Get Rooms By Apartment
 * 
 * This controller retrieves all rooms belonging to a specific apartment
 * that the authenticated user has access to, including populated device
 * and user information.
 * 
 * @module controllers/room/getRoomsByApartment
 */

const Room = require('../../../models/Room');
const Apartment = require('../../../models/Apartment');
const mongoose = require('mongoose');

/**
 * Get all rooms for a specific apartment that the user has access to
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.apartmentId - ID of the apartment to get rooms for
 * @param {Object} req.query - Query parameters
 * @param {number} [req.query.page=1] - Page number for pagination
 * @param {number} [req.query.limit=10] - Number of rooms per page
 * @param {string} [req.query.sortBy=name] - Field to sort by
 * @param {string} [req.query.sortOrder=asc] - Sort order (asc or desc)
 * @param {Object} req.user - Authenticated user object
 * @param {string} req.user._id - ID of the authenticated user
 * @param {Object} res - Express response object
 * @returns {Object} Paginated rooms with metadata or error message
 */
exports.getRoomsByApartment = async (req, res) => {
  try {
    const { apartmentId } = req.params;
    
    // Validate apartment ID format
    if (!mongoose.Types.ObjectId.isValid(apartmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid apartment ID format',
        error: 'The provided apartment ID is not in a valid format'
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

    // Check if apartment exists and user has access
    const apartment = await Apartment.findOne({
      _id: apartmentId,
      members: req.user._id
    }).select('name creator');
    
    if (!apartment) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        error: 'You are not a member of this apartment or it does not exist'
      });
    }

    // Get total count for pagination
    const totalRooms = await Room.countDocuments({
      apartment: apartmentId,
      users: req.user._id
    });

    // If no rooms exist, return empty array with pagination metadata
    if (totalRooms === 0) {
      return res.status(200).json({
        success: true,
        message: 'No rooms found for this apartment',
        data: {
          rooms: [],
          apartment: {
            id: apartment._id,
            name: apartment.name,
            isCreator: apartment.creator.toString() === req.user._id.toString()
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

    // Fetch rooms with pagination and populated fields
    const rooms = await Room.find({
      apartment: apartmentId,
      users: req.user._id
    })
      .populate('devices', 'name type status lastUpdated')
      .populate('users', '_id name email profileImage')
      .populate('creator', '_id name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean();

    // Calculate total pages
    const totalPages = Math.ceil(totalRooms / limit);

    // Return structured response
    return res.status(200).json({
      success: true,
      message: 'Rooms retrieved successfully',
      data: {
        rooms: rooms.map(room => ({
          id: room._id,
          name: room.name,
          description: room.description,
          isCreator: room.creator._id.toString() === req.user._id.toString(),
          creator: room.creator,
          createdAt: room.createdAt,
          updatedAt: room.updatedAt,
          users: room.users,
          devices: room.devices,
          deviceCount: room.devices ? room.devices.length : 0,
          userCount: room.users ? room.users.length : 0
        })),
        apartment: {
          id: apartment._id,
          name: apartment.name,
          isCreator: apartment.creator.toString() === req.user._id.toString()
        }
      },
      pagination: {
        total: totalRooms,
        page,
        limit,
        pages: totalPages
      }
    });
    
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error fetching rooms',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An internal server error occurred'
    });
  }
};