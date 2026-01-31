import * as THREE from "three";
import type { AsciiAtlas } from "@/lib/asciiAtlas";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uScene;
  uniform sampler2D uAtlas;
  uniform vec2 uGridDims;    // (cols, rows) of ASCII grid
  uniform vec2 uAtlasGrid;   // (gridCols, gridRows) in atlas texture
  uniform float uCharCount;  // total chars in ramp
  uniform vec2 uResolution;  // output resolution in pixels

  varying vec2 vUv;

  void main() {
    // Which ASCII cell are we in?
    vec2 cell = floor(vUv * uGridDims);

    // UV center of this cell in the scene texture
    vec2 cellCenter = (cell + 0.5) / uGridDims;
    vec4 sceneColor = texture2D(uScene, cellCenter);

    // BT.601 luminance
    float lum = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));

    // Map luminance to character index
    float charIdx = floor(lum * (uCharCount - 1.0) + 0.5);
    charIdx = clamp(charIdx, 0.0, uCharCount - 1.0);

    // Find the glyph position in the atlas
    float atlasCol = mod(charIdx, uAtlasGrid.x);
    float atlasRow = floor(charIdx / uAtlasGrid.x);

    // UV within this cell [0,1]
    vec2 inCell = fract(vUv * uGridDims);

    // Map to atlas UV
    vec2 atlasUv = (vec2(atlasCol, atlasRow) + inCell) / uAtlasGrid;

    // Sample the glyph (white on black)
    float glyphAlpha = texture2D(uAtlas, atlasUv).r;

    // Output: scene color tinted by glyph shape
    gl_FragColor = vec4(sceneColor.rgb * glyphAlpha, 1.0);
  }
`;

/**
 * Create a ShaderMaterial that renders a scene texture as colored ASCII art
 * using a font atlas.
 */
export function createAsciiMaterial(
  sceneTexture: THREE.Texture,
  atlas: AsciiAtlas,
  gridCols: number,
  gridRows: number,
  resolution: THREE.Vector2,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uScene: { value: sceneTexture },
      uAtlas: { value: atlas.texture },
      uGridDims: { value: new THREE.Vector2(gridCols, gridRows) },
      uAtlasGrid: {
        value: new THREE.Vector2(atlas.gridCols, atlas.gridRows),
      },
      uCharCount: { value: atlas.charCount },
      uResolution: { value: resolution },
    },
    depthTest: false,
    depthWrite: false,
  });
}
