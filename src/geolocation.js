/**
 * GPS location management and tracking
 */
import { FALLBACK, GPS_UPDATE_INTERVAL, GPS_DISTANCE_THRESHOLD } from './config.js';
import { calculateDistance } from './utils.js';

// GPS override system
let gpsOverride = null; // { lat: number, lon: number } or null for real GPS
let currentLocation = null; // Store current actual location for display
let selectedLocation = null; // Store location selected on map

// GPS Live Tracking System
let isLiveTrackingEnabled = true; // Toggle for live GPS tracking
let gpsUpdateInterval = GPS_UPDATE_INTERVAL; // Update frequency in seconds
let gpsDistanceThreshold = GPS_DISTANCE_THRESHOLD; // Minimum distance in meters before reloading
let gpsTrackingIntervalId = null; // ID for the tracking interval
let lastKnownPosition = null; // Store last position to calculate distance moved

// Store original settings when modal opens (for cancellation)
let modalOriginalSettings = {
  isLiveTrackingEnabled: true,
  gpsUpdateInterval: GPS_UPDATE_INTERVAL,
  selectedLocation: null
};

// Callback for refreshing tiles (set by tiles module)
let refreshTilesCallback = null;
// Callback for updating UI display (set by ui module)
let updateCurrentLocationDisplayCallback = null;

/**
 * Set callback for refreshing tiles when location changes
 */
export function setRefreshTilesCallback(callback) {
  refreshTilesCallback = callback;
}

/**
 * Set callback for updating location display in UI
 */
export function setUpdateCurrentLocationDisplayCallback(callback) {
  updateCurrentLocationDisplayCallback = callback;
}

/**
 * Show alert when fallback location is used
 */
function showFallbackLocationAlert() {
  alert('GPS location access is not available. \n\nThe app will use a default location instead.  \n\nIf you\'re on an embedded browser in Discord for example, please switch to a main browser for GPS functionality.');
}

/**
 * Get current location once (either override or real GPS)
 * @returns {Promise<{lat: number, lon: number}>}
 */
export function getLatLonOnce() {
  return new Promise((resolve) => {
    // If GPS override is active, use it immediately
    if (gpsOverride) {
      console.log('Using GPS override:', gpsOverride);
      resolve(gpsOverride);
      return;
    }
    
    // Otherwise get real GPS location
    if (!navigator.geolocation) {
      showFallbackLocationAlert();
      const location = FALLBACK;
      currentLocation = location;
      return resolve(location);
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const location = { lat: p.coords.latitude, lon: p.coords.longitude };
        currentLocation = location;
        lastKnownPosition = location; // Store for tracking system
        console.log('Real GPS location:', location);
        resolve(location);
      },
      () => {
        showFallbackLocationAlert();
        const location = FALLBACK;
        currentLocation = location;
        lastKnownPosition = location; // Store for tracking system
        resolve(location);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
    );
  });
}

/**
 * Start periodic GPS tracking
 */
export function startGPSTracking() {
  // Don't start tracking if override is active (user manually set a location)
  if (gpsOverride) {
    console.log('GPS tracking not started - override is active');
    return;
  }
  
  // Clear any existing tracking interval
  stopGPSTracking();
  
  console.log(`Starting GPS tracking: interval=${gpsUpdateInterval}s, threshold=${gpsDistanceThreshold}m`);
  
  gpsTrackingIntervalId = setInterval(() => {
    // Skip if override is active (user manually set a location)
    if (gpsOverride) {
      console.log('Skipping GPS update - override is active');
      stopGPSTracking();
      return;
    }
    
    // Get current GPS position
    if (!navigator.geolocation) {
      console.warn('Geolocation not available');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLat = position.coords.latitude;
        const newLon = position.coords.longitude;
        
        console.log(`GPS update: ${newLat.toFixed(6)}, ${newLon.toFixed(6)}`);
        
        // Check if we've moved enough to warrant a reload
        if (lastKnownPosition) {
          const distance = calculateDistance(
            lastKnownPosition.lat,
            lastKnownPosition.lon,
            newLat,
            newLon
          );
          
          console.log(`Distance moved: ${distance.toFixed(2)}m (threshold: ${gpsDistanceThreshold}m)`);
          
          if (distance > gpsDistanceThreshold) {
            console.log('Distance threshold exceeded - reloading tiles');
            lastKnownPosition = { lat: newLat, lon: newLon };
            currentLocation = { lat: newLat, lon: newLon };
            refreshLocationAndTiles();
          } else {
            console.log('Distance below threshold - no reload needed');
          }
        } else {
          // First update - just store position
          lastKnownPosition = { lat: newLat, lon: newLon };
          currentLocation = { lat: newLat, lon: newLon };
          console.log('Initial position stored');
        }
      },
      (error) => {
        console.warn('GPS tracking error:', error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, gpsUpdateInterval * 1000); // Convert seconds to milliseconds
}

/**
 * Stop periodic GPS tracking
 */
export function stopGPSTracking() {
  if (gpsTrackingIntervalId) {
    clearInterval(gpsTrackingIntervalId);
    gpsTrackingIntervalId = null;
    console.log('GPS tracking stopped');
  }
}

/**
 * Function to refresh location and reload tiles
 */
export function refreshLocationAndTiles() {
  console.log('Refreshing location and tiles...');
  
  getLatLonOnce().then(({ lat, lon }) => {
    console.log(`Refreshing tiles for location: ${lat}, ${lon}`);
    
    // Call the tiles refresh callback if set
    if (refreshTilesCallback) {
      refreshTilesCallback(lat, lon);
    }
    
    // Update current location display if modal is open
    if (updateCurrentLocationDisplayCallback) {
      updateCurrentLocationDisplayCallback();
    }
    
    console.log('Tiles refreshed successfully');
  }).catch(error => {
    console.error('Failed to refresh tiles:', error);
  });
}

// Getters and setters for state
export function getGpsOverride() {
  return gpsOverride;
}

export function setGpsOverride(override) {
  gpsOverride = override;
}

export function getCurrentLocation() {
  return currentLocation;
}

export function setCurrentLocation(location) {
  currentLocation = location;
}

export function getSelectedLocation() {
  return selectedLocation;
}

export function setSelectedLocation(location) {
  selectedLocation = location;
}

export function getIsLiveTrackingEnabled() {
  return isLiveTrackingEnabled;
}

export function setIsLiveTrackingEnabled(enabled) {
  isLiveTrackingEnabled = enabled;
}

export function getGpsUpdateInterval() {
  return gpsUpdateInterval;
}

export function setGpsUpdateInterval(interval) {
  gpsUpdateInterval = interval;
}

export function getGpsDistanceThreshold() {
  return gpsDistanceThreshold;
}

export function setGpsDistanceThreshold(threshold) {
  gpsDistanceThreshold = threshold;
}

export function getLastKnownPosition() {
  return lastKnownPosition;
}

export function setLastKnownPosition(position) {
  lastKnownPosition = position;
}

export function getModalOriginalSettings() {
  return modalOriginalSettings;
}

export function setModalOriginalSettings(settings) {
  modalOriginalSettings = settings;
}

