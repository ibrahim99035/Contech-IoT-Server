const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

const getAllDevices = require('../controllers/admin/device.admin.controllers/getAllDevices');
const getDeviceById = require('../controllers/admin/device.admin.controllers/getDeviceById');
const getFilteredDevices = require('../controllers/admin/device.admin.controllers/getFilteredDevices');
const getDeviceStatistics = require('../controllers/admin/device.admin.controllers/getDeviceStatistics');
const getDevicePerformanceAnalysis = require('../controllers/admin/device.admin.controllers/getDevicePerformanceAnalysis');

/**
 * @openapi
 * /admin/dashboard/devices/get-all-devices:
 *   get:
 *     summary: Admin - Get all devices
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of devices }
 * 
 * /admin/dashboard/devices/search-devices:
 *   get:
 *     summary: Admin - Search devices
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Filtered devices list }
 * 
 * /admin/dashboard/devices/get-device-statistics:
 *   get:
 *     summary: Admin - Get device statistics
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Device statistics }
 * 
 * /admin/dashboard/devices/get-device-performance-analysis:
 *   get:
 *     summary: Admin - Get device performance analysis
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Performance analytics }
 * 
 * /admin/dashboard/devices/get-device-by-id/{id}:
 *   get:
 *     summary: Admin - Get device details by ID
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Device details }
 */

router.get('/get-all-devices', protect, authorizeRoles('admin'), getAllDevices);
router.get('/search-devices', protect, authorizeRoles('admin'), getFilteredDevices);
router.get('/get-device-statistics', protect, authorizeRoles('admin'), getDeviceStatistics);
router.get('/get-device-performance-analysis', protect, authorizeRoles('admin'), getDevicePerformanceAnalysis);
router.get('/get-device-by-id/:id', protect, authorizeRoles('admin'), getDeviceById);

module.exports = router;