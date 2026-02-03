import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { GeneratedLayer } from "@/lib/procedural/engine";

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
  /** Add a procedural mesh layer to the scene. */
  addLayer: (layer: GeneratedLayer) => void;
  /** Remove a procedural layer by id. */
  removeLayer: (id: string) => void;
  /** Remove all procedural layers. */
  clearLayers: () => void;
  /** Get all procedural layer IDs. */
  getLayerIds: () => string[];
}

/**
 * Create a Three.js scene with standard shaded mesh rendering,
 * orbit controls, and WASD movement.
 */
export function createScene(
  width: number,
  height: number,
  controlsTarget: HTMLElement,
): SceneHandle {
  // -----------------------------------------------------------------------
  // Renderer setup — visible canvas for standard WebGL rendering
  // -----------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();

  // -----------------------------------------------------------------------
  // Lighting
  // -----------------------------------------------------------------------
  // Hemisphere light provides soft, even illumination from all directions —
  // sky color from above, ground color from below.
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 0.8);
  scene.add(hemiLight);
  // Key light from upper-right-front
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
  keyLight.position.set(1, 2, 3);
  scene.add(keyLight);
  // Fill light from lower-left-back at lower intensity to soften shadows
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
  fillLight.position.set(-1, -1, -2);
  scene.add(fillLight);

  // -----------------------------------------------------------------------
  // Camera
  // -----------------------------------------------------------------------
  // PerspectiveCamera looks down its local -Z axis by default. We place the
  // camera at the origin and point it at (0, 0, -3), the approximate center
  // of the default scene volume.
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -3);

  // -----------------------------------------------------------------------
  // Orbit controls
  // -----------------------------------------------------------------------
  const controls = new OrbitControls(camera, controlsTarget);
  // Damping adds inertia for smoother interaction
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
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
  // Procedural layers — mesh-only rendering
  // -----------------------------------------------------------------------
  const layers = new Map<
    string,
    {
      meshObj: THREE.Mesh;
      meshGeometry: THREE.BufferGeometry;
      meshMaterial: THREE.MeshStandardMaterial;
    }
  >();

  function addLayer(layer: GeneratedLayer): void {
    removeLayer(layer.id);

    if (layer.meshVertexCount <= 0) return;

    const meshGeometry = new THREE.BufferGeometry();
    meshGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(layer.meshPositions, 3),
    );
    meshGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(layer.meshColors, 3),
    );

    let meshMaterial: THREE.MeshStandardMaterial;

    // When the layer includes custom per-vertex normals (e.g., from SDF
    // gradient computation in marching cubes), use them directly with smooth
    // shading. This produces organic, curved surfaces. Otherwise fall back
    // to auto-computed face normals with flat shading for hard-edged geometry.
    if (layer.hasCustomNormals && layer.meshNormals) {
      meshGeometry.setAttribute(
        "normal",
        new THREE.BufferAttribute(layer.meshNormals, 3),
      );
      meshMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.55,
        metalness: 0.0,
        flatShading: false,
      });
    } else {
      meshGeometry.computeVertexNormals();
      meshMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.55,
        metalness: 0.0,
        flatShading: true,
      });
    }

    const meshObj = new THREE.Mesh(meshGeometry, meshMaterial);
    scene.add(meshObj);

    layers.set(layer.id, {
      meshObj,
      meshGeometry,
      meshMaterial,
    });
  }

  function removeLayer(id: string): void {
    const entry = layers.get(id);
    if (!entry) return;
    scene.remove(entry.meshObj);
    entry.meshGeometry.dispose();
    entry.meshMaterial.dispose();
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
    // After changing the aspect ratio, recompute the projection matrix
    camera.updateProjectionMatrix();
  }

  function dispose(): void {
    if (keyboardEl) {
      keyboardEl.removeEventListener("keydown", onKeyDown);
      keyboardEl.removeEventListener("keyup", onKeyUp);
    }
    clearLayers();
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
  };
}
