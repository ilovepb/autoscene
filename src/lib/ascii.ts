// -----------------------------------------------------------------------
// ASCII Character Ramp
// -----------------------------------------------------------------------
// Characters are ordered from darkest (space = no ink) to brightest
// (@ = most ink). When we map a pixel's brightness to this ramp,
// bright pixels get dense characters and dark pixels get sparse ones,
// creating the illusion of shading in plain text.

export const CHAR_RAMP =
  " `.-':_,^=;><+!rc*/z?sLtv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";

export interface AsciiFrame {
  cols: number;
  rows: number;
  /** Index into CHAR_RAMP per cell, row-major top-to-bottom. */
  chars: Uint8Array;
  /** Per-cell red channel (0-255), used for colored ASCII output. */
  r: Uint8Array;
  /** Per-cell green channel (0-255). */
  g: Uint8Array;
  /** Per-cell blue channel (0-255). */
  b: Uint8Array;
}

/**
 * Read pixels from a WebGL renderer and produce a colored ASCII frame.
 *
 * Each pixel in the low-resolution WebGL framebuffer becomes one ASCII
 * character. The character is chosen based on the pixel's luminance
 * (perceived brightness), and the original RGB color is preserved for
 * colored text rendering.
 *
 * @param gl   - The WebGL context to read pixels from
 * @param cols - Number of columns (characters per row)
 * @param rows - Number of rows (lines of text)
 */
export function readAsciiFrame(
  gl: WebGLRenderingContext,
  cols: number,
  rows: number,
): AsciiFrame {
  // Read the entire framebuffer as RGBA bytes.
  const pixels = new Uint8Array(cols * rows * 4);
  gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  const total = cols * rows;
  const chars = new Uint8Array(total);
  const r = new Uint8Array(total);
  const g = new Uint8Array(total);
  const b = new Uint8Array(total);
  const rampMax = CHAR_RAMP.length - 1;

  // -----------------------------------------------------------------------
  // Row iteration order: bottom-to-top
  // -----------------------------------------------------------------------
  // WebGL's readPixels returns pixels in bottom-up order (row 0 = bottom
  // of the screen), but our ASCII output is top-down (row 0 = top line).
  // By iterating y from (rows-1) down to 0, we flip the image vertically
  // so it appears right-side-up in text.
  let outIndex = 0;
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = 0; x < cols; x++) {
      const pixelOffset = (y * cols + x) * 4;
      const pixelR = pixels[pixelOffset];
      const pixelG = pixels[pixelOffset + 1];
      const pixelB = pixels[pixelOffset + 2];

      // -----------------------------------------------------------------
      // Luminance (perceived brightness)
      // -----------------------------------------------------------------
      // The human eye is not equally sensitive to all colors. We see green
      // most strongly, red moderately, and blue least. The ITU-R BT.601
      // standard defines these weights to match human perception:
      //
      //   L = 0.299 * R + 0.587 * G + 0.114 * B
      //
      // This is the same formula used in NTSC television and JPEG compression.
      // A pure green pixel (0, 255, 0) appears much brighter to us than a
      // pure blue pixel (0, 0, 255), and these weights capture that.
      const luminance = 0.299 * pixelR + 0.587 * pixelG + 0.114 * pixelB;

      // Map luminance [0, 255] to a character ramp index [0, rampMax].
      // A luminance of 0 (black) maps to index 0 (space = empty).
      // A luminance of 255 (white) maps to the last character (@ = dense).
      chars[outIndex] = Math.round((luminance / 255) * rampMax);

      // Preserve the original color so the UI can render colored ASCII text.
      r[outIndex] = pixelR;
      g[outIndex] = pixelG;
      b[outIndex] = pixelB;

      outIndex++;
    }
  }

  return { cols, rows, chars, r, g, b };
}
