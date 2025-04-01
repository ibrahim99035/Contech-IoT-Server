/**
 * Normalizes different state representations to a consistent format
 * @param {*} state - The state to normalize ('on', 'off', true, false)
 * @returns {string} - Normalized state ('on' or 'off')
 */
function normalizeState(state) {
    return state === true || state === 'on' ? 'on' : 'off';
}

module.exports = {
    normalizeState
};