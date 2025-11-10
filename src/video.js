/**
 * Camera feed management
 */
import * as THREE from 'three';
import { scene } from './scene.js';

// Video element for camera feed
const video = document.createElement('video');
video.setAttribute('playsinline', '');
video.muted = true;
let videoStarted = false;

/**
 * Start the camera feed and set it as the scene background
 */
export async function startVideo() {
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

