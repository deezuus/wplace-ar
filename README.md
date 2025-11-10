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

The app uses your device's geolocation to determine which section of the wplace to display. The wplace map appears as a plane floating above you in 3D space, viewable through your device's camera feed. The experience adapts automatically between mobile AR mode (using device orientation) and desktop mode (using mouse controls).

To get around CORS, requests to the API are routed through a Cloudflare Worker proxy. I turn this worker on/off to prevent abuse while developing at the moment so it may not always be available. The goal is to open this up when I'm happy with the state of the project to share to others.

## Cloudflare Worker Proxy

The proxy worker handles CORS by forwarding requests to the wplace.live backend, sanitizing headers, and caching responses for improved performance. It normalizes cache keys (ignoring timestamp query parameters) and implements a 24-hour cache with stale-while-revalidate for up to 7 days.

```javascript
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/wplace/")) {
      return new Response("Not found", { status: 404 });
    }

    const upstream = new URL(
      "https://backend.wplace.live" + url.pathname.replace(/^\/wplace/, "")
    );
    upstream.search = url.search;

    // Normalize cache key (ignore ?t=...)
    const cacheKeyURL = new URL(upstream);
    cacheKeyURL.searchParams.delete("t");
    const cache = caches.default;

    let cached = await cache.match(cacheKeyURL.toString());
    let r = cached;
    if (!r) {
      const u = await fetch(upstream.toString(), { method: "GET" });
      r = new Response(u.body, u);
    }

    // Sanitize + set our headers
    const h = new Headers(r.headers);
    h.delete("access-control-allow-origin");
    h.delete("access-control-allow-credentials");
    h.delete("set-cookie");
    if (!h.get("content-type")) h.set("content-type", "image/png");

    // For dev: allow any origin (safe since no credentials)
    h.set("Access-Control-Allow-Origin", "*");

    // Caching (store the sanitized response so wplace headers don't reappear)
    h.set(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    const sanitized = new Response(r.body, { status: r.status, headers: h });

    if (!cached) {
      ctx.waitUntil(cache.put(cacheKeyURL.toString(), sanitized.clone()));
    }

    return sanitized;
  }
};
```

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
