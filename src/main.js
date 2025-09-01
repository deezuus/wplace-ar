/**
 * wPlace AR Viewer - Main Application
 * 
 * A web-based augmented reality application that overlays r/place-style tile data
 * from the sky above the user's current location. Uses motion permission detection
 * to automatically switch between device orientation (mobile) and mouse controls (desktop).
 * 
 * FEATURES:
 * - Camera feed background using WebRTC getUserMedia
 * - Device orientation tracking (mobile) with adaptive smoothing
 * - Compass-based tile grid rotation aligned with real-world directions
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
 * - Initial compass heading detection for geographic alignment
 * - Grouped tile rotation system for accurate cardinal direction mapping
 * - Precise pixel-level positioning within tiles
 * - 80° FOV camera for immersive AR experience
 * 
 * CONTROLS:
 * - Mobile: Device orientation (gyroscope/accelerometer) + initial compass orientation
 * - Desktop: Mouse drag to look around
 * - "Start AR" button initializes camera and orientation

 * 
 * CONFIGURATION:
 * - ZOOM_LEVEL: Map zoom level for tile resolution (default: 11)
 * - TILE_SIZE: Size of each tile in 3D units (default: 1000)
 * - SKY_HEIGHT: Height of plane above user (default: 100 units)
 * - TAU_BASE/TAU_SLOW: Smoothing time constants for orientation tracking
 * - DEBUG_SHOW_COMPASS: Show/hide compass indicator (default: true)
 * - Initial compass heading captured for geographic alignment
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

// ---------- compass/magnetometer tracking ----------
let initialCompassHeading = 0; // Initial compass heading for north orientation (degrees 0-360)
let hasCompassHeading = false; // Whether we have captured initial compass heading
let currentCompassHeading = 0; // Current compass heading for indicator updates
let compassTrackingActive = false; // Whether real-time compass tracking is active

function normalizeCompassHeading(heading) {
  // Normalize heading to 0-360 degrees
  heading = heading % 360;
  return heading < 0 ? heading + 360 : heading;
}

function getCompassDirection(heading) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(heading / 22.5) % 16;
  return directions[index];
}

function updateCompassIndicator(heading) {
  if (!compassIndicator) return;
  
  // Show compass indicator only if debug variable is enabled
  if (DEBUG_SHOW_COMPASS) {
    compassIndicator.classList.remove('hidden');
  } else {
    compassIndicator.classList.add('hidden');
  }
  
  // Update needle rotation (heading is clockwise from north)
  compassNeedle.style.transform = `translateX(-50%) rotate(${heading}deg)`;
  
  // Update text display
  const direction = getCompassDirection(heading);
  compassText.textContent = `${Math.round(heading)}° ${direction}`;
  
  console.log(`Compass: ${Math.round(heading)}° ${direction}`);
}

function getCompassHeading(event) {
  let heading = null;
  
  if (event.webkitCompassHeading !== undefined) {
    // iOS: webkitCompassHeading gives us magnetic north (0-360)
    heading = event.webkitCompassHeading;
  } else if (event.alpha !== null) {
    // Android: alpha gives us the rotation around the z-axis
    // For Android, we need to convert alpha to compass heading
    // alpha is 0-360 where 0 is north, but it's inverted from compass heading
    heading = 360 - event.alpha;
  }
  
  return heading !== null ? normalizeCompassHeading(heading) : null;
}

function onDeviceOrientationChange(event) {
  const newHeading = getCompassHeading(event);
  
  if (newHeading !== null) {
    // Capture initial heading for tile grid orientation (only once)
    if (!hasCompassHeading) {
      initialCompassHeading = newHeading;
      hasCompassHeading = true;
      console.log('Initial compass heading captured:', initialCompassHeading.toFixed(1), '°');
      
      // Check compass accuracy if available (Android feature)
      if (event.webkitCompassAccuracy !== undefined) {
        const accuracy = event.webkitCompassAccuracy;
        if (accuracy < 0) {
          console.warn('Compass needs calibration - wave device in figure-8 pattern');
        }
      }
    }
    
    // Always update current heading for indicator (continuous tracking)
    if (compassTrackingActive) {
      currentCompassHeading = newHeading;
      updateCompassIndicator(currentCompassHeading);
    }
  }
}

function captureInitialCompassHeading() {
  if (!isMobileDevice()) {
    console.log('Compass not available on desktop - using default north orientation');
    // Show compass indicator with default north (0°) for desktop
    updateCompassIndicator(0);
    return false;
  }
  
  try {
    window.addEventListener('deviceorientationabsolute', onDeviceOrientationChange, true);
    window.addEventListener('deviceorientation', onDeviceOrientationChange, true);
    compassTrackingActive = true; // Enable continuous tracking
    console.log('Started compass tracking...');
    return true;
  } catch (error) {
    console.warn('Failed to access compass:', error);
    // Show compass indicator with default north (0°) on error
    updateCompassIndicator(0);
    return false;
  }
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

// ---------- UI element references (to be set after DOM loads) ----------
let startScreen, arInterface, startBtn;
let compassIndicator, compassNeedle, compassText;
let photoBtn;

// Initialize UI elements when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  startScreen = document.getElementById('start-screen');
  arInterface = document.getElementById('ar-interface');
  startBtn = document.getElementById('start-btn');
  compassIndicator = document.getElementById('compass-indicator');
  compassNeedle = document.querySelector('.compass-needle');
  compassText = document.querySelector('.compass-text');
  photoBtn = document.getElementById('photo-btn');
  
  // All UI elements are now properly initialized
  
  // Add event listeners
  if (startBtn) startBtn.addEventListener('click', startAR);
  if (photoBtn) photoBtn.addEventListener('click', capturePhoto);
});



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

// Debug configuration
const DEBUG_SHOW_COMPASS = false; // Set to false to hide compass display

const FALLBACK = { lat: 43.642567, lon: -79.387054 };

function showFallbackLocationAlert() {
  alert('GPS location access is not available. \n\nThe app will use a default location instead.  \n\nIf you\'re on an embedded browser in Discord for example, please switch to a main browser for GPS functionality.');
}

function getLatLonOnce() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      showFallbackLocationAlert();
      return resolve(FALLBACK);
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {
        showFallbackLocationAlert();
        resolve(FALLBACK);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
    );
  });
}

// ---------- tile grid system (3x3 grid with adjacent tiles) ----------
const SKY_HEIGHT = 100; // how high the plane floats above you
let tileGrid = new Map(); // Map to store all tile planes by key "x,y"
let centerTile = { tileX: 0, tileY: 0 }; // Current center tile coordinates
let currentPixelOffsets = { pixelX: 0, pixelY: 0 }; // store current pixel offsets
let tileGroup = null; // Group container for all tile planes

// ---------- fog-enabled material for distance fading ----------
function createAlphaFogMaterial() {
  const material = new THREE.MeshBasicMaterial({
    color: 0xff00ff, // bright debug until texture arrives
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1
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
  
  // Apply compass rotation to align with real-world directions
  if (tileGroup && hasCompassHeading) {
    const compassRadians = (initialCompassHeading * Math.PI) / 180;
    tileGroup.rotation.y = compassRadians;
    console.log('Applied compass rotation:', initialCompassHeading.toFixed(1), '°');
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
  
  // Create the tile grid first
  createTileGrid(tileX, tileY);
  
  // Load textures for all tiles in the grid
  tileGrid.forEach(({ material, tileX: tileTileX, tileY: tileTileY }, tileKey) => {
    loadSingleTileTexture(tileTileX, tileTileY, material);
  });
  
  console.log(`Loading tile grid at ${tileX},${tileY} (${pixelX},${pixelY})`);
}

function loadSingleTileTexture(tileX, tileY, material) {
  const url = `https://wplace-proxy.darktorin.workers.dev/wplace/files/s0/tiles/${tileX}/${tileY}.png?t=${Date.now()}`;
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
      material.opacity = 0.9;
      material.needsUpdate = true;
      console.log(`Tile texture loaded for ${tileX},${tileY}`);
    },
    undefined,
    (err) => console.warn(`Failed to load tile texture for ${tileX},${tileY}:`, err)
  );
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
      
      // Capture initial compass heading for mobile devices
      captureInitialCompassHeading();
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
      alert('This AR experience is best enjoyed on mobile devices with motion sensors.\n\nOn desktop, you can still look around by clicking and dragging to explore!');
      
      // Show compass indicator for desktop (default north orientation)
      updateCompassIndicator(0);
      
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
  
  // No real-time compass updates needed - using initial heading only
  
  // Desktop mode doesn't need updates in render loop - mouse events handle camera rotation

  renderer.render(scene, camera);
});

// ---------- resize ----------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
