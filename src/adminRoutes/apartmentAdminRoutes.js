const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const getAllApartments = require('../controllers/admin/apartment.admin.controllers/getAllApartments');
const getApartmentById = require('../controllers/admin/apartment.admin.controllers/getApartmentById');
const getFilteredApartments = require('../controllers/admin/apartment.admin.controllers/getFilteredApartments');
const getApartmentStatistics = require('../controllers/admin/apartment.admin.controllers/getApartmentStatistics');
const getApartmentMembersAnalysis = require('../controllers/admin/apartment.admin.controllers/getApartmentMembersAnalysis');

/**
 * @route   GET /api/admin/dashboard/apartments/get-all-apartments
 * @desc    Get all apartments with comprehensive analysis and statistics
 * @access  Admin only
 * @returns {Object} apartments - Array of apartments with full details
 * @returns {Object} analysis - Comprehensive apartment analytics
 * @returns {Object} pagination - Pagination information
 */
router.get('/all-apartments', protect, authorizeRoles('admin'), getAllApartments);

/**
 * @route   GET /api/admin/dashboard/apartments/search-apartments
 * @desc    Search and filter apartments with advanced filtering options
 * @access  Admin only
 * @query   {String} search - Search term for apartment names
 * @query   {String} creatorId - Filter by creator ID
 * @query   {String} sortBy - Sort field (default: createdAt)
 * @query   {String} sortOrder - Sort order (asc/desc, default: desc)
 * @query   {Number} page - Page number (default: 1)
 * @query   {Number} limit - Items per page (default: 10)
 * @returns {Object} apartments - Filtered apartments array
 * @returns {Object} pagination - Pagination details with navigation info
 */
router.get('/search-apartments', protect, authorizeRoles('admin'), getFilteredApartments);

/**
 * @route   GET /api/admin/dashboard/apartments/apartment-statistics
 * @desc    Get comprehensive apartment statistics and analytics dashboard
 * @access  Admin only
 * @returns {Object} statistics - Detailed apartment analytics including growth, distribution, and occupancy
 */
router.get('/apartment-statistics', protect, authorizeRoles('admin'), getApartmentStatistics);

/**
 * @route   GET /api/admin/dashboard/apartments/apartment-members-analysis
 * @desc    Get detailed analysis of apartment members and user distribution
 * @access  Admin only
 * @returns {Object} membersAnalysis - Per-apartment member analysis
 * @returns {Object} overallAnalysis - Overall membership statistics
 */
router.get('/apartment-members-analysis', protect, authorizeRoles('admin'), getApartmentMembersAnalysis);

/**
 * @route   GET /api/admin/dashboard/apartments/get-apartment-by-id/:id
 * @desc    Get specific apartment by ID with full details and analysis
 * @access  Admin only
 * @param   {String} id - Apartment ID
 * @returns {Object} apartment - Complete apartment details with nested data
 * @returns {Object} analysis - Apartment-specific analytics
 */
router.get('/get-apartment-by-id/:id', protect, authorizeRoles('admin'), getApartmentById);

module.exports = router;