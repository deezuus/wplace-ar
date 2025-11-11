/**
 * UI element management and event handlers
 */
import { renderer, scene, camera } from './scene.js';
import { startVideo } from './video.js';
import { 
  initDeviceOrientationControls, 
  initMouseControls, 
  setHasDeviceOrientation 
} from './controls.js';
import { ensureMotionPermission } from './utils.js';
import { isMobileDevice } from './utils.js';
import {
  getGpsOverride,
  setGpsOverride,
  getCurrentLocation,
  getSelectedLocation,
  setSelectedLocation,
  getIsLiveTrackingEnabled,
  setIsLiveTrackingEnabled,
  getGpsUpdateInterval,
  setGpsUpdateInterval,
  getModalOriginalSettings,
  setModalOriginalSettings,
  startGPSTracking,
  stopGPSTracking,
  refreshLocationAndTiles,
  getLatLonOnce
} from './geolocation.js';
import { initializeMap, toggleManualInput, applyManualCoordinates, setUIElements as setMapUIElements, updateMapLocation } from './map.js';
import { loadTileGridTextures, setSkyHeight, updateTileOpacity, setGetOpacityCallback } from './tiles.js';
import { FALLBACK } from './config.js';

// UI element references
let startScreen, arInterface, startBtn;
let photoBtn, gpsBtn, toggleUiBtn;
let gpsModal, gpsModalClose, gpsLatInput, gpsLonInput;
let gpsUseCurrent, gpsApply, currentCoordsDisplay;
let toggleManual, manualInputs, applyManual, selectedCoordsDisplay;
let heightSlider, heightValue, heightControl;
let opacitySlider, opacityValue, opacityControl;
let interactionPrompt, promptText;
let liveTrackingToggle, updateFrequencySelect;

// Application state
let started = false;

/**
 * Initialize UI elements when DOM is ready
 */
export function initializeUI() {
  // Get DOM elements
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
  
  // Set up map UI elements
  setMapUIElements({
    selectedCoordsDisplay,
    liveTrackingToggle,
    updateFrequencySelect,
    gpsLatInput,
    gpsLonInput,
    manualInputs,
    toggleManual
  });
  
  // Set up opacity callback for tiles module
  setGetOpacityCallback(() => {
    return opacitySlider ? parseInt(opacitySlider.value) / 100 : 0.5;
  });
  
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
      setIsLiveTrackingEnabled(e.target.checked);
      
      // Save this change immediately (user manually toggled, not from map interaction)
      const settings = getModalOriginalSettings();
      settings.isLiveTrackingEnabled = e.target.checked;
      setModalOriginalSettings(settings);
      
      console.log('Live tracking:', e.target.checked ? 'enabled' : 'disabled');
      
      // Restart tracking with new setting
      if (started && !getGpsOverride()) {
        if (e.target.checked) {
          startGPSTracking();
        } else {
          stopGPSTracking();
        }
      }
    });
  }
  
  if (updateFrequencySelect) {
    updateFrequencySelect.addEventListener('change', (e) => {
      const interval = parseInt(e.target.value);
      setGpsUpdateInterval(interval);
      
      // Save this change immediately (user manually changed frequency)
      const settings = getModalOriginalSettings();
      settings.gpsUpdateInterval = interval;
      setModalOriginalSettings(settings);
      
      console.log('Update frequency changed to:', interval, 'seconds');
      
      // Restart tracking with new interval (only if not overridden)
      if (started && getIsLiveTrackingEnabled() && !getGpsOverride()) {
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
}

/**
 * Start AR experience
 */
export async function startAR() {
  if (!started) {
    // Try to get motion permission to determine if we're on mobile
    const motionPermissionGranted = await ensureMotionPermission();
    setHasDeviceOrientation(motionPermissionGranted);
    console.log('Motion permission granted (mobile mode):', motionPermissionGranted);
    
    // Set camera position to origin for both modes
    camera.position.set(0, 0, 0);
    
    // Determine mode based on motion permission result
    const isActuallyMobile = isMobileDevice();
    console.log('Device detection - Mobile:', isActuallyMobile, 'Motion permission:', motionPermissionGranted);
    
    if (motionPermissionGranted && isActuallyMobile) {
      // Mobile mode: use device orientation controls
      console.log('Using mobile device orientation controls');
      initDeviceOrientationControls();
    } else if (isActuallyMobile && !motionPermissionGranted) {
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
      
      initMouseControls();
      
      console.log('Desktop mode: camera pointing up with mouse look controls');
    }

    // Only proceed with full setup if we have proper controls (not the error case)
    if (motionPermissionGranted || !isActuallyMobile) {
      await startVideo();
      
      // Get location and calculate pixel offsets before creating the plane
      const { lat, lon } = await getLatLonOnce();
      
      // Load the tile grid with textures
      loadTileGridTextures(lat, lon);

      // Switch from start screen to AR interface
      startScreen.classList.add('hidden');
      arInterface.classList.remove('hidden');
      console.log('Switched to AR interface');
      
      // Show interaction prompt
      showInteractionPrompt(isActuallyMobile);
      
      // Start GPS tracking if enabled and not overridden
      if (getIsLiveTrackingEnabled() && !getGpsOverride()) {
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

/**
 * Get started state
 */
export function getStarted() {
  return started;
}

/**
 * GPS modal functionality
 */
function openGPSModal() {
  if (!gpsModal) return;
  
  // Save current settings in case user cancels
  setModalOriginalSettings({
    isLiveTrackingEnabled: getIsLiveTrackingEnabled(),
    gpsUpdateInterval: getGpsUpdateInterval(),
    selectedLocation: getSelectedLocation() ? { ...getSelectedLocation() } : null
  });
  
  // Set initial disabled state based on whether override is active
  if (liveTrackingToggle) {
    liveTrackingToggle.disabled = getGpsOverride() !== null;
  }
  if (updateFrequencySelect) {
    updateFrequencySelect.disabled = getGpsOverride() !== null;
  }
  
  gpsModal.classList.remove('hidden');
  
  // Initialize map after modal is shown
  setTimeout(() => {
    initializeMap();
  }, 50);
}

function closeGPSModal() {
  if (!gpsModal) return;
  
  const originalSettings = getModalOriginalSettings();
  console.log('Closing modal - original settings:', originalSettings);
  console.log('Current selectedLocation before restore:', getSelectedLocation());
  
  // Restore original settings (user cancelled without applying)
  setIsLiveTrackingEnabled(originalSettings.isLiveTrackingEnabled);
  setGpsUpdateInterval(originalSettings.gpsUpdateInterval);
  setSelectedLocation(originalSettings.selectedLocation ? { ...originalSettings.selectedLocation } : null);
  
  console.log('Restored selectedLocation:', getSelectedLocation());
  
  // Update UI to reflect restored settings
  if (liveTrackingToggle) {
    liveTrackingToggle.checked = getIsLiveTrackingEnabled();
    liveTrackingToggle.disabled = getGpsOverride() !== null; // Restore disabled state based on override
  }
  if (updateFrequencySelect) {
    updateFrequencySelect.value = getGpsUpdateInterval();
    updateFrequencySelect.disabled = getGpsOverride() !== null; // Restore disabled state based on override
  }
  
  // Restore map marker position and center map
  const selectedLocation = getSelectedLocation();
  if (selectedLocation) {
    console.log('Restoring marker to:', selectedLocation);
    updateMapLocation(selectedLocation.lat, selectedLocation.lon);
  } else {
    // If no selected location, restore to current/override location
    const gpsOverride = getGpsOverride();
    const currentLocation = getCurrentLocation();
    const restoreLat = gpsOverride?.lat || currentLocation?.lat || FALLBACK.lat;
    const restoreLon = gpsOverride?.lon || currentLocation?.lon || FALLBACK.lon;
    console.log('No saved location, restoring to current/fallback:', { lat: restoreLat, lon: restoreLon });
    updateMapLocation(restoreLat, restoreLon);
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
  
  const gpsOverride = getGpsOverride();
  const currentLocation = getCurrentLocation();
  
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
  setGpsOverride(null);
  setSelectedLocation(null);
  console.log('GPS override cleared - using real GPS location');
  
  // Update button text to show we're using real GPS
  if (gpsBtn) {
    gpsBtn.textContent = '🌍 GPS Location';
  }
  
  // Re-enable live tracking and update UI
  setIsLiveTrackingEnabled(true);
  if (liveTrackingToggle) {
    liveTrackingToggle.checked = true;
    liveTrackingToggle.disabled = false; // Enable toggle when override is cleared
  }
  if (updateFrequencySelect) {
    updateFrequencySelect.disabled = false; // Enable frequency dropdown when override is cleared
  }
  
  // Save these as the new original settings (user applied changes)
  setModalOriginalSettings({
    isLiveTrackingEnabled: true,
    gpsUpdateInterval: getGpsUpdateInterval(),
    selectedLocation: null
  });
  
  // Restart GPS tracking
  if (started) {
    startGPSTracking();
  }
  
  gpsModal.classList.add('hidden');
  refreshLocationAndTiles();
}

function applySelectedLocation() {
  const selectedLocation = getSelectedLocation();
  if (!selectedLocation) {
    alert('Please select a location on the map first.');
    return;
  }
  
  // Set override to selected location
  setGpsOverride({ 
    lat: selectedLocation.lat, 
    lon: selectedLocation.lon 
  });
  console.log('GPS override set to selected location:', getGpsOverride());
  
  // Update button text to show we're using override
  if (gpsBtn) {
    gpsBtn.textContent = '🌍 Override';
  }
  
  // Stop GPS tracking when override is set (stay at manually selected location)
  stopGPSTracking();
  
  // Update internal state and UI toggle to reflect that tracking is now disabled
  setIsLiveTrackingEnabled(false);
  if (liveTrackingToggle) {
    liveTrackingToggle.checked = false;
    liveTrackingToggle.disabled = true; // Disable toggle when override is active
  }
  if (updateFrequencySelect) {
    updateFrequencySelect.disabled = true; // Disable frequency dropdown when override is active
  }
  
  // Save these as the new original settings (user applied changes)
  setModalOriginalSettings({
    isLiveTrackingEnabled: false,
    gpsUpdateInterval: getGpsUpdateInterval(),
    selectedLocation: selectedLocation ? { ...selectedLocation } : null
  });
  
  console.log('GPS tracking stopped - using manual override location');
  
  // Close modal directly without restoring settings (user applied changes)
  gpsModal.classList.add('hidden');
  refreshLocationAndTiles();
}

/**
 * Photo capture functionality
 * Uses a flag-based approach to capture in the render loop for consistent buffer state
 */
let snap = false;

function capturePhoto() {
  // Set flag to trigger capture in the render loop
  snap = true;
}

/**
 * Perform the actual photo capture (called from render loop)
 * Uses toBlob for better memory efficiency
 */
function performCapture() {
  const canvas = renderer.domElement;
  
  // Use toBlob instead of toDataURL for better performance
  canvas.toBlob(function(blob) {
    if (!blob) {
      console.error('Failed to create blob from canvas');
      // Error feedback
      photoBtn.textContent = '❌ Error';
      photoBtn.style.background = 'rgba(255, 0, 0, 0.8)';
      
      setTimeout(() => {
        photoBtn.textContent = '📷 Save Photo';
        photoBtn.style.background = 'rgba(0, 0, 0, 0.8)';
      }, 2000);
      return;
    }
    
    // Create a temporary link element to trigger download
    const link = document.createElement('a');
    link.download = `wplace-ar-photo-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.png`;
    link.href = URL.createObjectURL(blob);
    
    // Trigger the download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the object URL
    URL.revokeObjectURL(link.href);
    
    // Visual feedback
    photoBtn.textContent = '✓ Saved!';
    photoBtn.style.background = 'rgba(0, 255, 0, 0.8)';
    
    setTimeout(() => {
      photoBtn.textContent = '📷 Save Photo';
      photoBtn.style.background = 'rgba(0, 0, 0, 0.8)';
    }, 2000);
    
    console.log('Photo captured and downloaded successfully');
    console.log(blob);
    console.log(link.href);
  }, 'image/png');
}

/**
 * Check if capture is requested and perform it (called from render loop)
 */
export function checkAndCapture() {
  if (snap) {
    performCapture();
    snap = false;
  }
}

/**
 * Toggle UI visibility functionality
 */
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

/**
 * Interaction prompt functionality
 */
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

/**
 * Height control functionality
 */
function updatePlaneHeight() {
  if (!heightSlider || !heightValue) return;
  
  // Get new height value from slider
  const newHeight = parseInt(heightSlider.value);
  setSkyHeight(newHeight);
  
  // Update the display value
  heightValue.textContent = `${newHeight}m`;
  
  console.log(`Plane height updated to ${newHeight} units`);
}

/**
 * Opacity control functionality
 */
function updatePlaneOpacity() {
  if (!opacitySlider || !opacityValue) return;
  
  // Get new opacity value from slider (0-100)
  const opacityPercent = parseInt(opacitySlider.value);
  const opacity = opacityPercent / 100;
  
  // Update the display value
  opacityValue.textContent = `${opacityPercent}%`;
  
  // Update all tile plane material opacity
  updateTileOpacity(opacity);
  
  console.log(`Plane opacity updated to ${opacityPercent}%`);
}

// Export updateCurrentLocationDisplay for geolocation module
export { updateCurrentLocationDisplay };

