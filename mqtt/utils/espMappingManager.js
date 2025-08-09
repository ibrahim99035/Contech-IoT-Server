/**
 * ESP Mapping Manager - Handles ESP to Room mappings and connections
 * In production, this should be backed by Redis or a database
 */
class EspMappingManager {
  constructor() {
    // ESP-Room mapping storage
    this.espRoomMappings = new Map();
    
    // Room-ESP connections tracking
    this.roomEspConnections = new Map();
  }

  /**
   * Set ESP room mapping
   * @param {String} espId - ESP device identifier
   * @param {Object} mappingData - Mapping data object
   */
  setMapping(espId, mappingData) {
    this.espRoomMappings.set(espId, mappingData);
    console.log(`ESP mapping set for ${espId} -> Room ${mappingData.roomId}`);
  }

  /**
   * Get ESP room mapping
   * @param {String} espId - ESP device identifier
   * @returns {Object|undefined} Mapping data or undefined if not found
   */
  getMapping(espId) {
    return this.espRoomMappings.get(espId);
  }

  /**
   * Remove ESP room mapping
   * @param {String} espId - ESP device identifier
   * @returns {boolean} True if mapping was deleted, false if not found
   */
  removeMapping(espId) {
    const result = this.espRoomMappings.delete(espId);
    if (result) {
      console.log(`ESP mapping removed for ${espId}`);
    }
    return result;
  }

  /**
   * Add ESP to room connections
   * @param {String} roomId - Room identifier
   * @param {String} espId - ESP device identifier
   */
  addRoomConnection(roomId, espId) {
    if (!this.roomEspConnections.has(roomId)) {
      this.roomEspConnections.set(roomId, new Set());
    }
    this.roomEspConnections.get(roomId).add(espId);
    console.log(`ESP ${espId} added to room ${roomId} connections`);
  }

  /**
   * Remove ESP from room connections
   * @param {String} roomId - Room identifier
   * @param {String} espId - ESP device identifier
   */
  removeRoomConnection(roomId, espId) {
    if (this.roomEspConnections.has(roomId)) {
      const roomConnections = this.roomEspConnections.get(roomId);
      roomConnections.delete(espId);
      
      // Clean up empty room connection sets
      if (roomConnections.size === 0) {
        this.roomEspConnections.delete(roomId);
      }
      
      console.log(`ESP ${espId} removed from room ${roomId} connections`);
    }
  }

  /**
   * Check if a room has any ESP connections
   * @param {String} roomId - Room identifier
   * @returns {boolean} True if room has ESP connections
   */
  hasRoomConnections(roomId) {
    const connections = this.roomEspConnections.get(roomId);
    return connections && connections.size > 0;
  }

  /**
   * Get all ESPs connected to a room
   * @param {String} roomId - Room identifier
   * @returns {Set} Set of ESP IDs connected to the room
   */
  getRoomConnections(roomId) {
    return this.roomEspConnections.get(roomId) || new Set();
  }

  /**
   * Get all ESP mappings (for debugging)
   * @returns {Map} All ESP room mappings
   */
  getAllMappings() {
    return new Map(this.espRoomMappings);
  }

  /**
   * Get all room connections (for debugging)
   * @returns {Map} All room ESP connections
   */
  getAllRoomConnections() {
    return new Map(this.roomEspConnections);
  }

  /**
   * Get statistics about current mappings
   * @returns {Object} Statistics object
   */
  getStats() {
    const totalEsps = this.espRoomMappings.size;
    const totalRoomsWithEsps = this.roomEspConnections.size;
    
    let totalConnections = 0;
    for (const connections of this.roomEspConnections.values()) {
      totalConnections += connections.size;
    }

    return {
      totalEsps,
      totalRoomsWithEsps,
      totalConnections,
      mappings: Array.from(this.espRoomMappings.entries()).map(([espId, mapping]) => ({
        espId,
        roomId: mapping.roomId,
        roomName: mapping.roomName,
        authenticatedAt: mapping.authenticatedAt,
        deviceCount: mapping.devices.length
      }))
    };
  }

  /**
   * Clear all mappings and connections
   */
  clear() {
    this.espRoomMappings.clear();
    this.roomEspConnections.clear();
    console.log('All ESP mappings and connections cleared');
  }

  /**
   * Check if an ESP is currently authenticated
   * @param {String} espId - ESP device identifier
   * @returns {boolean} True if ESP is authenticated
   */
  isAuthenticated(espId) {
    return this.espRoomMappings.has(espId);
  }

  /**
   * Get ESP authentication time
   * @param {String} espId - ESP device identifier
   * @returns {Date|null} Authentication time or null if not authenticated
   */
  getAuthenticationTime(espId) {
    const mapping = this.espRoomMappings.get(espId);
    return mapping ? mapping.authenticatedAt : null;
  }

  /**
   * Update device information for an ESP
   * @param {String} espId - ESP device identifier
   * @param {Array} devices - Updated devices array
   */
  updateEspDevices(espId, devices) {
    const mapping = this.espRoomMappings.get(espId);
    if (mapping) {
      mapping.devices = devices;
      mapping.lastUpdated = new Date();
      console.log(`Updated device information for ESP ${espId}`);
    }
  }
}

module.exports = { EspMappingManager };