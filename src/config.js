/**
 * Configuration constants for wPlace AR Viewer
 */

// Tile system configuration
export const ZOOM_LEVEL = 11;
export const TILE_SIZE = 1000;
export const SKY_HEIGHT = 200; // Initial height, mutable via slider

// Fallback location (Toronto)
export const FALLBACK = { lat: 43.642567, lon: -79.387054 };

// Fog parameters for distance-based fading
// TILE_SIZE is 1000, so with a 3x3 grid, adjacent tiles are at distances of ~1000-1414 units
export const fogNear = 500;  // Start fading just beyond adjacent tiles
export const fogFar = 1800;  // Completely fade

// Adaptive smoothing time constants for orientation tracking
export const TAU_BASE = 0.03; // fast response on quick turns (~30ms)
export const TAU_SLOW = 0.12; // slightly smoother when steady (~120ms)

// GPS tracking defaults
export const GPS_UPDATE_INTERVAL = 25; // Update frequency in seconds (default 25s)
export const GPS_DISTANCE_THRESHOLD = 15; // Minimum distance in meters before reloading (default 15m)

