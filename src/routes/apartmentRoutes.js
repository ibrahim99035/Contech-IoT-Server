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


/**
 * @route   POST /api/apartments/create-apartment
 * @desc    Create a new apartment. Automatically adds the creator as a member.
 * @access  Protected (Requires authentication)
 */
router.post('/apartments/create-apartment', protect, createApartment);

/**
 * @route   GET /api/apartments/member
 * @desc    Retrieve a list of apartments the authenticated user is a member of.
 *          Includes details about the apartment creator and associated rooms.
 * @access  Protected (Requires authentication)
 */
router.get('/apartments/member', protect, getApartmentsByMember);

/**
 * @route   PUT /api/apartments/assign-members
 * @desc    Add members to an existing apartment. Only the creator of the apartment 
 *          is allowed to perform this action.
 * @body    { apartmentId: string, members: array<string> }
 * @access  Protected (Requires authentication)
 */
router.put('/apartments/assign-members', protect, assignMembers);

/**
 * @route   PUT /api/apartments/update-name
 * @desc    Update the name of an existing apartment. Only the creator of the apartment
 *          is allowed to perform this action.
 * @body    { apartmentId: string, name: string }
 * @access  Protected (Requires authentication)
 */
router.put('/apartments/update-name', protect, updateApartmentName);

/**
 * @route   DELETE /api/apartments/delete/:id
 * @desc    Delete an apartment and cascade-delete related resources (rooms, devices, etc.).
 *          Only the creator of the apartment is allowed to perform this action.
 * @params  { id: string } - The ID of the apartment to delete.
 * @access  Protected (Requires authentication)
 */
router.delete('/apartments/delete/:id', protect, deleteApartment);

/**
 * @route   GET /api/apartments/:id/members
 * @desc    Get all members of a specific apartment, including the creator.
 * @params  { id: string } - The ID of the apartment.
 * @access  Protected (Requires authentication)
 */
router.get('/apartments/:id/members', protect, getApartmentMembers);

/**
 * @route   DELETE /api/apartments/:apartmentId/remover-member/:memberId
 * @desc    Get all members of a specific apartment, including the creator.
 * @params  { id: string } - The ID of the apartment.
 * @access  Protected (Requires authentication)
 */
router.delete('/apartments/:apartmentId/remover-member/:memberId', protect, removeMember);

/**
 * @route   GET /api/apartments/:apartmentId/exit
 * @desc    Get all members of a specific apartment, including the creator.
 * @params  { id: string } - The ID of the apartment.
 * @access  Protected (Requires authentication)
 */
router.put('/apartments/:apartmentId/exit', protect, exitApartment);

module.exports = router;