<img width="1693" height="2048" alt="Pasted image 20250817152522" src="https://github.com/user-attachments/assets/4087b916-221e-452e-8d6c-7b998e837ede" /> 



<div align="center">
  <i>The Inspiration</i>
  
  (Thanks [vonixskulls](https://x.com/vonixskulls/status/1953965288514265576) and [m1stakezwermade](https://x.com/m1stakezwermade/status/1954023746270114144) on Twitter)
</div>

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

The app uses your device's geolocation to determine which section of the collaborative canvas to display. This artwork appears as a plane floating above you in 3D space, viewable through your device's camera feed. The experience adapts automatically between mobile AR mode (using device orientation) and desktop mode (using mouse controls).

To get around CORS at the moment, requests to the API are routed through a Cloudflare Worker proxy. I turn this worker on/off to prevent abuse while developing at the moment so it may not always be available. The goal is to open this up when I'm happy with the state of the project to share to others.

## Quick Start

1. Open the app in a web browser (HTTPS required for camera/motion permissions)
2. Grant camera and location permissions when prompted
3. On iOS devices, grant motion/orientation permissions
4. Tap "Start AR" to begin the experience
5. Look up to see the floating artwork in the sky
6. Use "Recenter Sky" to reset the artwork position above you

## Technical Stack

- **Three.js**: 3D graphics and WebGL rendering
- **WebRTC**: Camera feed integration
- **Geolocation API**: GPS positioning
- **Device Orientation API**: Mobile gyroscope/accelerometer access

## Development

Built with Vite for fast development and modern JavaScript tooling. The main application logic is in `src/main.js`
