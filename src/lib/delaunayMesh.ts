import Delaunator from "delaunator";
import * as THREE from "three";

/**
 * Build a triangle mesh from an unstructured 3D point cloud using Delaunay
 * triangulation on the XY projection.
 *
 * Long edges (> `maxEdgeFactor` × average nearest-neighbor distance) are
 * filtered out to prevent large triangles spanning gaps.
 */
export function buildDelaunayMesh(
  positions: Float32Array,
  colors: Float32Array,
  count: number,
): THREE.BufferGeometry | null {
  if (count < 3) return null;

  // Project to 2D (XY) for triangulation
  const coords = new Float64Array(count * 2);
  for (let i = 0; i < count; i++) {
    coords[i * 2] = positions[i * 3]; // X
    coords[i * 2 + 1] = positions[i * 3 + 1]; // Y
  }

  const delaunay = new Delaunator(coords);
  const triangles = delaunay.triangles;

  // Compute average nearest-neighbor distance for edge filtering
  const avgNN = computeAvgNearestNeighbor(positions, count);
  const maxEdgeLen2 = (avgNN * 3) ** 2; // 3× average NN distance squared

  // Filter triangles with overly long edges
  const filteredIndices: number[] = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i];
    const b = triangles[i + 1];
    const c = triangles[i + 2];

    if (
      edgeLenSq(positions, a, b) <= maxEdgeLen2 &&
      edgeLenSq(positions, b, c) <= maxEdgeLen2 &&
      edgeLenSq(positions, c, a) <= maxEdgeLen2
    ) {
      filteredIndices.push(a, b, c);
    }
  }

  if (filteredIndices.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(filteredIndices);

  return geometry;
}

function edgeLenSq(positions: Float32Array, a: number, b: number): number {
  const ax = positions[a * 3],
    ay = positions[a * 3 + 1],
    az = positions[a * 3 + 2];
  const bx = positions[b * 3],
    by = positions[b * 3 + 1],
    bz = positions[b * 3 + 2];
  return (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
}

/**
 * Approximate average nearest-neighbor distance by sampling up to 200 points.
 */
function computeAvgNearestNeighbor(
  positions: Float32Array,
  count: number,
): number {
  const sampleCount = Math.min(count, 200);
  const step = Math.max(1, Math.floor(count / sampleCount));
  let totalDist = 0;
  let samples = 0;

  for (let i = 0; i < count; i += step) {
    let minDist2 = Infinity;
    const ix = positions[i * 3],
      iy = positions[i * 3 + 1],
      iz = positions[i * 3 + 2];

    for (let j = 0; j < count; j++) {
      if (j === i) continue;
      const dx = positions[j * 3] - ix;
      const dy = positions[j * 3 + 1] - iy;
      const dz = positions[j * 3 + 2] - iz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < minDist2) minDist2 = d2;
    }

    if (minDist2 < Infinity) {
      totalDist += Math.sqrt(minDist2);
      samples++;
    }
  }

  return samples > 0 ? totalDist / samples : 0.1;
}
