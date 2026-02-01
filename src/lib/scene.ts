import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildDelaunayMesh } from "@/lib/delaunayMesh";
import { buildGridMesh } from "@/lib/meshBuilder";
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
    meshNormals?: Float32Array;
    hasCustomNormals?: boolean;
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
  // Lighting
  // -----------------------------------------------------------------------
  // Hemisphere light provides soft, even illumination from all directions —
  // sky color from above, ground color from below. This prevents faces at
  // steep angles from going fully dark (which makes geometric gaps in
  // procedurally generated meshes much more visible).
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

  const originalPoints = new THREE.Points(geometry, material);
  scene.add(originalPoints);

  // -----------------------------------------------------------------------
  // Grid mesh (solid surface from depth cloud)
  // -----------------------------------------------------------------------
  let gridMeshObj: THREE.Mesh | null = null;
  let gridMeshGeometry: THREE.BufferGeometry | null = null;
  let gridMeshMaterial: THREE.MeshStandardMaterial | null = null;

  if (pointCloud?.grid) {
    gridMeshGeometry = buildGridMesh(pointCloud);
    gridMeshGeometry.computeVertexNormals();
    gridMeshMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.7,
      metalness: 0.0,
    });
    gridMeshObj = new THREE.Mesh(gridMeshGeometry, gridMeshMaterial);
    scene.add(gridMeshObj);
  }

  // When a grid mesh exists, prefer it over the raw point cloud for the
  // original depth data (the mesh looks better with lighting). Both are
  // always added to the scene; we just hide the redundant representation.
  if (gridMeshObj) {
    originalPoints.visible = false;
  }

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
    originalPoints.visible = visible;
    if (gridMeshObj) gridMeshObj.visible = visible;
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
      points: THREE.Points;
      geometry: THREE.BufferGeometry;
      material: THREE.ShaderMaterial;
      meshObj: THREE.Mesh | null;
      meshGeometry: THREE.BufferGeometry | null;
      meshMaterial: THREE.MeshStandardMaterial | null;
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
      vec2 coord = gl_PointCoord - vec2(0.5);
      float r2 = dot(coord, coord);
      if (r2 > 0.25) discard;
      float shading = 1.0 - r2 * 2.0;
      gl_FragColor = vec4(vColor * shading, 1.0);
    }
  `;

  function addLayer(layer: {
    id: string;
    positions: Float32Array;
    colors: Float32Array;
    sizes: Float32Array;
    count: number;
    meshPositions?: Float32Array;
    meshColors?: Float32Array;
    meshVertexCount?: number;
    meshNormals?: Float32Array;
    hasCustomNormals?: boolean;
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

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // Build mesh for the layer — use explicit mesh data if available,
    // otherwise fall back to Delaunay triangulation of point cloud
    let meshObj: THREE.Mesh | null = null;
    let meshGeometry: THREE.BufferGeometry | null = null;
    let meshMaterial: THREE.MeshStandardMaterial | null = null;

    const meshPositions = layer.meshPositions;
    const meshColors = layer.meshColors;
    const meshVertexCount = layer.meshVertexCount ?? 0;

    if (meshPositions && meshColors && meshVertexCount > 0) {
      // Explicit triangle mesh from emitTriangle/emitQuad or sdfMesh
      meshGeometry = new THREE.BufferGeometry();
      meshGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(meshPositions, 3),
      );
      meshGeometry.setAttribute(
        "color",
        new THREE.BufferAttribute(meshColors, 3),
      );

      // When the layer includes custom per-vertex normals (e.g., from SDF
      // gradient computation in marching cubes), use them directly with smooth
      // shading. This avoids the faceted look of flat shading and produces
      // organic, curved surfaces. Otherwise fall back to auto-computed face
      // normals with flat shading for hard-edged geometry like boxes.
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
      meshObj = new THREE.Mesh(meshGeometry, meshMaterial);
      scene.add(meshObj);
    } else {
      // Fall back to Delaunay triangulation
      const delaunayGeo = buildDelaunayMesh(
        layer.positions,
        layer.colors,
        layer.count,
      );
      if (delaunayGeo) {
        meshGeometry = delaunayGeo;
        meshGeometry.computeVertexNormals();
        meshMaterial = new THREE.MeshStandardMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          roughness: 0.7,
          metalness: 0.0,
        });
        meshObj = new THREE.Mesh(meshGeometry, meshMaterial);
        scene.add(meshObj);
      }
    }

    layers.set(layer.id, {
      points,
      geometry: geo,
      material: mat,
      meshObj,
      meshGeometry,
      meshMaterial,
    });
  }

  function removeLayer(id: string): void {
    const entry = layers.get(id);
    if (!entry) return;
    scene.remove(entry.points);
    entry.geometry.dispose();
    entry.material.dispose();
    if (entry.meshObj) {
      scene.remove(entry.meshObj);
      entry.meshGeometry?.dispose();
      entry.meshMaterial?.dispose();
    }
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
    if (gridMeshGeometry) gridMeshGeometry.dispose();
    if (gridMeshMaterial) gridMeshMaterial.dispose();
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
