import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { GeneratedLayer } from "@/lib/procedural/engine";

export interface SceneHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Post-processing effect composer — call composer.render() instead of renderer.render(). */
  composer: EffectComposer;
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
  /** Set visibility of a procedural layer by id. */
  setLayerVisible: (id: string, visible: boolean) => void;
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
  // Dark blue-black clear color to blend with environment lighting
  renderer.setClearColor(0x0a0a0f, 1);
  // ACES Filmic tone mapping compresses HDR highlights into LDR range
  // with a film-like S-curve, preserving detail in bright areas
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  // Enable shadow maps with PCF soft filtering for smooth shadow edges
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();

  // -----------------------------------------------------------------------
  // Environment map — procedural IBL for realistic material reflections
  // -----------------------------------------------------------------------
  // PMREMGenerator pre-filters an environment map into mip levels suitable
  // for roughness-based image-based lighting (IBL) on MeshStandardMaterial.
  // RoomEnvironment provides a neutral indoor lighting setup without needing
  // to load an external HDRI texture.
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment()).texture;
  pmremGenerator.dispose();
  // Dial back IBL intensity so it provides subtle fill/reflections without
  // washing out surface contrast. Full intensity makes everything look milky.
  scene.environmentIntensity = 0.35;

  // -----------------------------------------------------------------------
  // Lighting
  // -----------------------------------------------------------------------

  // Key directional light — primary shadow caster from upper-right-front.
  // Positioned at (2, 4, 1) aiming at scene center (0, 0, -3).
  // Higher intensity (1.8) compensates for reduced env map and removed hemisphere.
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
  keyLight.position.set(2, 4, 1);
  keyLight.target.position.set(0, 0, -3);
  // The target must be added to the scene so its world matrix is updated,
  // otherwise the light direction won't track the target position.
  scene.add(keyLight.target);
  keyLight.castShadow = true;
  // 2048x2048 shadow map for crisp shadow detail
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  // Small negative bias prevents shadow acne (surface self-shadowing artifacts)
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  // Fill light from left-rear to soften harsh shadows — no shadow casting
  // to keep the shadow map cost low (only key light casts shadows).
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
  fillLight.position.set(-2, 1, -5);
  scene.add(fillLight);

  // -----------------------------------------------------------------------
  // Ground plane — invisible shadow receiver
  // -----------------------------------------------------------------------
  // A horizontal plane at Y=-1.5 (bottom of scene volume) using ShadowMaterial
  // which is fully transparent except where shadows fall. This grounds objects
  // visually without adding a visible floor surface.
  const groundGeo = new THREE.PlaneGeometry(20, 20);
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
  const groundPlane = new THREE.Mesh(groundGeo, groundMat);
  // Rotate from default XY orientation to horizontal XZ plane
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -1.5;
  groundPlane.receiveShadow = true;
  // Tag for identification so we can exclude from GLB export
  groundPlane.userData.isGroundPlane = true;
  scene.add(groundPlane);

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
  // Post-processing — SSAO + Bloom via EffectComposer
  // -----------------------------------------------------------------------
  // The composer chains render passes: scene render → SSAO (ambient occlusion
  // in screen space) → Bloom (glow on bright areas) → OutputPass (tone mapping
  // and color space conversion for final display).
  const composer = new EffectComposer(renderer);

  // RenderPass draws the scene into the composer's framebuffer
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // SSAOPass adds screen-space ambient occlusion — darkens crevices and
  // contact areas for depth perception. Small kernel radius keeps the
  // effect subtle and localized.
  const ssaoPass = new SSAOPass(scene, camera, width, height);
  ssaoPass.kernelRadius = 0.3;
  ssaoPass.minDistance = 0.001;
  ssaoPass.maxDistance = 0.05;
  composer.addPass(ssaoPass);

  // UnrealBloomPass adds a soft glow to bright areas. Low strength (0.15)
  // and high threshold (0.9) keep bloom minimal — only specular highlights
  // and emissive regions glow, avoiding a washed-out look.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.15, // strength
    0.4, // radius
    0.9, // threshold
  );
  composer.addPass(bloomPass);

  // OutputPass applies tone mapping and converts to the output color space
  // (sRGB). Must be the last pass in the chain.
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

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

    // Read per-layer material properties from procedural code, falling back
    // to sensible defaults (matte, non-metallic, fully opaque).
    const roughness = layer.materialProps?.roughness ?? 0.55;
    const metalness = layer.materialProps?.metalness ?? 0.0;
    const opacity = layer.materialProps?.opacity ?? 1.0;
    const transparent = opacity < 1.0;

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
        roughness,
        metalness,
        ...(transparent ? { opacity, transparent: true } : {}),
        flatShading: false,
      });
    } else {
      meshGeometry.computeVertexNormals();
      meshMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness,
        metalness,
        ...(transparent ? { opacity, transparent: true } : {}),
        flatShading: true,
      });
    }

    const meshObj = new THREE.Mesh(meshGeometry, meshMaterial);
    // Enable shadow casting and receiving for realistic grounding
    meshObj.castShadow = true;
    meshObj.receiveShadow = true;
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

  function setLayerVisible(id: string, visible: boolean): void {
    const entry = layers.get(id);
    if (entry) {
      entry.meshObj.visible = visible;
    }
  }

  function resize(w: number, h: number): void {
    renderer.setSize(w, h);
    composer.setSize(w, h);
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
    // Clean up ground plane GPU resources
    groundGeo.dispose();
    groundMat.dispose();
    scene.remove(groundPlane);
    // Dispose post-processing render targets and passes
    composer.dispose();
    renderer.dispose();
    controls.dispose();
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    composer,
    resize,
    dispose,
    updateMovement,
    attachKeyboard,
    addLayer,
    removeLayer,
    clearLayers,
    getLayerIds,
    setLayerVisible,
  };
}
