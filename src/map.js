/**
 * Leaflet map functionality for location selection
 */
import { FALLBACK } from './config.js';
import {
  getGpsOverride,
  getCurrentLocation,
  getSelectedLocation,
  setSelectedLocation,
  getModalOriginalSettings
} from './geolocation.js';

// Map system
let locationMap = null; // Leaflet map instance
let locationMarker = null; // Marker for selected location

// UI element references (will be set by ui.js)
let selectedCoordsDisplay = null;
let liveTrackingToggle = null;
let updateFrequencySelect = null;
let gpsLatInput = null;
let gpsLonInput = null;
let manualInputs = null;
let toggleManual = null;

/**
 * Set UI element references
 */
export function setUIElements(elements) {
  selectedCoordsDisplay = elements.selectedCoordsDisplay;
  liveTrackingToggle = elements.liveTrackingToggle;
  updateFrequencySelect = elements.updateFrequencySelect;
  gpsLatInput = elements.gpsLatInput;
  gpsLonInput = elements.gpsLonInput;
  manualInputs = elements.manualInputs;
  toggleManual = elements.toggleManual;
}

/**
 * Update selected location display in UI
 */
function updateSelectedLocationDisplay() {
  if (!selectedCoordsDisplay) return;
  
  const selectedLocation = getSelectedLocation();
  if (selectedLocation) {
    selectedCoordsDisplay.textContent = 
      `${selectedLocation.lat.toFixed(6)}, ${selectedLocation.lon.toFixed(6)}`;
  } else {
    selectedCoordsDisplay.textContent = 'Click on map to select';
  }
}

/**
 * Initialize the Leaflet map
 */
export function initializeMap() {
  const mapContainer = document.getElementById('location-map');
  if (!mapContainer) return;
  
  // Get current location for map center (override takes precedence, then real GPS, then fallback)
  const gpsOverride = getGpsOverride();
  const currentLocation = getCurrentLocation();
  const currentLat = gpsOverride?.lat || currentLocation?.lat || FALLBACK.lat;
  const currentLon = gpsOverride?.lon || currentLocation?.lon || FALLBACK.lon;
  
  if (!locationMap) {
    // First time initialization - create the map
    locationMap = L.map('location-map').setView([currentLat, currentLon], 10);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(locationMap);
    
    // Add marker for selected location
    locationMarker = L.marker([currentLat, currentLon], {
      draggable: true
    }).addTo(locationMap);
  } else {
    // Map already exists - update marker and view to current location
    locationMarker.setLatLng([currentLat, currentLon]);
    locationMap.setView([currentLat, currentLon], locationMap.getZoom());
  }
  
  // Set/update selected location to current position
  setSelectedLocation({ lat: currentLat, lon: currentLon });
  updateSelectedLocationDisplay();
  
  // Handle map clicks
  locationMap.on('click', function(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    
    // Update marker position
    locationMarker.setLatLng([lat, lon]);
    
    // Update selected location
    setSelectedLocation({ lat, lon });
    updateSelectedLocationDisplay();
    
    // Instantly disable tracking toggle and frequency dropdown to show user it will be turned off
    if (liveTrackingToggle) {
      liveTrackingToggle.checked = false;
      liveTrackingToggle.disabled = true;
    }
    if (updateFrequencySelect) {
      updateFrequencySelect.disabled = true;
    }
    
    console.log('Map clicked:', getSelectedLocation());
  });
  
  // Handle marker drag
  locationMarker.on('dragend', function(e) {
    const position = e.target.getLatLng();
    const lat = position.lat;
    const lon = position.lng;
    
    // Update selected location
    setSelectedLocation({ lat, lon });
    updateSelectedLocationDisplay();
    
    // Instantly disable tracking toggle and frequency dropdown to show user it will be turned off
    if (liveTrackingToggle) {
      liveTrackingToggle.checked = false;
      liveTrackingToggle.disabled = true;
    }
    if (updateFrequencySelect) {
      updateFrequencySelect.disabled = true;
    }
    
    console.log('Marker dragged:', getSelectedLocation());
  });
  
  // Invalidate size after modal is shown (fixes display issues)
  setTimeout(() => {
    if (locationMap) {
      locationMap.invalidateSize();
    }
  }, 100);
}

/**
 * Toggle manual input visibility
 */
export function toggleManualInput() {
  if (!manualInputs) return;
  
  const isHidden = manualInputs.classList.contains('hidden');
  
  if (isHidden) {
    manualInputs.classList.remove('hidden');
    toggleManual.textContent = '🗺️ Use Map';
    
    // Pre-fill with selected location
    const selectedLocation = getSelectedLocation();
    if (selectedLocation && gpsLatInput && gpsLonInput) {
      gpsLatInput.value = selectedLocation.lat;
      gpsLonInput.value = selectedLocation.lon;
    }
  } else {
    manualInputs.classList.add('hidden');
    toggleManual.textContent = '📝 Manual Input';
  }
}

/**
 * Apply manually entered coordinates
 */
export function applyManualCoordinates() {
  if (!gpsLatInput || !gpsLonInput) return;
  
  const lat = parseFloat(gpsLatInput.value);
  const lon = parseFloat(gpsLonInput.value);
  
  // Validate inputs
  if (isNaN(lat) || isNaN(lon)) {
    alert('Please enter valid latitude and longitude values.');
    return;
  }
  
  if (lat < -90 || lat > 90) {
    alert('Latitude must be between -90 and 90 degrees.');
    return;
  }
  
  if (lon < -180 || lon > 180) {
    alert('Longitude must be between -180 and 180 degrees.');
    return;
  }
  
  // Update map and marker
  if (locationMap && locationMarker) {
    locationMap.setView([lat, lon], locationMap.getZoom());
    locationMarker.setLatLng([lat, lon]);
  }
  
  // Update selected location
  setSelectedLocation({ lat, lon });
  updateSelectedLocationDisplay();
  
  // Instantly disable tracking toggle and frequency dropdown to show user it will be turned off
  if (liveTrackingToggle) {
    liveTrackingToggle.checked = false;
    liveTrackingToggle.disabled = true;
  }
  if (updateFrequencySelect) {
    updateFrequencySelect.disabled = true;
  }
  
  // Hide manual inputs
  manualInputs.classList.add('hidden');
  toggleManual.textContent = '📝 Manual Input';
  
  console.log('Manual coordinates applied:', getSelectedLocation());
}

/**
 * Update map marker and view to a specific location
 */
export function updateMapLocation(lat, lon) {
  if (locationMap && locationMarker) {
    locationMarker.setLatLng([lat, lon]);
    locationMap.setView([lat, lon], locationMap.getZoom());
    updateSelectedLocationDisplay();
  }
}

