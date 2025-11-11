| | |
|:--:|:--:|
| <img width="350" alt="Inspiration" src="https://github.com/user-attachments/assets/4087b916-221e-452e-8d6c-7b998e837ede" /><br><div align="center"><i>The Inspiration</i><br>(Thanks [vonixskulls](https://x.com/vonixskulls/status/1953965288514265576) and [m1stakezwermade](https://x.com/m1stakezwermade/status/1954023746270114144) on Twitter)</div> | <img width="350" alt="Actual" src="https://github.com/user-attachments/assets/69c82518-0cac-4b34-b46d-5886a7429a74" /><br><div align="center"><i>Actual <br> (I did not get a chance to go to the CN Tower to take an actual pic ☹️)</i></div> |


<br>

A augmented reality webapp that overlays [wplace.live](https://wplace.live/) artwork in the sky above your current location. Experience community-created pixel art floating in the air through your device's camera.

## Features

- **🌍 Location-Based AR**: Displays different tile artwork based on your GPS coordinates
- **📱 Mobile AR**: Uses device orientation (gyroscope/accelerometer) for natural head tracking
- **🖱️ Desktop Support**: Mouse controls for viewing on computers
- **📷 Camera Integration**: Real-time camera feed as AR background
- **🎨 Live Tile Data**: Fetches current artwork from wPlace collaborative canvas
- **🔄 Adaptive Smoothing**: Intelligent orientation tracking that responds naturally to movement

## How It Works

The app uses your device's geolocation to determine which section of the wplace to display. The wplace map appears as a plane floating above you in 3D space, viewable through your device's camera feed. The experience adapts automatically between mobile AR mode (using device orientation) and desktop mode (using mouse controls).

To get around CORS, requests to the API are routed through a Cloudflare Worker proxy. (If someone from the WPlace team sees this and wants to maybe integrate this officially please reach out)

## Cloudflare Worker Proxy

The proxy worker handles CORS by forwarding requests to the wplace.live backend, sanitizing headers, and caching responses for improved performance. It normalizes cache keys (ignoring timestamp query parameters) and implements a 24-hour cache with stale-while-revalidate for up to 7 days.

The worker code is available in [`cloudflare-worker.js`](./cloudflare-worker.js).

## Technical Stack

- **Three.js**: 3D graphics and WebGL rendering
- **WebRTC**: Camera feed integration
- **Geolocation API**: GPS positioning
- **Device Orientation API**: Mobile gyroscope/accelerometer access
- **Cloudflare Worker**: Proxying API requests to get around CORS
- **Cursor & Claude Sonnet**: For vibe coding half of it 

## Development

Built with Vite for fast development and modern JavaScript tooling. The application is organized into modular components:

### Project Structure

- **`src/main.js`** - Application entry point, coordinates module initialization and render loop
- **`src/config.js`** - Configuration constants (zoom levels, tile sizes, fog parameters, GPS defaults)
- **`src/scene.js`** - Three.js scene, renderer, and camera setup
- **`src/video.js`** - Camera feed management and video texture handling
- **`src/utils.js`** - Utility functions (mobile detection, permissions, coordinate math)
- **`src/controls.js`** - Device orientation and mouse look controls with adaptive smoothing
- **`src/geolocation.js`** - GPS tracking, location management, and override system
- **`src/map.js`** - Leaflet map functionality for location selection
- **`src/tiles.js`** - Tile grid system, texture loading, and 3D plane positioning
- **`src/ui.js`** - UI element management, event handlers, and user interface controls
