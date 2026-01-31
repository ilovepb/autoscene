import * as THREE from "three";
import type { AsciiAtlas } from "@/lib/asciiAtlas";
import { createAsciiMaterial } from "@/lib/asciiShader";

export interface AsciiPass {
  /**
   * Render the scene as ASCII art to the screen.
   * 1. Renders the 3D scene into a low-res render target (stays on GPU).
   * 2. Draws a fullscreen quad with the ASCII shader to the default framebuffer.
   */
  render: (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) => void;
  /** Update grid dimensions on window resize. */
  resize: (width: number, height: number, charW: number, charH: number) => void;
  /** Clean up all GPU resources. */
  dispose: () => void;
}

/**
 * Create a two-pass ASCII rendering pipeline:
 * - Pass 1: scene → low-res WebGLRenderTarget (grid resolution)
 * - Pass 2: fullscreen quad with ASCII shader → screen
 */
export function createAsciiPass(
  atlas: AsciiAtlas,
  cols: number,
  rows: number,
  outputWidth: number,
  outputHeight: number,
): AsciiPass {
  // Render target at grid resolution (1 texel per ASCII cell)
  let rt = new THREE.WebGLRenderTarget(cols, rows, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });

  const resolution = new THREE.Vector2(outputWidth, outputHeight);
  const material = createAsciiMaterial(
    rt.texture,
    atlas,
    cols,
    rows,
    resolution,
  );

  // Fullscreen quad
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadMesh = new THREE.Mesh(quadGeo, material);
  const quadScene = new THREE.Scene();
  quadScene.add(quadMesh);

  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): void {
    // Pass 1: render 3D scene to low-res RT
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);

    // Pass 2: render ASCII quad to screen
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCamera);
  }

  function resize(
    width: number,
    height: number,
    charW: number,
    charH: number,
  ): void {
    const newCols = Math.max(Math.floor(width / charW), 40);
    const newRows = Math.max(Math.floor(height / charH), 20);

    // Recreate render target at new grid size
    rt.dispose();
    rt = new THREE.WebGLRenderTarget(newCols, newRows, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });

    // Update uniforms
    material.uniforms.uScene.value = rt.texture;
    material.uniforms.uGridDims.value.set(newCols, newRows);
    resolution.set(width, height);
  }

  function dispose(): void {
    rt.dispose();
    quadGeo.dispose();
    material.dispose();
    atlas.texture.dispose();
  }

  return { render, resize, dispose };
}
