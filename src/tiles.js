/**
 * Tile grid system and texture loading
 */
import * as THREE from 'three';
import { scene } from './scene.js';
import { renderer } from './scene.js';
import { ZOOM_LEVEL, TILE_SIZE, SKY_HEIGHT as INITIAL_SKY_HEIGHT, fogNear, fogFar } from './config.js';
import { latLonToTile } from './utils.js';

// Tile grid system (3x3 grid with adjacent tiles)
let SKY_HEIGHT = INITIAL_SKY_HEIGHT; // how high the plane floats above you (mutable for slider control)
let tileGrid = new Map(); // Map to store all tile planes by key "x,y"
let centerTile = { tileX: 0, tileY: 0 }; // Current center tile coordinates
let currentPixelOffsets = { pixelX: 0, pixelY: 0 }; // store current pixel offsets
let tileGroup = null; // Group container for all tile planes

// Callback to get current opacity from UI slider
let getOpacityCallback = null;

/**
 * Set callback to get current opacity from UI
 */
export function setGetOpacityCallback(callback) {
  getOpacityCallback = callback;
}

/**
 * Get current sky height
 */
export function getSkyHeight() {
  return SKY_HEIGHT;
}

/**
 * Set sky height and update all tile positions
 */
export function setSkyHeight(height) {
  SKY_HEIGHT = height;
  tileGrid.forEach(({ plane }) => {
    plane.position.y = SKY_HEIGHT;
  });
}

/**
 * Get current pixel offsets
 */
export function getCurrentPixelOffsets() {
  return currentPixelOffsets;
}

/**
 * Fog-enabled material for distance fading
 */
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

/**
 * Helper function to adjust fog parameters dynamically
 */
export function updateFogParameters(near, far) {
  // Update all tile materials with new fog parameters
  tileGrid.forEach(({ material }) => {
    if (material.userData.shader) {
      material.userData.shader.uniforms.customFogNear.value = near;
      material.userData.shader.uniforms.customFogFar.value = far;
    }
  });
  console.log(`Fog parameters updated: near=${near}, far=${far}`);
}

/**
 * Calculate tile position based on relative coordinates
 */
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

/**
 * Create a single tile plane
 */
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

/**
 * Build tile grid for given center coordinates
 */
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

/**
 * Clear existing tile grid
 */
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

/**
 * Create tile grid for given center coordinates
 */
function createTileGrid(centerTileX, centerTileY) {
  // Clear existing tiles
  clearTileGrid();
  
  // Create new tiles
  buildTileGrid(centerTileX, centerTileY);
}

/**
 * Load texture for a single tile
 */
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

/**
 * Load tile grid textures for given lat/lon
 */
export function loadTileGridTextures(lat, lon) {
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
        const currentOpacity = getOpacityCallback ? getOpacityCallback() : 0.5;
        
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

/**
 * Update opacity for all tile materials
 */
export function updateTileOpacity(opacity) {
  tileGrid.forEach(({ material }) => {
    material.opacity = opacity;
    material.needsUpdate = true;
  });
}

/**
 * Get tile grid for external access
 */
export function getTileGrid() {
  return tileGrid;
}

