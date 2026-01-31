const CHAR_RAMP = " .:-=+*#%@";

/**
 * Read pixels from a WebGL renderer and convert to an ASCII string.
 * WebGL pixels are bottom-up, so we iterate rows in reverse.
 */
export function renderAscii(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
): string {
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  const rows: string[] = [];
  const rampMax = CHAR_RAMP.length - 1;

  // WebGL pixel buffer is bottom-up; iterate top-down for correct orientation
  for (let y = height - 1; y >= 0; y--) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const charIdx = Math.round((luminance / 255) * rampMax);
      row += CHAR_RAMP[charIdx];
    }
    rows.push(row);
  }

  return rows.join("\n");
}
