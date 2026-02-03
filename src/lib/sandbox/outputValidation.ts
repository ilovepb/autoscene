import type { GeneratedLayer } from "@/lib/procedural/engine";

/** Soft warning threshold — mesh may be slow to render */
const WARN_VERTEX_COUNT = 100_000;
/** Hard error threshold — mesh will likely crash the browser */
const ERROR_VERTEX_COUNT = 500_000;
/** Maximum absolute coordinate value for any vertex */
const MAX_BOUNDS = 1000;

export interface MeshValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validate the output of procedural mesh generation.
 *
 * Checks for:
 * - Vertex count limits (warn at 100k, error at 500k)
 * - NaN or Infinity values in positions, colors, and normals
 * - Vertices outside a reasonable coordinate range
 * - Degenerate (zero-area) triangles
 */
export function validateMeshOutput(
  layer: GeneratedLayer,
): MeshValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const vc = layer.meshVertexCount;

  // --- Vertex count ---
  if (vc >= ERROR_VERTEX_COUNT) {
    errors.push(
      `Mesh has ${vc.toLocaleString()} vertices (limit: ${ERROR_VERTEX_COUNT.toLocaleString()})`,
    );
  } else if (vc >= WARN_VERTEX_COUNT) {
    warnings.push(
      `Mesh has ${vc.toLocaleString()} vertices — may be slow to render`,
    );
  }

  if (vc === 0) {
    warnings.push("Mesh produced zero vertices");
    return { valid: true, warnings, errors };
  }

  // --- NaN / Infinity / bounds check on positions ---
  let nanPositions = 0;
  let outOfBounds = 0;
  for (let i = 0; i < vc * 3; i++) {
    const v = layer.meshPositions[i];
    if (!Number.isFinite(v)) {
      nanPositions++;
    } else if (Math.abs(v) > MAX_BOUNDS) {
      outOfBounds++;
    }
  }
  if (nanPositions > 0) {
    errors.push(`${nanPositions} NaN/Infinity values in mesh positions`);
  }
  if (outOfBounds > 0) {
    warnings.push(
      `${outOfBounds} position values exceed ±${MAX_BOUNDS} — mesh may be invisible`,
    );
  }

  // --- NaN / Infinity check on colors ---
  let nanColors = 0;
  for (let i = 0; i < vc * 3; i++) {
    if (!Number.isFinite(layer.meshColors[i])) {
      nanColors++;
    }
  }
  if (nanColors > 0) {
    warnings.push(`${nanColors} NaN/Infinity values in mesh colors`);
  }

  // --- NaN / Infinity check on normals (if present) ---
  if (layer.hasCustomNormals && layer.meshNormals) {
    let nanNormals = 0;
    for (let i = 0; i < vc * 3; i++) {
      if (!Number.isFinite(layer.meshNormals[i])) {
        nanNormals++;
      }
    }
    if (nanNormals > 0) {
      warnings.push(`${nanNormals} NaN/Infinity values in mesh normals`);
    }
  }

  // --- Degenerate triangle detection (zero-area) ---
  // Check a sample of triangles to avoid O(n) cost on huge meshes
  const triCount = Math.floor(vc / 3);
  const sampleSize = Math.min(triCount, 1000);
  const step = Math.max(1, Math.floor(triCount / sampleSize));
  let degenerateCount = 0;

  for (let t = 0; t < triCount; t += step) {
    const base = t * 9;
    // Triangle vertices: v0, v1, v2
    const ax = layer.meshPositions[base + 3] - layer.meshPositions[base];
    const ay = layer.meshPositions[base + 4] - layer.meshPositions[base + 1];
    const az = layer.meshPositions[base + 5] - layer.meshPositions[base + 2];
    const bx = layer.meshPositions[base + 6] - layer.meshPositions[base];
    const by = layer.meshPositions[base + 7] - layer.meshPositions[base + 1];
    const bz = layer.meshPositions[base + 8] - layer.meshPositions[base + 2];
    // Cross product magnitude = 2x triangle area
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const area2 = cx * cx + cy * cy + cz * cz;
    if (area2 < 1e-20) {
      degenerateCount++;
    }
  }

  if (degenerateCount > 0) {
    const estimated =
      step > 1 ? ` (~${degenerateCount * step} estimated total)` : "";
    warnings.push(
      `${degenerateCount} degenerate (zero-area) triangles in sample${estimated}`,
    );
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
