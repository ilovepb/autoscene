import * as THREE from "three";
import { CHAR_RAMP } from "@/lib/ascii";

export interface AsciiAtlas {
  texture: THREE.CanvasTexture;
  /** Number of columns in the glyph grid. */
  gridCols: number;
  /** Number of rows in the glyph grid. */
  gridRows: number;
  /** Total number of characters in the ramp. */
  charCount: number;
}

const GLYPH_SIZE = 32;
const GRID_COLS = 16;

/**
 * Render all CHAR_RAMP characters as white-on-black glyphs into a canvas,
 * then wrap as a Three.js texture for GPU sampling.
 *
 * Must be called after fonts are loaded (awaits `document.fonts.ready`).
 */
export async function createAsciiAtlas(): Promise<AsciiAtlas> {
  await document.fonts.ready;

  const charCount = CHAR_RAMP.length;
  const gridCols = GRID_COLS;
  const gridRows = Math.ceil(charCount / gridCols);

  const canvas = document.createElement("canvas");
  canvas.width = gridCols * GLYPH_SIZE;
  canvas.height = gridRows * GLYPH_SIZE;

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#fff";
  ctx.font = `${GLYPH_SIZE * 0.75}px "JetBrains Mono", monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  for (let i = 0; i < charCount; i++) {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    const x = (col + 0.5) * GLYPH_SIZE;
    const y = (row + 0.5) * GLYPH_SIZE;
    ctx.fillText(CHAR_RAMP[i], x, y);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;

  return { texture, gridCols, gridRows, charCount };
}
