/**
 * Three.js scene, renderer, and camera setup
 */
import * as THREE from 'three';
import { fogNear, fogFar } from './config.js';

// Get canvas element
const canvas = document.getElementById('glscene');

// Create renderer
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

// Create scene
export const scene = new THREE.Scene();

// Create camera
export const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 15000);

// Handle window resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

