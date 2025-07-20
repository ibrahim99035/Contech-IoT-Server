function normalizeState(state) {
  // Handle different input types and normalize to consistent string values
  if (state === null || state === undefined) {
    return 'off';
  }
  
  // Convert to string and lowercase for comparison
  const stateStr = String(state).toLowerCase().trim();
  
  // Handle boolean-like values
  if (stateStr === 'true' || stateStr === '1' || stateStr === 'on' || stateStr === 'active') {
    return 'on';
  }
  
  if (stateStr === 'false' || stateStr === '0' || stateStr === 'off' || stateStr === 'inactive') {
    return 'off';
  }
  
  // Handle numeric values (for dimmers, etc.)
  const numValue = Number(state);
  if (!isNaN(numValue)) {
    if (numValue > 0) {
      return numValue.toString();
    } else {
      return 'off';
    }
  }
  
  // Return the original state if it doesn't match common patterns
  return stateStr;
}

module.exports = { normalizeState };