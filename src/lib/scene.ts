import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PointCloud } from "./pointcloud";

export interface SceneHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  dispose: () => void;
}

export function createScene(
  pointCloud: PointCloud,
  width: number,
  height: number,
  controlsTarget: HTMLElement,
): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 1);
  // Hide the canvas — we only read pixels from it
  renderer.domElement.style.display = "none";

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -3);

  // Build point cloud geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(pointCloud.positions, 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(pointCloud.colors, 3),
  );

  const material = new THREE.PointsMaterial({
    size: 0.02,
    vertexColors: true,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // Orbit controls attached to the visible <pre> element
  const controls = new OrbitControls(camera, controlsTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.target.set(0, 0, -3);
  controls.update();

  function dispose() {
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    controls.dispose();
  }

  return { renderer, scene, camera, controls, dispose };
}
