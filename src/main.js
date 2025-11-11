/**
 * wPlace AR Viewer - Main Application
 * A web-based augmented reality application that overlays wplace.live tile data
 * from the sky above the user's current location. Uses motion permission detection
 * to automatically switch between device orientation (mobile) and mouse controls (desktop).
 */

import { renderer, scene, camera } from './scene.js';
import { updateControls } from './controls.js';
import { initializeUI, startAR, updateCurrentLocationDisplay, checkAndCapture } from './ui.js';
import { setRefreshTilesCallback, setUpdateCurrentLocationDisplayCallback } from './geolocation.js';
import { loadTileGridTextures } from './tiles.js';

// Set up callbacks for geolocation module
setRefreshTilesCallback((lat, lon) => {
  loadTileGridTextures(lat, lon);
});

setUpdateCurrentLocationDisplayCallback(() => {
  updateCurrentLocationDisplay();
});

// Initialize UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeUI();
});

// Render loop
renderer.setAnimationLoop((t) => {
  const currentTime = t || performance.now();
  updateControls(currentTime);
  renderer.render(scene, camera);
  
  // Check if photo capture is requested and perform it after rendering
  checkAndCapture();
});
