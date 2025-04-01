/**
 * Checks if a user has access to a specific device
 * @param {Object} device - Device document
 * @param {String} userId - User ID to check
 * @returns {Boolean} - Whether user has access
 */
function checkDeviceAccess(device, userId) {
    return device.creator.equals(userId) || device.users.includes(userId);
}
  
/**
 * Checks if a user has access to a specific room
 * @param {Object} room - Room document
 * @param {String} userId - User ID to check
 * @returns {Boolean} - Whether user has access
 */
function checkRoomAccess(room, userId) {
    return room.creator.equals(userId) || room.users.includes(userId);
}

/**
 * Checks if a user has access to a specific apartment
 * @param {Object} apartment - Apartment document
 * @param {String} userId - User ID to check
 * @returns {Boolean} - Whether user has access
 */
function checkApartmentAccess(apartment, userId) {
    return apartment.creator.equals(userId) || apartment.users.includes(userId);
}

module.exports = {
    checkDeviceAccess,
    checkRoomAccess,
    checkApartmentAccess
};