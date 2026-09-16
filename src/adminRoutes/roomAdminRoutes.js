const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const getAllRooms = require('../controllers/admin/room.admin.controllers/getAllRooms');
const getRoomById = require('../controllers/admin/room.admin.controllers/getRoomById');
const getFilteredRooms = require('../controllers/admin/room.admin.controllers/getFilteredRooms');
const getRoomStatistics = require('../controllers/admin/room.admin.controllers/getRoomStatistics');
const getRoomUsageAnalysis = require('../controllers/admin/room.admin.controllers/getRoomUsageAnalysis');

/**
 * @openapi
 * /admin/dashboard/rooms/get-all-rooms:
 *   get:
 *     summary: Admin - Get all rooms with analytics
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of rooms }
 * 
 * /admin/dashboard/rooms/search-rooms:
 *   get:
 *     summary: Admin - Search rooms
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Filtered rooms list }
 * 
 * /admin/dashboard/rooms/room-statistics:
 *   get:
 *     summary: Admin - Get room statistics dashboard
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Room analytics }
 * 
 * /admin/dashboard/rooms/get-room-usage-analysis:
 *   get:
 *     summary: Admin - Get room device usage analysis
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Room usage analysis }
 * 
 * /admin/dashboard/rooms/get-room-by-id/{id}:
 *   get:
 *     summary: Admin - Get specific room by ID
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Room details }
 */

router.get('/get-all-rooms', protect, authorizeRoles('admin'), getAllRooms);
router.get('/search-rooms', protect, authorizeRoles('admin'), getFilteredRooms);
router.get('/room-statistics', protect, authorizeRoles('admin'), getRoomStatistics);
router.get('/get-room-usage-analysis', protect, authorizeRoles('admin'), getRoomUsageAnalysis);
router.get('/get-room-by-id/:id', protect, authorizeRoles('admin'), getRoomById);

module.exports = router;