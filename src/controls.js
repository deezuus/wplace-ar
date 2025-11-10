/**
 * Device orientation and mouse look controls
 */
import * as THREE from 'three';
import { DeviceOrientationControls } from 'three-stdlib';
import { camera } from './scene.js';
import { TAU_BASE, TAU_SLOW } from './config.js';

// Device orientation (3-DoF)
const orientationProxy = new THREE.Object3D();
let controls = null;
export let hasDeviceOrientation = false;

// Desktop mouse look controls
let isMouseDown = false;
let mouseX = 0;
let mouseY = 0;
let cameraRotationX = 0; // pitch (up/down)
let cameraRotationY = 0; // yaw (left/right)

// Adaptive smoothing (snappy)
let smoothQ = new THREE.Quaternion();
let orientationInitialized = false;
let lastT = performance.now();

const canvas = document.getElementById('glscene');

/**
 * Desktop mouse look controls - mouse down handler
 */
function onMouseDown(event) {
  isMouseDown = true;
  mouseX = event.clientX;
  mouseY = event.clientY;
  canvas.style.cursor = 'grabbing';
}

/**
 * Desktop mouse look controls - mouse up handler
 */
function onMouseUp() {
  isMouseDown = false;
  canvas.style.cursor = 'grab';
}

/**
 * Desktop mouse look controls - mouse move handler
 */
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

/**
 * Initialize device orientation controls for mobile
 */
export function initDeviceOrientationControls() {
  controls = new DeviceOrientationControls(orientationProxy);
  controls.connect();
  hasDeviceOrientation = true;
}

/**
 * Initialize mouse look controls for desktop
 */
export function initMouseControls() {
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
}

/**
 * Update controls in the render loop
 * @param {number} currentTime - Current time from animation loop
 */
export function updateControls(currentTime) {
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
}

/**
 * Set device orientation state
 */
export function setHasDeviceOrientation(value) {
  hasDeviceOrientation = value;
}

