import * as THREE from "three";
import type { PointCloud } from "@/lib/pointcloud";

/**
 * Maximum Z-distance between adjacent vertices before a quad is considered
 * a depth discontinuity and skipped (prevents foreground–background bridges).
 */
const DEPTH_DISCONTINUITY_THRESHOLD = 0.5;

/**
 * Build a triangle mesh from a grid-structured point cloud.
 *
 * The depth-estimated cloud has a natural grid layout (every `step`th pixel
 * in row-major order). For each 2x2 quad of adjacent grid points we emit
 * two triangles, skipping quads that span depth discontinuities.
 *
 * The returned geometry shares the same position/color Float32Arrays as the
 * input (no data duplication) — only the index buffer is new.
 */
export function buildGridMesh(pointCloud: PointCloud): THREE.BufferGeometry {
  const { positions, colors, grid } = pointCloud;
  if (!grid) {
    throw new Error("buildGridMesh requires a PointCloud with grid metadata");
  }

  const { cols, rows } = grid;
  // Each interior cell produces 2 triangles (6 indices).
  // Maximum possible indices: (cols-1) * (rows-1) * 6
  const maxIndices = (cols - 1) * (rows - 1) * 6;
  const indices = new Uint32Array(maxIndices);
  let indexCount = 0;

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      // Grid indices for the four corners of this quad:
      //  tl --- tr
      //   |   / |
      //  bl --- br
      const tl = r * cols + c;
      const tr = tl + 1;
      const bl = (r + 1) * cols + c;
      const br = bl + 1;

      // Get Z values (index * 3 + 2 for the Z component)
      const zTL = positions[tl * 3 + 2];
      const zTR = positions[tr * 3 + 2];
      const zBL = positions[bl * 3 + 2];
      const zBR = positions[br * 3 + 2];

      // Skip quads where any vertex has been deleted (moved to HIDDEN_POS)
      if (zTL > 9999 || zTR > 9999 || zBL > 9999 || zBR > 9999) {
        continue;
      }

      // Depth discontinuity check — skip if any adjacent pair differs too much
      const t = DEPTH_DISCONTINUITY_THRESHOLD;
      if (
        Math.abs(zTL - zTR) > t ||
        Math.abs(zTL - zBL) > t ||
        Math.abs(zTR - zBR) > t ||
        Math.abs(zBL - zBR) > t ||
        Math.abs(zTL - zBR) > t ||
        Math.abs(zTR - zBL) > t
      ) {
        continue;
      }

      // Triangle 1: tl -> bl -> tr
      indices[indexCount++] = tl;
      indices[indexCount++] = bl;
      indices[indexCount++] = tr;

      // Triangle 2: tr -> bl -> br
      indices[indexCount++] = tr;
      indices[indexCount++] = bl;
      indices[indexCount++] = br;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(
    new THREE.BufferAttribute(indices.subarray(0, indexCount), 1),
  );

  return geometry;
}
