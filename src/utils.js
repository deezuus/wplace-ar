/**
 * Utility functions and helpers
 */

/**
 * Check if the current context is secure (HTTPS or localhost)
 */
export function isSecure() {
  return location.protocol === 'https:' ||
         location.hostname === 'localhost' ||
         location.hostname === '127.0.0.1';
}

/**
 * Check if we're on a mobile device
 */
export function isMobileDevice() {
  // Check user agent for mobile devices
  const userAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Check for touch-only devices (exclude desktop with touch screens)
  const touchOnlyDevice = navigator.maxTouchPoints > 0 && 
                         !window.matchMedia('(pointer: fine)').matches;
  
  const isMobile = userAgentMobile || touchOnlyDevice;
  
  // Debug logging
  console.log('Mobile detection:', {
    userAgent: navigator.userAgent,
    userAgentMobile,
    maxTouchPoints: navigator.maxTouchPoints,
    hasFinePpointer: window.matchMedia('(pointer: fine)').matches,
    touchOnlyDevice,
    finalResult: isMobile
  });
  
  return isMobile;
}

/**
 * Request motion permission for iOS 13+ devices
 * Returns true if permission granted or not needed, false otherwise
 */
export async function ensureMotionPermission() {
  if (!isSecure()) console.warn('Motion permission requires HTTPS or localhost');
  
  // First check if we're on a mobile device
  if (!isMobileDevice()) {
    return false; // Desktop - no motion permission needed
  }
  
  let granted = false;
  const DM = window.DeviceMotionEvent;
  const DO = window.DeviceOrientationEvent;
  try {
    const asks = [];
    if (DM && typeof DM.requestPermission === 'function') asks.push(DM.requestPermission());
    if (DO && typeof DO.requestPermission === 'function') asks.push(DO.requestPermission());
    if (asks.length) {
      const results = await Promise.allSettled(asks);
      granted = results.some(r => r.status === 'fulfilled' && r.value === 'granted');
    } else {
      granted = true; // Android: no explicit request API but is mobile
    }
  } catch (e) {
    console.warn('Motion permission error:', e);
  }
  return granted;
}

/**
 * Calculate distance between two lat/lon coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Convert lat/lon to tile coordinates using Mercator projection
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} zoom - Zoom level
 * @param {number} tileSize - Size of each tile in pixels/units
 * @returns {Object} Object with tileX, tileY, pixelX, pixelY
 */
export function latLonToTile(lat, lon, zoom, tileSize = 1000) {
  const x = (lon + 180) / 360;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) / Math.PI) / 2;
  const n = Math.pow(2, zoom);
  const tileX = Math.floor(x * n);
  const tileY = Math.floor(y * n);
  const pixelX = Math.floor((x * n - tileX) * tileSize);
  const pixelY = Math.floor((y * n - tileY) * tileSize);
  return { tileX, tileY, pixelX, pixelY };
}

