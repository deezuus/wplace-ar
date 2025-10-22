/**
 * wPlace AR Viewer - Main Application
 * TODO: change this into a AGENTS.MD architecture to test it out
 * A web-based augmented reality application that overlays r/place-style tile data
 * from the sky above the user's current location. Uses motion permission detection
 * to automatically switch between device orientation (mobile) and mouse controls (desktop).
 * 
 * FEATURES:
 * - Camera feed background using WebRTC getUserMedia
 * - Device orientation tracking (mobile) with adaptive smoothing
 * - Mouse look controls (desktop) with pitch/yaw rotation
 * - Geolocation-based tile loading from wPlace proxy API
 * - Sky-positioned plane displaying tile texture at configurable height
 * - Cross-platform support (iOS/Android/Desktop)
 * - Permission handling for motion sensors (iOS 13+)
 * - Automatic fallback to Toronto coordinates if geolocation fails
 * 
 * TECHNICAL DETAILS:
 * - Built with Three.js WebGL renderer with grouped tile management
 * - Uses Mercator projection for lat/lon to tile coordinate conversion
 * - Adaptive quaternion smoothing for natural device orientation tracking
 * - Precise pixel-level positioning within tiles
 * - 80° FOV camera for immersive AR experience
 * 
 * CONTROLS:
 * - Mobile: Device orientation (gyroscope/accelerometer)
 * - Desktop: Mouse drag to look around
 * - "Start AR" button initializes camera and orientation
 * 
 * CONFIGURATION:
 * - ZOOM_LEVEL: Map zoom level for tile resolution (default: 11)
 * - TILE_SIZE: Size of each tile in 3D units (default: 1000)
 * - SKY_HEIGHT: Height of plane above user (default: 100 units)
 * - TAU_BASE/TAU_SLOW: Smoothing time constants for orientation tracking
 */

// main.js
import * as THREE from 'three';
import { DeviceOrientationControls } from 'three-stdlib';

// ---------- renderer / scene / camera ----------
const canvas = document.getElementById('glscene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 15000);

// ---------- fog parameters for distance-based fading ----------
// TILE_SIZE is 1000, so with a 3x3 grid, adjacent tiles are at distances of ~1000-1414 units
const fogNear = 500;  // Start fading just beyond adjacent tiles
const fogFar = 1800; // Completely fade

// ---------- camera feed background ----------
const video = document.createElement('video');
video.setAttribute('playsinline', '');
video.muted = true;
let videoStarted = false;

async function startVideo() {
  if (videoStarted) return;
  videoStarted = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }, audio: false
    });
    video.srcObject = stream;
    await video.play();
    const videoTex = new THREE.VideoTexture(video);
    videoTex.minFilter = THREE.LinearFilter;
    videoTex.magFilter = THREE.LinearFilter;
    scene.background = videoTex;
  } catch (err) {
    console.warn('getUserMedia error:', err);
  }
}

// ---------- device orientation (3-DoF) ----------
const orientationProxy = new THREE.Object3D();
let controls = null;
let hasDeviceOrientation = false;

// Desktop mouse look controls
let isMouseDown = false;
let mouseX = 0;
let mouseY = 0;
let cameraRotationX = 0; // pitch (up/down)
let cameraRotationY = 0; // yaw (left/right)



// Desktop mouse look controls functions
function onMouseDown(event) {
  isMouseDown = true;
  mouseX = event.clientX;
  mouseY = event.clientY;
  canvas.style.cursor = 'grabbing';
}

function onMouseUp() {
  isMouseDown = false;
  canvas.style.cursor = 'grab';
}

function onMouseMove(event) {
  if (!isMouseDown || hasDeviceOrientation) return;
  
  const deltaX = event.clientX - mouseX;
  const deltaY = event.clientY - mouseY;
  
  mouseX = event.clientX;
  mouseY = event.clientY;
  
  // Sensitivity factor
  const sensitivity = 0.002;
  
  // Update rotation (yaw and pitch)
  cameraRotationY -= deltaX * sensitivity; // left/right
  cameraRotationX -= deltaY * sensitivity; // up/down
  
  // Clamp pitch to prevent over-rotation
  cameraRotationX = Math.max(-Math.PI/2, Math.min(Math.PI/2, cameraRotationX));
  
  // Apply rotation to camera
  camera.rotation.order = 'YXZ';
  camera.rotation.x = cameraRotationX;
  camera.rotation.y = cameraRotationY;
}

// Adaptive smoothing (snappy)
let smoothQ = new THREE.Quaternion();
let orientationInitialized = false;
let lastT = performance.now();
// Tunables: base/slow time constants for the EMA (seconds)
const TAU_BASE = 0.03; // fast response on quick turns (~30ms)
const TAU_SLOW = 0.12; // slightly smoother when steady (~120ms)

// ---------- iOS motion permission ----------
function isSecure() {
  return location.protocol === 'https:' ||
         location.hostname === 'localhost' ||
         location.hostname === '127.0.0.1';
}


// Check if we're on a mobile device
function isMobileDevice() {
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

async function ensureMotionPermission() {
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

// TODO: break up this file into smaller files this shit is so hard to read after like a month
// ---------- GPS override system ----------
let gpsOverride = null; // { lat: number, lon: number } or null for real GPS
let currentLocation = null; // Store current actual location for display
let selectedLocation = null; // Store location selected on map

// ---------- GPS Live Tracking System ----------
let isLiveTrackingEnabled = true; // Toggle for live GPS tracking
let gpsUpdateInterval = 25; // Update frequency in seconds (default 25s)
let gpsDistanceThreshold = 15; // Minimum distance in meters before reloading (default 15m)
let gpsTrackingIntervalId = null; // ID for the tracking interval
let lastKnownPosition = null; // Store last position to calculate distance moved

// Store original settings when modal opens (for cancellation)
let modalOriginalSettings = {
  isLiveTrackingEnabled: true,
  gpsUpdateInterval: 25,
  selectedLocation: null
};

// Calculate distance between two lat/lon coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
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

// Start periodic GPS tracking
function startGPSTracking() {
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

// Stop periodic GPS tracking
function stopGPSTracking() {
  if (gpsTrackingIntervalId) {
    clearInterval(gpsTrackingIntervalId);
    gpsTrackingIntervalId = null;
    console.log('GPS tracking stopped');
  }
}

// ---------- Map system ----------
let locationMap = null; // Leaflet map instance
let locationMarker = null; // Marker for selected location

// ---------- UI element references (to be set after DOM loads) ----------
let startScreen, arInterface, startBtn;
let photoBtn, gpsBtn, toggleUiBtn;
let gpsModal, gpsModalClose, gpsLatInput, gpsLonInput;
let gpsUseCurrent, gpsApply, currentCoordsDisplay;
let toggleManual, manualInputs, applyManual, selectedCoordsDisplay;
let heightSlider, heightValue, heightControl;
let opacitySlider, opacityValue, opacityControl;
let interactionPrompt, promptText;
let liveTrackingToggle, updateFrequencySelect;

// Initialize UI elements when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  startScreen = document.getElementById('start-screen');
  arInterface = document.getElementById('ar-interface');
  startBtn = document.getElementById('start-btn');
  photoBtn = document.getElementById('photo-btn');
  gpsBtn = document.getElementById('gps-btn');
  toggleUiBtn = document.getElementById('toggle-ui-btn');
  
  // GPS Modal elements
  gpsModal = document.getElementById('gps-modal');
  gpsModalClose = document.getElementById('gps-modal-close');
  gpsLatInput = document.getElementById('gps-lat');
  gpsLonInput = document.getElementById('gps-lon');
  gpsUseCurrent = document.getElementById('gps-use-current');
  gpsApply = document.getElementById('gps-apply');
  currentCoordsDisplay = document.getElementById('current-coords');
  toggleManual = document.getElementById('toggle-manual');
  manualInputs = document.getElementById('manual-inputs');
  applyManual = document.getElementById('apply-manual');
  selectedCoordsDisplay = document.getElementById('selected-coords');
  
  // Height control elements
  heightSlider = document.getElementById('height-slider');
  heightValue = document.getElementById('height-value');
  heightControl = document.getElementById('height-control');
  
  // Opacity control elements
  opacitySlider = document.getElementById('opacity-slider');
  opacityValue = document.getElementById('opacity-value');
  opacityControl = document.getElementById('opacity-control');
  
  // Interaction prompt elements
  interactionPrompt = document.getElementById('interaction-prompt');
  promptText = document.querySelector('.prompt-text');
  
  // GPS tracking settings elements
  liveTrackingToggle = document.getElementById('live-tracking-toggle');
  updateFrequencySelect = document.getElementById('update-frequency');
  
  // All UI elements are now properly initialized
  
  // Add event listeners
  if (startBtn) startBtn.addEventListener('click', startAR);
  if (photoBtn) photoBtn.addEventListener('click', capturePhoto);
  if (gpsBtn) gpsBtn.addEventListener('click', openGPSModal);
  if (toggleUiBtn) toggleUiBtn.addEventListener('click', toggleUIVisibility);
  if (gpsModalClose) gpsModalClose.addEventListener('click', closeGPSModal);
  if (gpsUseCurrent) gpsUseCurrent.addEventListener('click', useCurrentGPS);
  if (gpsApply) gpsApply.addEventListener('click', applySelectedLocation);
  if (toggleManual) toggleManual.addEventListener('click', toggleManualInput);
  if (applyManual) applyManual.addEventListener('click', applyManualCoordinates);
  if (heightSlider) heightSlider.addEventListener('input', updatePlaneHeight);
  if (opacitySlider) opacitySlider.addEventListener('input', updatePlaneOpacity);
  
  // GPS tracking settings event listeners
  if (liveTrackingToggle) {
    liveTrackingToggle.addEventListener('change', (e) => {
      isLiveTrackingEnabled = e.target.checked;
      
      // Save this change immediately (user manually toggled, not from map interaction)
      // This ensures the setting persists even if modal is closed
      modalOriginalSettings.isLiveTrackingEnabled = isLiveTrackingEnabled;
      
      console.log('Live tracking:', isLiveTrackingEnabled ? 'enabled' : 'disabled');
      
      // Restart tracking with new setting
      if (started && !gpsOverride) {
        if (isLiveTrackingEnabled) {
          startGPSTracking();
        } else {
          stopGPSTracking();
        }
      }
    });
  }
  
  if (updateFrequencySelect) {
    updateFrequencySelect.addEventListener('change', (e) => {
      gpsUpdateInterval = parseInt(e.target.value);
      
      // Save this change immediately (user manually changed frequency)
      modalOriginalSettings.gpsUpdateInterval = gpsUpdateInterval;
      
      console.log('Update frequency changed to:', gpsUpdateInterval, 'seconds');
      
      // Restart tracking with new interval (only if not overridden)
      if (started && isLiveTrackingEnabled && !gpsOverride) {
        startGPSTracking();
      }
    });
  }
  
  // Close modal when clicking outside
  if (gpsModal) {
    gpsModal.addEventListener('click', (e) => {
      if (e.target === gpsModal) closeGPSModal();
    });
  }
});



// ---------- Map functionality ----------
function initializeMap() {
  const mapContainer = document.getElementById('location-map');
  if (!mapContainer) return;
  
  // Get current location for map center (override takes precedence, then real GPS, then fallback)
  const currentLat = gpsOverride?.lat || currentLocation?.lat || FALLBACK.lat;
  const currentLon = gpsOverride?.lon || currentLocation?.lon || FALLBACK.lon;
  
  if (!locationMap) {
    // First time initialization - create the map
    locationMap = L.map('location-map').setView([currentLat, currentLon], 10);
    
    // Add OpenStreetMap tiles with dark theme
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
  selectedLocation = { lat: currentLat, lon: currentLon };
  updateSelectedLocationDisplay();
  
  // Handle map clicks
  locationMap.on('click', function(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    
    // Update marker position
    locationMarker.setLatLng([lat, lon]);
    
    // Update selected location
    selectedLocation = { lat, lon };
    updateSelectedLocationDisplay();
    
    // Instantly disable tracking toggle and frequency dropdown to show user it will be turned off
    if (liveTrackingToggle) {
      liveTrackingToggle.checked = false;
      liveTrackingToggle.disabled = true;
    }
    if (updateFrequencySelect) {
      updateFrequencySelect.disabled = true;
    }
    
    console.log('Map clicked:', selectedLocation);
  });
  
  // Handle marker drag
  locationMarker.on('dragend', function(e) {
    const position = e.target.getLatLng();
    const lat = position.lat;
    const lon = position.lng;
    
    // Update selected location
    selectedLocation = { lat, lon };
    updateSelectedLocationDisplay();
    
    // Instantly disable tracking toggle and frequency dropdown to show user it will be turned off
    if (liveTrackingToggle) {
      liveTrackingToggle.checked = false;
      liveTrackingToggle.disabled = true;
    }
    if (updateFrequencySelect) {
      updateFrequencySelect.disabled = true;
    }
    
    console.log('Marker dragged:', selectedLocation);
  });
  
  // Invalidate size after modal is shown (fixes display issues)
  setTimeout(() => {
    if (locationMap) {
      locationMap.invalidateSize();
    }
  }, 100);
}

function updateSelectedLocationDisplay() {
  if (!selectedCoordsDisplay) return;
  
  if (selectedLocation) {
    selectedCoordsDisplay.textContent = 
      `${selectedLocation.lat.toFixed(6)}, ${selectedLocation.lon.toFixed(6)}`;
  } else {
    selectedCoordsDisplay.textContent = 'Click on map to select';
  }
}

function toggleManualInput() {
  if (!manualInputs) return;
  
  const isHidden = manualInputs.classList.contains('hidden');
  
  if (isHidden) {
    manualInputs.classList.remove('hidden');
    toggleManual.textContent = '🗺️ Use Map';
    
    // Pre-fill with selected location
    if (selectedLocation) {
      gpsLatInput.value = selectedLocation.lat;
      gpsLonInput.value = selectedLocation.lon;
    }
  } else {
    manualInputs.classList.add('hidden');
    toggleManual.textContent = '📝 Manual Input';
  }
}

function applyManualCoordinates() {
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
  selectedLocation = { lat, lon };
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
  
  console.log('Manual coordinates applied:', selectedLocation);
}

// ---------- GPS modal functionality ----------
function openGPSModal() {
  if (!gpsModal) return;
  
  // Save current settings in case user cancels
  modalOriginalSettings = {
    isLiveTrackingEnabled: isLiveTrackingEnabled,
    gpsUpdateInterval: gpsUpdateInterval,
    selectedLocation: selectedLocation ? { ...selectedLocation } : null
  };
  
  // Set initial disabled state based on whether override is active
  if (liveTrackingToggle) {
    liveTrackingToggle.disabled = gpsOverride !== null;
  }
  if (updateFrequencySelect) {
    updateFrequencySelect.disabled = gpsOverride !== null;
  }
  
  gpsModal.classList.remove('hidden');
  
  // Initialize map after modal is shown
  setTimeout(() => {
    initializeMap();
  }, 50);
}

function closeGPSModal() {
  if (!gpsModal) return;
  
  console.log('Closing modal - original settings:', modalOriginalSettings);
  console.log('Current selectedLocation before restore:', selectedLocation);
  
  // Restore original settings (user cancelled without applying)
  isLiveTrackingEnabled = modalOriginalSettings.isLiveTrackingEnabled;
  gpsUpdateInterval = modalOriginalSettings.gpsUpdateInterval;
  selectedLocation = modalOriginalSettings.selectedLocation ? { ...modalOriginalSettings.selectedLocation } : null;
  
  console.log('Restored selectedLocation:', selectedLocation);
  
  // Update UI to reflect restored settings
  if (liveTrackingToggle) {
    liveTrackingToggle.checked = isLiveTrackingEnabled;
    liveTrackingToggle.disabled = gpsOverride !== null; // Restore disabled state based on override
  }
  if (updateFrequencySelect) {
    updateFrequencySelect.value = gpsUpdateInterval;
    updateFrequencySelect.disabled = gpsOverride !== null; // Restore disabled state based on override
  }
  
  // Restore map marker position and center map
  if (locationMap && locationMarker) {
    if (selectedLocation) {
      console.log('Restoring marker to:', selectedLocation);
      locationMarker.setLatLng([selectedLocation.lat, selectedLocation.lon]);
      locationMap.setView([selectedLocation.lat, selectedLocation.lon], locationMap.getZoom());
      updateSelectedLocationDisplay();
    } else {
      // If no selected location, restore to current/override location
      const restoreLat = gpsOverride?.lat || currentLocation?.lat || FALLBACK.lat;
      const restoreLon = gpsOverride?.lon || currentLocation?.lon || FALLBACK.lon;
      console.log('No saved location, restoring to current/fallback:', { lat: restoreLat, lon: restoreLon });
      locationMarker.setLatLng([restoreLat, restoreLon]);
      locationMap.setView([restoreLat, restoreLon], locationMap.getZoom());
      updateSelectedLocationDisplay();
    }
  }
  
  // Clear manual input fields
  if (gpsLatInput) gpsLatInput.value = '';
  if (gpsLonInput) gpsLonInput.value = '';
  
  // Hide manual inputs if they're showing
  if (manualInputs && !manualInputs.classList.contains('hidden')) {
    manualInputs.classList.add('hidden');
    if (toggleManual) toggleManual.textContent = '📝 Manual Input';
  }
  
  console.log('GPS modal closed - settings and location restored');
  
  gpsModal.classList.add('hidden');
}

function updateCurrentLocationDisplay() {
  if (!currentCoordsDisplay) return;
  
  if (gpsOverride) {
    currentCoordsDisplay.textContent = `Override: ${gpsOverride.lat.toFixed(6)}, ${gpsOverride.lon.toFixed(6)}`;
  } else if (currentLocation) {
    currentCoordsDisplay.textContent = `GPS: ${currentLocation.lat.toFixed(6)}, ${currentLocation.lon.toFixed(6)}`;
  } else {
    currentCoordsDisplay.textContent = 'Loading...';
  }
}

function useCurrentGPS() {
  // Clear override and refresh with real GPS
  gpsOverride = null;
  selectedLocation = null;
  console.log('GPS override cleared - using real GPS location');
  
  // Update button text to show we're using real GPS
  if (gpsBtn) {
    gpsBtn.textContent = '🌍 GPS Location';
  }
  
  // Re-enable live tracking and update UI
  isLiveTrackingEnabled = true;
  if (liveTrackingToggle) {
    liveTrackingToggle.checked = true;
    liveTrackingToggle.disabled = false; // Enable toggle when override is cleared
  }
  if (updateFrequencySelect) {
    updateFrequencySelect.disabled = false; // Enable frequency dropdown when override is cleared
  }
  
  // Save these as the new original settings (user applied changes)
  modalOriginalSettings.isLiveTrackingEnabled = isLiveTrackingEnabled;
  modalOriginalSettings.gpsUpdateInterval = gpsUpdateInterval;
  modalOriginalSettings.selectedLocation = null;
  
  // Restart GPS tracking
  if (started) {
    startGPSTracking();
  }
  
  gpsModal.classList.add('hidden');
  refreshLocationAndTiles();
}

function applySelectedLocation() {
  if (!selectedLocation) {
    alert('Please select a location on the map first.');
    return;
  }
  
  // Set override to selected location
  gpsOverride = { 
    lat: selectedLocation.lat, 
    lon: selectedLocation.lon 
  };
  console.log('GPS override set to selected location:', gpsOverride);
  
  // Update button text to show we're using override
  if (gpsBtn) {
    gpsBtn.textContent = '🌍 Override';
  }
  
  // Stop GPS tracking when override is set (stay at manually selected location)
  stopGPSTracking();
  
  // Update internal state and UI toggle to reflect that tracking is now disabled
  isLiveTrackingEnabled = false;
  if (liveTrackingToggle) {
    liveTrackingToggle.checked = false;
    liveTrackingToggle.disabled = true; // Disable toggle when override is active
  }
  if (updateFrequencySelect) {
    updateFrequencySelect.disabled = true; // Disable frequency dropdown when override is active
  }
  
  // Save these as the new original settings (user applied changes)
  modalOriginalSettings.isLiveTrackingEnabled = isLiveTrackingEnabled;
  modalOriginalSettings.gpsUpdateInterval = gpsUpdateInterval;
  modalOriginalSettings.selectedLocation = selectedLocation ? { ...selectedLocation } : null;
  
  console.log('GPS tracking stopped - using manual override location');
  
  // Close modal directly without restoring settings (user applied changes)
  gpsModal.classList.add('hidden');
  refreshLocationAndTiles();
}

// ---------- photo capture functionality ----------
function capturePhoto() {
  try {
    // Render one frame to ensure everything is up to date
    renderer.render(scene, camera);
    
    // Capture the canvas as a data URL
    const dataURL = renderer.domElement.toDataURL('image/png', 1.0);
    
    // Create a temporary link element to trigger download
    const link = document.createElement('a');
    link.download = `wplace-ar-photo-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.png`;
    link.href = dataURL;
    
    // Trigger the download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Visual feedback
    photoBtn.textContent = '✓ Saved!';
    photoBtn.style.background = 'rgba(0, 255, 0, 0.8)';
    
    setTimeout(() => {
      photoBtn.textContent = '📷 Save Photo';
      photoBtn.style.background = 'rgba(0, 0, 0, 0.8)';
    }, 2000);
    
    console.log('Photo captured and downloaded successfully');
  } catch (error) {
    console.error('Failed to capture photo:', error);
    
    // Error feedback
    photoBtn.textContent = '❌ Error';
    photoBtn.style.background = 'rgba(255, 0, 0, 0.8)';
    
    setTimeout(() => {
      photoBtn.textContent = '📷 Save Photo';
      photoBtn.style.background = 'rgba(0, 0, 0, 0.8)';
    }, 2000);
  }
}

// ---------- toggle UI visibility functionality ----------
let isUIVisible = true; // Track UI visibility state

function toggleUIVisibility() {
  if (!toggleUiBtn) return;
  
  isUIVisible = !isUIVisible;
  
  // Elements to toggle
  const elementsToToggle = [
    gpsBtn,
    photoBtn,
    opacityControl,
    heightControl
  ];
  
  // Toggle visibility for each element
  elementsToToggle.forEach(element => {
    if (element) {
      if (isUIVisible) {
        element.style.display = '';
      } else {
        element.style.display = 'none';
      }
    }
  });
  
  // Update button text
  toggleUiBtn.textContent = isUIVisible ? 'Hide UI' : 'Show UI';
  
  console.log(`UI ${isUIVisible ? 'shown' : 'hidden'}`);
}

// ---------- geo → tile math ----------
function latLonToTile(lat, lon, zoom, tileSize = 1000) {
  const x = (lon + 180) / 360;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) / Math.PI) / 2;
  const n = Math.pow(2, zoom);
  const tileX = Math.floor(x * n);
  const tileY = Math.floor(y * n);
  const pixelX = Math.floor((x * n - tileX) * tileSize);
  const pixelY = Math.floor((y * n - tileY) * tileSize);
  return { tileX, tileY, pixelX, pixelY };
}
const ZOOM_LEVEL = 11;
const TILE_SIZE = 1000;

const FALLBACK = { lat: 43.642567, lon: -79.387054 };

function showFallbackLocationAlert() {
  alert('GPS location access is not available. \n\nThe app will use a default location instead.  \n\nIf you\'re on an embedded browser in Discord for example, please switch to a main browser for GPS functionality.');
}

function getLatLonOnce() {
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

// Function to refresh location and reload tiles
function refreshLocationAndTiles() {
  console.log('Refreshing location and tiles...');
  
  getLatLonOnce().then(({ lat, lon }) => {
    console.log(`Refreshing tiles for location: ${lat}, ${lon}`);
    
    // Update pixel offsets and reload tile grid
    const { tileX, tileY, pixelX, pixelY } = latLonToTile(lat, lon, ZOOM_LEVEL, TILE_SIZE);
    currentPixelOffsets = { pixelX, pixelY };
    
    // Load new tile grid with textures
    loadTileGridTextures(lat, lon);
    
    // Update current location display if modal is open
    updateCurrentLocationDisplay();
    
    console.log('Tiles refreshed successfully');
  }).catch(error => {
    console.error('Failed to refresh tiles:', error);
  });
}

// ---------- tile grid system (3x3 grid with adjacent tiles) ----------
let SKY_HEIGHT = 200; // how high the plane floats above you (mutable for slider control)
let tileGrid = new Map(); // Map to store all tile planes by key "x,y"
let centerTile = { tileX: 0, tileY: 0 }; // Current center tile coordinates
let currentPixelOffsets = { pixelX: 0, pixelY: 0 }; // store current pixel offsets
let tileGroup = null; // Group container for all tile planes

// ---------- fog-enabled material for distance fading ----------
function createAlphaFogMaterial() {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff, // white, will be replaced by texture
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0 // Start invisible, will fade in when texture loads
  });
  
  material.onBeforeCompile = function (shader) {
    // Add custom fog uniforms
    shader.uniforms.customFogNear = { value: fogNear };
    shader.uniforms.customFogFar = { value: fogFar };
    
    // Add the custom fog calculation
    const alphaFog = `
      // Custom fog calculation for alpha fading
      float depth = gl_FragCoord.z / gl_FragCoord.w;
      float fogFactor = smoothstep(customFogNear, customFogFar, depth);
      gl_FragColor.a *= (0.8 - fogFactor);
    `;

    // Insert the fog calculation before the end of the fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      alphaFog + '\n#include <dithering_fragment>'
    );
    
    // Add uniform declarations
    shader.fragmentShader = 'uniform float customFogNear;\nuniform float customFogFar;\n' + shader.fragmentShader;

    material.userData.shader = shader;
  };

  return material;
}

// Helper function to adjust fog parameters dynamically
function updateFogParameters(near, far) {
  // Update all tile materials with new fog parameters
  tileGrid.forEach(({ material }) => {
    if (material.userData.shader) {
      material.userData.shader.uniforms.customFogNear.value = near;
      material.userData.shader.uniforms.customFogFar.value = far;
    }
  });
  console.log(`Fog parameters updated: near=${near}, far=${far}`);
}

function calculateTilePosition(relativeX, relativeY) {
  if (relativeX === 0 && relativeY === 0) {
    // Center tile - apply user pixel offset for precise positioning
    return {
      x: TILE_SIZE/2 - currentPixelOffsets.pixelX,
      z: TILE_SIZE/2 - currentPixelOffsets.pixelY
    };
  } else {
    // Adjacent tile - position relative to center tile
    const centerOffsetX = TILE_SIZE/2 - currentPixelOffsets.pixelX;
    const centerOffsetZ = TILE_SIZE/2 - currentPixelOffsets.pixelY;
    return {
      x: centerOffsetX + (relativeX * TILE_SIZE),
      z: centerOffsetZ - (relativeY * TILE_SIZE) // Invert Y for correct north/south
    };
  }
}

function createTilePlane(tileX, tileY, relativeX, relativeY) {
  const geom = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
  const planeMat = createAlphaFogMaterial(); // Use fog-enabled material
  const plane = new THREE.Mesh(geom, planeMat);
  
  // Make it horizontal like a ceiling and put it in the sky
  plane.rotation.x = -Math.PI / 2;
  
  // Position plane in the grid (group will handle compass rotation)
  const position = calculateTilePosition(relativeX, relativeY);
  plane.position.set(position.x, SKY_HEIGHT, position.z);
  
  // Add plane to the tile group instead of directly to scene
  if (!tileGroup) {
    tileGroup = new THREE.Group();
    scene.add(tileGroup);
  }
  tileGroup.add(plane);
  
  return { plane, material: planeMat };
}

function createTileGrid(centerTileX, centerTileY) {
  // Clear existing tiles
  clearTileGrid();
  
  // Create new tiles
  buildTileGrid(centerTileX, centerTileY);
}

function buildTileGrid(centerTileX, centerTileY) {
  // Store center tile coordinates
  centerTile = { tileX: centerTileX, tileY: centerTileY };
  
  // Create 3x3 grid of tiles (-1 to +1 relative to center)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tileX = centerTileX + dx;
      const tileY = centerTileY + dy;
      const tileKey = `${tileX},${tileY}`;
      
      const tileData = createTilePlane(tileX, tileY, dx, dy);
      tileGrid.set(tileKey, {
        ...tileData,
        tileX,
        tileY,
        relativeX: dx,
        relativeY: dy
      });
    }
  }
}

function clearTileGrid() {
  // Remove all existing tile planes from group
  tileGrid.forEach(({ plane }) => {
    if (tileGroup) {
      tileGroup.remove(plane);
    }
    plane.geometry.dispose();
    plane.material.dispose();
  });
  tileGrid.clear();
  
  // Remove and recreate the tile group for clean state
  if (tileGroup) {
    scene.remove(tileGroup);
    tileGroup = null;
  }
}

function loadTileGridTextures(lat, lon) {
  const { tileX, tileY, pixelX, pixelY } = latLonToTile(lat, lon, ZOOM_LEVEL, TILE_SIZE);
  
  // Store pixel offsets for positioning
  currentPixelOffsets = { pixelX, pixelY };
  
  // Save reference to old tiles (will remove after new ones load)
  const oldTileGrid = new Map(tileGrid);
  const oldTileGroup = tileGroup;
  
  // Clear current grid reference (but don't dispose yet)
  tileGrid.clear();
  tileGroup = null;
  
  // Create new tile grid
  buildTileGrid(tileX, tileY);
  
  // Track how many textures have loaded
  let loadedCount = 0;
  const totalTiles = tileGrid.size;
  const newTileMaterials = []; // Store materials to update opacity atomically
  
  // Load textures for all tiles in the grid
  tileGrid.forEach(({ material, tileX: tileTileX, tileY: tileTileY }, tileKey) => {
    newTileMaterials.push(material);
    
    loadSingleTileTexture(tileTileX, tileTileY, material, () => {
      // Callback when texture loads
      loadedCount++;
      
      // Once all textures are loaded, swap old and new tiles atomically
      if (loadedCount === totalTiles) {
        // Atomic swap: remove old tiles and show new ones in same frame
        // First, dispose old tiles
        oldTileGrid.forEach(({ plane }) => {
          if (oldTileGroup) {
            oldTileGroup.remove(plane);
          }
          plane.geometry.dispose();
          plane.material.dispose();
        });
        
        // Remove old group from scene
        if (oldTileGroup) {
          scene.remove(oldTileGroup);
        }
        
        // Get current opacity from slider (respects user setting)
        const currentOpacity = opacitySlider ? parseInt(opacitySlider.value) / 100 : 0.5;
        
        // Immediately show new tiles at current opacity setting (this happens in the same frame)
        newTileMaterials.forEach(mat => {
          mat.opacity = currentOpacity;
        });
        
        console.log('Tile swap completed atomically with opacity:', currentOpacity);
      }
    });
  });
  
  console.log(`Loading tile grid at ${tileX},${tileY} (${pixelX},${pixelY})`);
}

function loadSingleTileTexture(tileX, tileY, material, onLoadCallback) {
  const url = `https://wplace-proxy.deezus.workers.dev/wplace/files/s0/tiles/${tileX}/${tileY}.png?t=${Date.now()}`;
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';
  
  loader.load(
    url,
    (texture) => {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
      
      material.map = texture;
      material.color.set(0xffffff);
      material.transparent = true;
      // Don't set opacity here - let the callback handle it atomically
      material.needsUpdate = true;
      console.log(`Tile texture loaded for ${tileX},${tileY}`);
      
      // Call the callback if provided
      if (onLoadCallback) {
        onLoadCallback();
      }
    },
    undefined,
    (err) => {
      console.warn(`Failed to load tile texture for ${tileX},${tileY}:`, err);
      
      // Still call callback even on error to prevent hanging
      if (onLoadCallback) {
        onLoadCallback();
      }
    }
  );
}

// ---------- interaction prompt functionality ----------
function showInteractionPrompt(isMobile) {
  if (!interactionPrompt || !promptText) return;
  
  // Set appropriate text based on device type
  if (isMobile) {
    promptText.textContent = '📱 Rotate your device to look around';
  } else {
    promptText.textContent = '🖱️ Click and drag to look around';
  }
  
  // Show the prompt
  interactionPrompt.classList.remove('hidden');
  
  // Trigger fade-in animation
  setTimeout(() => {
    interactionPrompt.classList.add('show');
  }, 50);
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    // Fade out
    interactionPrompt.classList.remove('show');
    
    // Remove from DOM after fade animation completes
    setTimeout(() => {
      interactionPrompt.classList.add('hidden');
    }, 500);
  }, 5000);
  
  console.log('Interaction prompt shown:', isMobile ? 'mobile' : 'desktop');
}

// ---------- height control functionality ----------
function updatePlaneHeight() {
  if (!heightSlider || !heightValue) return;
  
  // Get new height value from slider
  const newHeight = parseInt(heightSlider.value);
  SKY_HEIGHT = newHeight;
  
  // Update the display value
  heightValue.textContent = `${newHeight}m`;
  
  // Update all tile plane positions
  tileGrid.forEach(({ plane, relativeX, relativeY }) => {
    plane.position.y = SKY_HEIGHT;
  });
  
  console.log(`Plane height updated to ${SKY_HEIGHT} units`);
}

// ---------- opacity control functionality ----------
function updatePlaneOpacity() {
  if (!opacitySlider || !opacityValue) return;
  
  // Get new opacity value from slider (0-100)
  const opacityPercent = parseInt(opacitySlider.value);
  const opacity = opacityPercent / 100;
  
  // Update the display value
  opacityValue.textContent = `${opacityPercent}%`;
  
  // Update all tile plane material opacity
  tileGrid.forEach(({ material }) => {
    material.opacity = opacity;
    material.needsUpdate = true;
  });
  
  console.log(`Plane opacity updated to ${opacityPercent}%`);
}



// ---------- start / recenter behavior ----------
let started = false;

async function startAR() {
  if (!started) {
    // Try to get motion permission to determine if we're on mobile
    const motionPermissionGranted = await ensureMotionPermission();
    hasDeviceOrientation = motionPermissionGranted;
    console.log('Motion permission granted (mobile mode):', hasDeviceOrientation);
    
    // Set camera position to origin for both modes
    camera.position.set(0, 0, 0);
    
    // Determine mode based on motion permission result
    const isActuallyMobile = isMobileDevice();
    console.log('Device detection - Mobile:', isActuallyMobile, 'Motion permission:', hasDeviceOrientation);
    
    if (hasDeviceOrientation && isActuallyMobile) {
      // Mobile mode: use device orientation controls
      console.log('Using mobile device orientation controls');
      controls = new DeviceOrientationControls(orientationProxy);
      controls.connect();
    } else if (isActuallyMobile && !hasDeviceOrientation) {
      // Mobile device but no motion permission - show error
      console.log('Mobile device detected but no motion permission');
      startBtn.textContent = 'Enable Motion/Orientation & Tap Again';
      // Don't return - let the function continue to avoid double-click issue
      // Just skip the video/plane setup for now
    } else {
      // Desktop mode: set up mouse look controls and point camera up
      console.log('Using desktop mouse look controls');
      
      // Show alert for desktop users
      alert('This AR experience is best enjoyed on mobile devices with motion sensors.');
      
      // Start looking straight up (like mobile device)
      cameraRotationX = Math.PI / 2; // 90 degrees up
      cameraRotationY = 0;
      camera.rotation.order = 'YXZ';
      camera.rotation.x = cameraRotationX;
      camera.rotation.y = cameraRotationY;
      
      // Add mouse event listeners
      canvas.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('mousemove', onMouseMove);
      
      // Prevent context menu on canvas
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      
      // Set cursor style for better UX
      canvas.style.cursor = 'grab';
      
      console.log('Desktop mode: camera pointing up with mouse look controls');
    }

    // Only proceed with full setup if we have proper controls (not the error case)
    if (hasDeviceOrientation || !isActuallyMobile) {
      await startVideo();
      
      // Get location and calculate pixel offsets before creating the plane
      const { lat, lon } = await getLatLonOnce();
      const { tileX, tileY, pixelX, pixelY } = latLonToTile(lat, lon, ZOOM_LEVEL, TILE_SIZE);
      currentPixelOffsets = { pixelX, pixelY };
      
      // Load the tile grid with textures
      loadTileGridTextures(lat, lon);

      // Switch from start screen to AR interface
      startScreen.classList.add('hidden');
      arInterface.classList.remove('hidden');
      console.log('Switched to AR interface');
      
      // Show interaction prompt
      showInteractionPrompt(isActuallyMobile);
      
      // Start GPS tracking if enabled and not overridden
      if (isLiveTrackingEnabled && !gpsOverride) {
        startGPSTracking();
      }
    } else {
      // Mobile device without motion permission - just hide start screen and show button change
      console.log('Mobile device without motion permission - staying on start screen');
      // Don't hide the start screen in this case, just update the button text
    }
    
    started = true;
  }
}

// ---------- render loop (adaptive smoothing) ----------
renderer.setAnimationLoop((t) => {
  const currentTime = t || performance.now();
  const dt = Math.max(0.001, (currentTime - lastT) / 1000);
  lastT = currentTime;

  if (hasDeviceOrientation && controls) {
    controls.update(); // writes orientationProxy.quaternion

    if (!orientationInitialized) {
      smoothQ.copy(orientationProxy.quaternion);
      orientationInitialized = true;
    }

    // Compute angular difference to adapt smoothing (snappy on large changes)
    const targetQ = orientationProxy.quaternion;
    const dot = THREE.MathUtils.clamp(smoothQ.dot(targetQ), -1, 1);
    const ang = 2 * Math.acos(Math.abs(dot)); // radians
    // Map angle to a time constant between slow and fast
    const k = THREE.MathUtils.clamp(ang / 0.25, 0, 1); // 0 rad..~14° → 0..1
    const tau = THREE.MathUtils.lerp(TAU_SLOW, TAU_BASE, k);
    const alpha = dt / (tau + dt); // EMA factor, framerate-independent

    smoothQ.slerp(targetQ, alpha);
    camera.quaternion.copy(smoothQ);
  }

  renderer.render(scene, camera);
});

// ---------- resize ----------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
