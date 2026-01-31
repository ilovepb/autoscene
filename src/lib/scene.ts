import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PointCloud } from "@/lib/pointcloud";

export interface SceneHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  resize: (width: number, height: number) => void;
  dispose: () => void;
  /** Call each frame to apply WASD/arrow-key movement. */
  updateMovement: (dt: number) => void;
  /** Attach keyboard listeners to the given element. */
  attachKeyboard: (el: HTMLElement) => void;
  /** Add a procedural layer of points to the scene. */
  addLayer: (layer: {
    id: string;
    positions: Float32Array;
    colors: Float32Array;
    sizes: Float32Array;
    count: number;
  }) => void;
  /** Remove a procedural layer by id. */
  removeLayer: (id: string) => void;
  /** Remove all procedural layers. */
  clearLayers: () => void;
  /** Get all procedural layer IDs. */
  getLayerIds: () => string[];
  /** Delete original point cloud points within a bounding box. Returns count of deleted points. */
  deletePointsInRegion: (region: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  }) => number;
  /** Delete original point cloud points within a sphere. Returns count of deleted points. */
  deletePointsInSphere: (
    center: { x: number; y: number; z: number },
    radius: number,
  ) => number;
  /** Toggle visibility of the original point cloud. */
  setOriginalCloudVisible: (visible: boolean) => void;
}

/**
 * Create a Three.js scene containing a colored point cloud, with orbit
 * controls for interactive rotation/zoom.
 *
 * The renderer's canvas is hidden because we never display it directly --
 * instead, the AsciiViewer reads its pixels each frame and converts them
 * to ASCII characters.
 */
export interface SceneOptions {
  antialias?: boolean;
  hidden?: boolean;
}

export function createScene(
  pointCloud: PointCloud | null,
  width: number,
  height: number,
  controlsTarget: HTMLElement,
  options?: SceneOptions,
): SceneHandle {
  // -----------------------------------------------------------------------
  // Renderer setup
  // -----------------------------------------------------------------------
  const { antialias = false, hidden = true } = options ?? {};
  const renderer = new THREE.WebGLRenderer({ antialias });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 1);
  if (hidden) {
    renderer.domElement.style.display = "none";
  }

  const scene = new THREE.Scene();

  // -----------------------------------------------------------------------
  // Camera
  // -----------------------------------------------------------------------
  // Three.js uses a right-handed coordinate system:
  //   X = right, Y = up, Z = toward the viewer (out of the screen)
  //
  // A PerspectiveCamera looks down its local -Z axis by default. We place
  // the camera at the origin (0, 0, 0) and point it at (0, 0, -3), which
  // is the approximate center of our point cloud (which lives at Z = -1
  // to Z = -6, see pointcloud.ts).
  //
  // The 60-degree FOV matches the assumed FOV used during backprojection,
  // so the initial view roughly reconstructs the original image perspective.
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -3);

  // -----------------------------------------------------------------------
  // Point cloud geometry
  // -----------------------------------------------------------------------
  const geometry = new THREE.BufferGeometry();
  const emptyPositions = new Float32Array(0);
  const emptyColors = new Float32Array(0);
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      pointCloud ? pointCloud.positions : emptyPositions,
      3,
    ),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(pointCloud ? pointCloud.colors : emptyColors, 3),
  );

  // Each 3D point is rendered as a small square sprite. `sizeAttenuation`
  // makes distant points appear smaller, just like real perspective.
  // `vertexColors` tells Three.js to use the per-vertex color attribute
  // rather than a single uniform color.
  const material = new THREE.PointsMaterial({
    size: 0.035,
    vertexColors: true,
    sizeAttenuation: true,
  });

  const originalMesh = new THREE.Points(geometry, material);
  scene.add(originalMesh);

  // We keep a hidden-point position so deleted points are moved off-screen
  // rather than removed from the buffer (avoids expensive array rebuilds).
  const HIDDEN_POS = 99999;

  function deletePointsInRegion(region: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  }): number {
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    let deleted = 0;
    for (let i = 0; i < posAttr.count; i++) {
      const idx = i * 3;
      const x = arr[idx];
      const y = arr[idx + 1];
      const z = arr[idx + 2];
      if (
        x >= region.minX &&
        x <= region.maxX &&
        y >= region.minY &&
        y <= region.maxY &&
        z >= region.minZ &&
        z <= region.maxZ
      ) {
        arr[idx] = HIDDEN_POS;
        arr[idx + 1] = HIDDEN_POS;
        arr[idx + 2] = HIDDEN_POS;
        deleted++;
      }
    }
    if (deleted > 0) {
      posAttr.needsUpdate = true;
    }
    return deleted;
  }

  function deletePointsInSphere(
    center: { x: number; y: number; z: number },
    radius: number,
  ): number {
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const r2 = radius * radius;
    let deleted = 0;
    for (let i = 0; i < posAttr.count; i++) {
      const idx = i * 3;
      const dx = arr[idx] - center.x;
      const dy = arr[idx + 1] - center.y;
      const dz = arr[idx + 2] - center.z;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        arr[idx] = HIDDEN_POS;
        arr[idx + 1] = HIDDEN_POS;
        arr[idx + 2] = HIDDEN_POS;
        deleted++;
      }
    }
    if (deleted > 0) {
      posAttr.needsUpdate = true;
    }
    return deleted;
  }

  function setOriginalCloudVisible(visible: boolean): void {
    originalMesh.visible = visible;
  }

  // -----------------------------------------------------------------------
  // Orbit controls
  // -----------------------------------------------------------------------
  // OrbitControls let the user rotate, pan, and zoom the camera around a
  // target point. We attach them to the visible <pre> element (not the
  // hidden canvas) so mouse/touch events are captured from what the user
  // actually sees.
  const controls = new OrbitControls(camera, controlsTarget);
  // Damping adds inertia -- the scene keeps rotating slightly after the
  // user releases the mouse, which feels more natural.
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  // The orbit target is the center of the point cloud depth range.
  controls.target.set(0, 0, -3);
  controls.update();

  // -----------------------------------------------------------------------
  // WASD / arrow-key walking
  // -----------------------------------------------------------------------
  const keysDown = new Set<string>();
  const MOVE_SPEED = 2; // units per second

  const _forward = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _move = new THREE.Vector3();

  function updateMovement(dt: number): void {
    _move.set(0, 0, 0);

    // Camera's forward direction (into the screen, along -Z in camera space)
    camera.getWorldDirection(_forward);
    // Keep movement horizontal by zeroing the Y component
    _forward.y = 0;
    _forward.normalize();

    // Right vector from the forward direction
    _right.crossVectors(_forward, camera.up).normalize();

    if (keysDown.has("w") || keysDown.has("arrowup")) _move.add(_forward);
    if (keysDown.has("s") || keysDown.has("arrowdown")) _move.sub(_forward);
    if (keysDown.has("a") || keysDown.has("arrowleft")) _move.sub(_right);
    if (keysDown.has("d") || keysDown.has("arrowright")) _move.add(_right);
    if (keysDown.has(" ")) _move.y += 1;
    if (keysDown.has("shift")) _move.y -= 1;

    if (_move.lengthSq() === 0) return;
    _move.normalize().multiplyScalar(MOVE_SPEED * dt);

    camera.position.add(_move);
    controls.target.add(_move);
  }

  function onKeyDown(e: KeyboardEvent): void {
    keysDown.add(e.key.toLowerCase());
  }
  function onKeyUp(e: KeyboardEvent): void {
    keysDown.delete(e.key.toLowerCase());
  }

  let keyboardEl: HTMLElement | null = null;

  function attachKeyboard(el: HTMLElement): void {
    keyboardEl = el;
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("keyup", onKeyUp);
  }

  // -----------------------------------------------------------------------
  // Procedural layers
  // -----------------------------------------------------------------------
  const layers = new Map<
    string,
    {
      mesh: THREE.Points;
      geometry: THREE.BufferGeometry;
      material: THREE.ShaderMaterial;
    }
  >();

  const layerVertexShader = `
    attribute float size;
    varying vec3 vColor;
    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const layerFragmentShader = `
    varying vec3 vColor;
    void main() {
      gl_FragColor = vec4(vColor, 1.0);
    }
  `;

  function addLayer(layer: {
    id: string;
    positions: Float32Array;
    colors: Float32Array;
    sizes: Float32Array;
    count: number;
  }): void {
    removeLayer(layer.id);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(layer.positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(layer.colors, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(layer.sizes, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: layerVertexShader,
      fragmentShader: layerFragmentShader,
      vertexColors: true,
    });

    const mesh = new THREE.Points(geo, mat);
    scene.add(mesh);
    layers.set(layer.id, { mesh, geometry: geo, material: mat });
  }

  function removeLayer(id: string): void {
    const entry = layers.get(id);
    if (!entry) return;
    scene.remove(entry.mesh);
    entry.geometry.dispose();
    entry.material.dispose();
    layers.delete(id);
  }

  function clearLayers(): void {
    for (const id of layers.keys()) {
      removeLayer(id);
    }
  }

  function getLayerIds(): string[] {
    return Array.from(layers.keys());
  }

  function resize(w: number, h: number): void {
    renderer.setSize(w, h);
    camera.aspect = w / h;
    // After changing the aspect ratio, we must recompute the projection
    // matrix so the scene doesn't appear stretched.
    camera.updateProjectionMatrix();
  }

  function dispose(): void {
    if (keyboardEl) {
      keyboardEl.removeEventListener("keydown", onKeyDown);
      keyboardEl.removeEventListener("keyup", onKeyUp);
    }
    clearLayers();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    controls.dispose();
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    resize,
    dispose,
    updateMovement,
    attachKeyboard,
    addLayer,
    removeLayer,
    clearLayers,
    getLayerIds,
    deletePointsInRegion,
    deletePointsInSphere,
    setOriginalCloudVisible,
  };
}
