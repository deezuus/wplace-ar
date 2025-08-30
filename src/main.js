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
const controls = new DeviceOrientationControls(orientationProxy); // writes quaternion

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
async function ensureMotionPermission() {
  if (!isSecure()) console.warn('Motion permission requires HTTPS or localhost');
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
      granted = true; // Android/desktop: no explicit request API
    }
  } catch (e) {
    console.warn('Motion permission error:', e);
  }
  return granted;
}

// ---------- start / recenter button ----------
const startBtn = document.createElement('button');
startBtn.textContent = 'Start AR';
Object.assign(startBtn.style, {
  position: 'fixed', inset: '0', margin: 'auto', width: '60%', maxWidth: '360px',
  height: '56px', borderRadius: '14px', border: 'none', fontSize: '18px',
  background: '#111', color: '#fff', zIndex: 9999
});
document.body.appendChild(startBtn);

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
function getLatLonOnce() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(FALLBACK);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(FALLBACK),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
    );
  });
}

// ---------- plane + texture (your proxy) ----------
const SKY_HEIGHT = 150; // how high the plane floats above you
let plane = null;
let planeMat = null;
let currentPixelOffsets = { pixelX: 0, pixelY: 0 }; // store current pixel offsets

function createSkyPlane() {
  const geom = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
  planeMat = new THREE.MeshBasicMaterial({
    color: 0xff00ff, // bright debug until texture arrives
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1
  });
  plane = new THREE.Mesh(geom, planeMat);
  // Make it horizontal like a ceiling and put it in the sky
  plane.rotation.x = -Math.PI / 2;
  // Position will be set when we load the tile texture with pixel offsets
  plane.position.set(currentPixelOffsets.pixelX, SKY_HEIGHT, currentPixelOffsets.pixelY);
  scene.add(plane);
}

function loadTileTexture(lat, lon) {
  const { tileX, tileY, pixelX, pixelY } = latLonToTile(lat, lon, ZOOM_LEVEL, TILE_SIZE);
  // Store pixel offsets for positioning
  currentPixelOffsets = { pixelX: pixelX * 5, pixelY: pixelY * 5 };
  // Update plane position if it exists
  if (plane) {
    plane.position.set(pixelX, SKY_HEIGHT, pixelY);
  }
  const url = `https://wplace-proxy.darktorin.workers.dev/wplace/files/s0/tiles/${tileX}/${tileY}.png?t=${Date.now()}`;
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';
  loader.load(
    url,
    (texture) => {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
      planeMat.map = texture;
      planeMat.color.set(0xffffff);
      planeMat.transparent = true;
      planeMat.opacity = 0.9;
      planeMat.needsUpdate = true;
      console.log('Tile texture loaded with pixel offsets:', pixelX, pixelY);
    },
    undefined,
    (err) => console.warn('Failed to load tile texture', err)
  );
}

function recenterSky() {
  if (!plane) return;
  plane.rotation.set(-Math.PI / 2, 0, 0);
  // Maintain the pixel-based positioning instead of resetting to origin
  plane.position.set(currentPixelOffsets.pixelY / 10, SKY_HEIGHT, currentPixelOffsets.pixelX / 10);
}

// ---------- start / recenter behavior ----------
let started = false;
startBtn.addEventListener('click', async () => {
  if (!started) {
    const ok = await ensureMotionPermission();
    if (!ok) { startBtn.textContent = 'Enable Motion/Orientation & Tap Again'; return; }

    await startVideo();
    controls.connect();
    
    // Get location and calculate pixel offsets before creating the plane
    const { lat, lon } = await getLatLonOnce();
    const { tileX, tileY, pixelX, pixelY } = latLonToTile(lat, lon, ZOOM_LEVEL, TILE_SIZE);
    currentPixelOffsets = { pixelX, pixelY };
    
    // Now create the plane with correct positioning
    if (!plane) createSkyPlane();
    
    // Load the texture
    loadTileTexture(lat, lon);

    startBtn.textContent = 'Recenter Sky';
    Object.assign(startBtn.style, {
      width: '140px', height: '44px', inset: '', bottom: '20px', left: '50%', transform: 'translateX(-50%)'
    });
    started = true;
  } else {
    recenterSky();
  }
});

// ---------- render loop (adaptive smoothing) ----------
renderer.setAnimationLoop((t) => {
  controls.update(); // writes orientationProxy.quaternion

  if (!orientationInitialized) {
    smoothQ.copy(orientationProxy.quaternion);
    orientationInitialized = true;
    lastT = t || performance.now();
  }

  const dt = Math.max(0.001, ((t || performance.now()) - lastT) / 1000);
  lastT = t || performance.now();

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

  renderer.render(scene, camera);
});

// ---------- resize ----------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
