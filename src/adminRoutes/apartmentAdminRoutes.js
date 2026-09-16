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
 * @openapi
 * /admin/dashboard/apartments/all-apartments:
 *   get:
 *     summary: Admin - Get all apartments with comprehensive analysis
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of apartments with analytics }
 * 
 * /admin/dashboard/apartments/search-apartments:
 *   get:
 *     summary: Admin - Search and filter apartments
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Filtered apartments list }
 * 
 * /admin/dashboard/apartments/apartment-statistics:
 *   get:
 *     summary: Admin - Get apartment statistics dashboard
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Apartment analytics }
 * 
 * /admin/dashboard/apartments/apartment-members-analysis:
 *   get:
 *     summary: Admin - Get apartment members distribution analysis
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Member analysis }
 * 
 * /admin/dashboard/apartments/get-apartment-by-id/{id}:
 *   get:
 *     summary: Admin - Get specific apartment by ID
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Apartment details }
 */

router.get('/all-apartments', protect, authorizeRoles('admin'), getAllApartments);
router.get('/search-apartments', protect, authorizeRoles('admin'), getFilteredApartments);
router.get('/apartment-statistics', protect, authorizeRoles('admin'), getApartmentStatistics);
router.get('/apartment-members-analysis', protect, authorizeRoles('admin'), getApartmentMembersAnalysis);
router.get('/get-apartment-by-id/:id', protect, authorizeRoles('admin'), getApartmentById);

module.exports = router;