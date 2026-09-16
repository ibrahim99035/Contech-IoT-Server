const express = require('express');
const router = express.Router();

const { createApartment } = require('../controllers/control/apartments/createApartment');
const { getApartmentsByMember } = require('../controllers/control/apartments/getApartmentsByMember');
const { assignMembers } = require('../controllers/control/apartments/assignMembers');
const { updateApartmentName } = require('../controllers/control/apartments/updateApartmentName');
const { deleteApartment } = require('../controllers/control/apartments/deleteApartment');
const { getApartmentMembers } = require('../controllers/control/apartments/getApartmentMembers'); 
const { removeMember } = require('../controllers/control/apartments/removeMember');
const { exitApartment } = require('../controllers/control/apartments/exitApartment');

// Middleware for authentication (Ensures user is authenticated)
const { protect } = require('../middleware/authMiddleware');

const { checkApartmentLimits } = require('../middleware/checkSubscriptionLimits');

/**
 * @openapi
 * /api/apartments-handler/apartments/create-apartment:
 *   post:
 *     summary: Create a new apartment
 *     tags: [Apartments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Main Residency" }
 *               address: { type: string, example: "123 Smart St, Cairo" }
 *     responses:
 *       201: { description: Apartment created successfully }
 *       403: { description: Subscription limit reached }
 * 
 * /api/apartments-handler/apartments/member:
 *   get:
 *     summary: Get apartments where user is a member or creator
 *     tags: [Apartments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of user apartments }
 * 
 * /api/apartments-handler/apartments/assign-members:
 *   put:
 *     summary: Assign members to an apartment
 *     tags: [Apartments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [apartmentId, members]
 *             properties:
 *               apartmentId: { type: string }
 *               members: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Members assigned successfully }
 * 
 * /api/apartments-handler/apartments/update-name:
 *   put:
 *     summary: Update apartment name
 *     tags: [Apartments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [apartmentId, name]
 *             properties:
 *               apartmentId: { type: string }
 *               name: { type: string }
 *     responses:
 *       200: { description: Apartment name updated }
 * 
 * /api/apartments-handler/apartments/delete/{id}:
 *   delete:
 *     summary: Delete apartment by ID
 *     tags: [Apartments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Apartment deleted }
 * 
 * /api/apartments-handler/apartments/{id}/members:
 *   get:
 *     summary: Get all members of an apartment
 *     tags: [Apartments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of apartment members }
 * 
 * /api/apartments-handler/apartments/{apartmentId}/remover-member/{memberId}:
 *   delete:
 *     summary: Remove a member from an apartment
 *     tags: [Apartments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: apartmentId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Member removed }
 * 
 * /api/apartments-handler/apartments/{apartmentId}/exit:
 *   put:
 *     summary: Exit an apartment
 *     tags: [Apartments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: apartmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Exited apartment successfully }
 */

router.post('/apartments/create-apartment', protect, checkApartmentLimits, createApartment);
router.get('/apartments/member', protect, getApartmentsByMember);
router.put('/apartments/assign-members', protect, assignMembers);
router.put('/apartments/update-name', protect, updateApartmentName);
router.delete('/apartments/delete/:id', protect, deleteApartment);
router.get('/apartments/:id/members', protect, getApartmentMembers);
router.delete('/apartments/:apartmentId/remover-member/:memberId', protect, removeMember);
router.put('/apartments/:apartmentId/exit', protect, exitApartment);

module.exports = router;