export interface SceneBounds {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  pointCount: number;
}

export interface GeneratedLayer {
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
}

export interface LayerMeta {
  id: string;
  description: string;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
  };
  pointCount: number;
  meshVertexCount: number;
}

/** Compute bounding box from a generated layer's point and mesh positions. */
export function computeLayerBounds(
  layer: GeneratedLayer,
): Omit<LayerMeta, "description"> {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  // Scan emit() point positions
  for (let i = 0; i < layer.count; i++) {
    const x = layer.positions[i * 3];
    const y = layer.positions[i * 3 + 1];
    const z = layer.positions[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  // Scan mesh vertex positions (sdfMesh, lathe, box, grid, etc.)
  const mc = layer.meshVertexCount ?? 0;
  if (layer.meshPositions && mc > 0) {
    for (let i = 0; i < mc; i++) {
      const x = layer.meshPositions[i * 3];
      const y = layer.meshPositions[i * 3 + 1];
      const z = layer.meshPositions[i * 3 + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }

  // If no geometry was produced, return zeroed bounds instead of Infinity/NaN
  const empty = minX === Infinity;
  return {
    id: layer.id,
    bounds: {
      min: empty ? [0, 0, 0] : [minX, minY, minZ],
      max: empty ? [0, 0, 0] : [maxX, maxY, maxZ],
      center: empty
        ? [0, 0, 0]
        : [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    },
    pointCount: layer.count,
    meshVertexCount: mc,
  };
}

export function computeSceneBounds(
  positions: Float32Array,
  count: number,
): SceneBounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    pointCount: count,
  };
}

const WORKER_SOURCE = `
// --- Seeded PRNG (mulberry32) ---
let _seed = 42;
function _mulberry32() {
  _seed |= 0;
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// --- Simple value noise ---
function _hash2(ix, iy) {
  let h = ix * 374761393 + iy * 668265263 + _seed;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function _hash3(ix, iy, iz) {
  let h = ix * 374761393 + iy * 668265263 + iz * 1440670961 + _seed;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function _lerp(a, b, t) { return a + (b - a) * t; }
function _smooth(t) { return t * t * (3 - 2 * t); }

function noise2D(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = _smooth(x - ix), fy = _smooth(y - iy);
  const a = _lerp(_hash2(ix, iy), _hash2(ix + 1, iy), fx);
  const b = _lerp(_hash2(ix, iy + 1), _hash2(ix + 1, iy + 1), fx);
  return _lerp(a, b, fy) * 2 - 1;
}

function noise3D(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = _smooth(x - ix), fy = _smooth(y - iy), fz = _smooth(z - iz);
  const a00 = _lerp(_hash3(ix, iy, iz), _hash3(ix+1, iy, iz), fx);
  const a10 = _lerp(_hash3(ix, iy+1, iz), _hash3(ix+1, iy+1, iz), fx);
  const a01 = _lerp(_hash3(ix, iy, iz+1), _hash3(ix+1, iy, iz+1), fx);
  const a11 = _lerp(_hash3(ix, iy+1, iz+1), _hash3(ix+1, iy+1, iz+1), fx);
  const b0 = _lerp(a00, a10, fy);
  const b1 = _lerp(a01, a11, fy);
  return _lerp(b0, b1, fz) * 2 - 1;
}

function fbm2D(x, y, octaves, lacunarity, gain) {
  octaves = octaves || 4;
  lacunarity = lacunarity || 2.0;
  gain = gain || 0.5;
  var amp = 1.0, freq = 1.0, sum = 0.0, norm = 0.0;
  for (var i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

function fbm3D(x, y, z, octaves, lacunarity, gain) {
  octaves = octaves || 4;
  lacunarity = lacunarity || 2.0;
  gain = gain || 0.5;
  var amp = 1.0, freq = 1.0, sum = 0.0, norm = 0.0;
  for (var i = 0; i < octaves; i++) {
    sum += amp * noise3D(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// Initial capacity — arrays grow dynamically as needed (no hard limit)
var _pointCap = 100000;
let _count = 0;
let _positions, _colors, _sizes;

// Double the capacity of all point buffers when full
function _growPoints() {
  _pointCap *= 2;
  var newPos = new Float32Array(_pointCap * 3);
  var newCol = new Float32Array(_pointCap * 3);
  var newSiz = new Float32Array(_pointCap);
  newPos.set(_positions);
  newCol.set(_colors);
  newSiz.set(_sizes);
  _positions = newPos;
  _colors = newCol;
  _sizes = newSiz;
}

function emit(x, y, z, r, g, b, size) {
  if (_count >= _pointCap) _growPoints();
  const i = _count * 3;
  _positions[i] = x;
  _positions[i + 1] = y;
  _positions[i + 2] = z;
  _colors[i] = r;
  _colors[i + 1] = g;
  _colors[i + 2] = b;
  _sizes[_count] = (size !== undefined) ? size : 0.03;
  _count++;
}

// Initial capacity — arrays grow dynamically as needed (no hard limit)
var _meshCap = 300000;
let _meshCount = 0;
let _meshPositions, _meshColors;

// Double the capacity of all mesh buffers when full
function _growMesh() {
  _meshCap *= 2;
  var newPos = new Float32Array(_meshCap * 3);
  var newCol = new Float32Array(_meshCap * 3);
  var newNrm = new Float32Array(_meshCap * 3);
  newPos.set(_meshPositions);
  newCol.set(_meshColors);
  newNrm.set(_meshNormals);
  _meshPositions = newPos;
  _meshColors = newCol;
  _meshNormals = newNrm;
}

function emitTriangle(x1,y1,z1, x2,y2,z2, x3,y3,z3, r,g,b) {
  if (_meshCount + 3 > _meshCap) _growMesh();
  var i = _meshCount * 3;
  _meshPositions[i] = x1; _meshPositions[i+1] = y1; _meshPositions[i+2] = z1;
  _meshPositions[i+3] = x2; _meshPositions[i+4] = y2; _meshPositions[i+5] = z2;
  _meshPositions[i+6] = x3; _meshPositions[i+7] = y3; _meshPositions[i+8] = z3;
  var c = _meshCount * 3;
  _meshColors[c] = r; _meshColors[c+1] = g; _meshColors[c+2] = b;
  _meshColors[c+3] = r; _meshColors[c+4] = g; _meshColors[c+5] = b;
  _meshColors[c+6] = r; _meshColors[c+7] = g; _meshColors[c+8] = b;
  _meshCount += 3;
}

function emitQuad(x1,y1,z1, x2,y2,z2, x3,y3,z3, x4,y4,z4, r,g,b) {
  emitTriangle(x1,y1,z1, x2,y2,z2, x3,y3,z3, r,g,b);
  emitTriangle(x1,y1,z1, x3,y3,z3, x4,y4,z4, r,g,b);
}

// --- High-level shape primitives ---

function box(cx,cy,cz, sx,sy,sz, r,g,b) {
  var hx = sx/2, hy = sy/2, hz = sz/2;
  var x0=cx-hx, x1=cx+hx, y0=cy-hy, y1=cy+hy, z0=cz-hz, z1=cz+hz;
  // Front  (+Z)
  emitQuad(x0,y0,z1, x1,y0,z1, x1,y1,z1, x0,y1,z1, r,g,b);
  // Back   (-Z)
  emitQuad(x1,y0,z0, x0,y0,z0, x0,y1,z0, x1,y1,z0, r,g,b);
  // Right  (+X)
  emitQuad(x1,y0,z1, x1,y0,z0, x1,y1,z0, x1,y1,z1, r,g,b);
  // Left   (-X)
  emitQuad(x0,y0,z0, x0,y0,z1, x0,y1,z1, x0,y1,z0, r,g,b);
  // Top    (+Y)
  emitQuad(x0,y1,z1, x1,y1,z1, x1,y1,z0, x0,y1,z0, r,g,b);
  // Bottom (-Y)
  emitQuad(x0,y0,z0, x1,y0,z0, x1,y0,z1, x0,y0,z1, r,g,b);
}

// =========================================================================
// SDF Primitives — Signed Distance Functions
// Each returns the signed distance from point (px,py,pz) to the surface.
// Negative = inside, positive = outside, zero = on the surface.
// All use individual floats (no array allocation) for performance.
// =========================================================================

// Signed distance to a sphere centered at origin with radius r.
// The distance is simply how far the point is from the center, minus r.
function sdSphere(px,py,pz, r) {
  return Math.sqrt(px*px + py*py + pz*pz) - r;
}

// Signed distance to an axis-aligned box centered at origin with half-extents (sx,sy,sz).
// We compute the per-axis distance outside the box, then combine via Euclidean length.
// The interior distance uses the largest (most negative) axis distance.
function sdBox(px,py,pz, sx,sy,sz) {
  var dx = Math.abs(px) - sx;
  var dy = Math.abs(py) - sy;
  var dz = Math.abs(pz) - sz;
  var ex = Math.max(dx, 0), ey = Math.max(dy, 0), ez = Math.max(dz, 0);
  return Math.sqrt(ex*ex + ey*ey + ez*ez) + Math.min(Math.max(dx, Math.max(dy, dz)), 0);
}

// Signed distance to a capsule (line segment from a to b, with uniform radius r).
// Project the point onto the line segment, clamp to [0,1], measure distance to that point.
function sdCapsule(px,py,pz, ax,ay,az, bx,by,bz, r) {
  var bax = bx-ax, bay = by-ay, baz = bz-az;
  var pax = px-ax, pay = py-ay, paz = pz-az;
  var h = Math.max(0, Math.min(1, (pax*bax+pay*bay+paz*baz) / (bax*bax+bay*bay+baz*baz)));
  var qx = pax - bax*h, qy = pay - bay*h, qz = paz - baz*h;
  return Math.sqrt(qx*qx + qy*qy + qz*qz) - r;
}

// Signed distance to a torus lying in the XZ plane, centered at origin.
// R = major radius (center of tube to center of torus), r = minor radius (tube thickness).
// First compute the distance from the point to the torus ring in XZ, then subtract tube radius.
function sdTorus(px,py,pz, R, r) {
  var qx = Math.sqrt(px*px + pz*pz) - R;
  return Math.sqrt(qx*qx + py*py) - r;
}

// Signed distance to a cone with tip at origin, opening downward along -Y.
// r = base radius, h = height. The base is at y = -h.
// Modeled as intersection of three half-spaces: cone surface, tip plane, base plane.
// Not an exact Euclidean SDF near edges, but sign is always correct, which is
// what marching cubes needs for proper iso-surface extraction.
function sdCone(px,py,pz, r, h) {
  var q = Math.sqrt(px*px + pz*pz);
  // Cone surface in 2D (q,y): line from tip (0,0) to base rim (r,-h).
  // Outward normal to this line is (h, r), normalized.
  var nLen = Math.sqrt(h*h + r*r);
  // Signed distance to the infinite cone surface (positive = outside)
  var coneDist = (q * h + py * r) / nLen;
  // Signed distance to tip cap plane at y=0 (positive = above tip)
  var tipDist = py;
  // Signed distance to base cap plane at y=-h (positive = below base)
  var capDist = -py - h;
  // Intersection of half-spaces: max gives correct sign everywhere
  return Math.max(coneDist, Math.max(tipDist, capDist));
}

// Signed distance to an infinite plane with normal (nx,ny,nz) at distance d from origin.
// Simply the dot product of the point with the normal, minus offset.
function sdPlane(px,py,pz, nx,ny,nz, d) {
  return px*nx + py*ny + pz*nz - d;
}

// Signed distance to a cylinder aligned along Y axis, centered at origin.
// r = radius, h = half-height. Includes end caps.
function sdCylinder(px,py,pz, r, h) {
  var d = Math.sqrt(px*px + pz*pz) - r;
  var dy = Math.abs(py) - h;
  var outside = Math.sqrt(Math.max(d,0)*Math.max(d,0) + Math.max(dy,0)*Math.max(dy,0));
  var inside = Math.min(Math.max(d, dy), 0);
  return outside + inside;
}

// =========================================================================
// SDF Operators — Combine or modify signed distance fields
// =========================================================================

// Boolean union: the closer surface wins (minimum distance)
function opUnion(d1, d2) { return Math.min(d1, d2); }

// Boolean subtraction: carve d2 out of d1 (invert d2, take max)
function opSubtract(d1, d2) { return Math.max(d1, -d2); }

// Boolean intersection: only the overlap region (maximum distance)
function opIntersect(d1, d2) { return Math.max(d1, d2); }

// Smooth blend (union): cubic interpolation between two surfaces.
// k controls the blend radius — larger k = wider, smoother blend zone.
function opSmoothUnion(d1, d2, k) {
  var h = Math.max(0, Math.min(1, 0.5 + 0.5*(d2-d1)/k));
  return d2*(1-h) + d1*h - k*h*(1-h);
}

// Smooth subtraction: smoothly carve d2 from d1 with blend radius k.
function opSmoothSubtract(d1, d2, k) {
  var h = Math.max(0, Math.min(1, 0.5 - 0.5*(d1+d2)/k));
  return d1*(1-h) + (-d2)*h + k*h*(1-h);
}

// Smooth intersection: smoothly intersect d1 and d2 with blend radius k.
function opSmoothIntersect(d1, d2, k) {
  var h = Math.max(0, Math.min(1, 0.5 - 0.5*(d2-d1)/k));
  return d2*(1-h) + d1*h + k*h*(1-h);
}

// Round an SDF by shrinking the surface inward by r, making edges rounded.
function opRound(d, r) { return d - r; }

// Displace an SDF by adding a noise value to the distance.
// Pass the result of noise3D/fbm3D as the displacement amount.
function opDisplace(d, displacement) { return d + displacement; }

// =========================================================================
// Smooth normal mesh buffer
// For marching cubes output: stores per-vertex normals computed from SDF
// gradients, giving smooth shading without flat-face artifacts.
// =========================================================================
var _meshNormals;
var _hasCustomNormals = false;

// Emit a triangle with explicit per-vertex normals (for smooth shading).
// Unlike emitTriangle which relies on computeVertexNormals(), this stores
// normals directly so the renderer can interpolate across the face.
function _emitSmoothTriangle(
  x1,y1,z1, nx1,ny1,nz1,
  x2,y2,z2, nx2,ny2,nz2,
  x3,y3,z3, nx3,ny3,nz3,
  r,g,b
) {
  if (_meshCount + 3 > _meshCap) _growMesh();
  _hasCustomNormals = true;
  var i = _meshCount * 3;
  // Positions
  _meshPositions[i]   = x1; _meshPositions[i+1] = y1; _meshPositions[i+2] = z1;
  _meshPositions[i+3] = x2; _meshPositions[i+4] = y2; _meshPositions[i+5] = z2;
  _meshPositions[i+6] = x3; _meshPositions[i+7] = y3; _meshPositions[i+8] = z3;
  // Normals — SDF gradient direction at each vertex (points away from surface)
  _meshNormals[i]   = nx1; _meshNormals[i+1] = ny1; _meshNormals[i+2] = nz1;
  _meshNormals[i+3] = nx2; _meshNormals[i+4] = ny2; _meshNormals[i+5] = nz2;
  _meshNormals[i+6] = nx3; _meshNormals[i+7] = ny3; _meshNormals[i+8] = nz3;
  // Colors — uniform per face
  var c = _meshCount * 3;
  _meshColors[c]   = r; _meshColors[c+1] = g; _meshColors[c+2] = b;
  _meshColors[c+3] = r; _meshColors[c+4] = g; _meshColors[c+5] = b;
  _meshColors[c+6] = r; _meshColors[c+7] = g; _meshColors[c+8] = b;
  _meshCount += 3;
}

// =========================================================================
// Marching Cubes Lookup Tables
// Standard tables for the marching cubes algorithm. Each of the 256 possible
// cube configurations (8 corners, each inside or outside) maps to:
// - MC_EDGE_TABLE: a 12-bit mask of which edges are intersected by the surface
// - MC_TRI_TABLE: up to 5 triangles (15 edge indices, -1 terminated) describing
//   which edge intersection points form triangles
// =========================================================================
var MC_EDGE_TABLE = [0x0,0x109,0x203,0x30a,0x406,0x50f,0x605,0x70c,0x80c,0x905,0xa0f,0xb06,0xc0a,0xd03,0xe09,0xf00,0x190,0x99,0x393,0x29a,0x596,0x49f,0x795,0x69c,0x99c,0x895,0xb9f,0xa96,0xd9a,0xc93,0xf99,0xe90,0x230,0x339,0x33,0x13a,0x636,0x73f,0x435,0x53c,0xa3c,0xb35,0x83f,0x936,0xe3a,0xf33,0xc39,0xd30,0x3a0,0x2a9,0x1a3,0xaa,0x7a6,0x6af,0x5a5,0x4ac,0xbac,0xaa5,0x9af,0x8a6,0xfaa,0xea3,0xda9,0xca0,0x460,0x569,0x663,0x76a,0x66,0x16f,0x265,0x36c,0xc6c,0xd65,0xe6f,0xf66,0x86a,0x963,0xa69,0xb60,0x5f0,0x4f9,0x7f3,0x6fa,0x1f6,0xff,0x3f5,0x2fc,0xdfc,0xcf5,0xfff,0xef6,0x9fa,0x8f3,0xbf9,0xaf0,0x650,0x759,0x453,0x55a,0x256,0x35f,0x55,0x15c,0xe5c,0xf55,0xc5f,0xd56,0xa5a,0xb53,0x859,0x950,0x7c0,0x6c9,0x5c3,0x4ca,0x3c6,0x2cf,0x1c5,0xcc,0xfcc,0xec5,0xdcf,0xcc6,0xbca,0xac3,0x9c9,0x8c0,0x8c0,0x9c9,0xac3,0xbca,0xcc6,0xdcf,0xec5,0xfcc,0xcc,0x1c5,0x2cf,0x3c6,0x4ca,0x5c3,0x6c9,0x7c0,0x950,0x859,0xb53,0xa5a,0xd56,0xc5f,0xf55,0xe5c,0x15c,0x55,0x35f,0x256,0x55a,0x453,0x759,0x650,0xaf0,0xbf9,0x8f3,0x9fa,0xef6,0xfff,0xcf5,0xdfc,0x2fc,0x3f5,0xff,0x1f6,0x6fa,0x7f3,0x4f9,0x5f0,0xb60,0xa69,0x963,0x86a,0xf66,0xe6f,0xd65,0xc6c,0x36c,0x265,0x16f,0x66,0x76a,0x663,0x569,0x460,0xca0,0xda9,0xea3,0xfaa,0x8a6,0x9af,0xaa5,0xbac,0x4ac,0x5a5,0x6af,0x7a6,0xaa,0x1a3,0x2a9,0x3a0,0xd30,0xc39,0xf33,0xe3a,0x936,0x83f,0xb35,0xa3c,0x53c,0x435,0x73f,0x636,0x13a,0x33,0x339,0x230,0xe90,0xf99,0xc93,0xd9a,0xa96,0xb9f,0x895,0x99c,0x69c,0x795,0x49f,0x596,0x29a,0x393,0x99,0x190,0xf00,0xe09,0xd03,0xc0a,0xb06,0xa0f,0x905,0x80c,0x70c,0x605,0x50f,0x406,0x30a,0x203,0x109,0x0];

var MC_TRI_TABLE = [[-1],
[0,8,3,-1],[0,1,9,-1],[1,8,3,9,8,1,-1],[1,2,10,-1],[0,8,3,1,2,10,-1],[9,2,10,0,2,9,-1],[2,8,3,2,10,8,10,9,8,-1],[3,11,2,-1],[0,11,2,8,11,0,-1],[1,9,0,2,3,11,-1],[1,11,2,1,9,11,9,8,11,-1],[3,10,1,11,10,3,-1],[0,10,1,0,8,10,8,11,10,-1],[3,9,0,3,11,9,11,10,9,-1],[9,8,10,10,8,11,-1],
[4,7,8,-1],[4,3,0,7,3,4,-1],[0,1,9,8,4,7,-1],[4,1,9,4,7,1,7,3,1,-1],[1,2,10,8,4,7,-1],[3,4,7,3,0,4,1,2,10,-1],[9,2,10,9,0,2,8,4,7,-1],[2,10,9,2,9,7,2,7,3,7,9,4,-1],[8,4,7,3,11,2,-1],[11,4,7,11,2,4,2,0,4,-1],[9,0,1,8,4,7,2,3,11,-1],[4,7,11,9,4,11,9,11,2,9,2,1,-1],[3,10,1,3,11,10,7,8,4,-1],[1,11,10,1,4,11,1,0,4,7,11,4,-1],[4,7,8,9,0,11,9,11,10,11,0,3,-1],[4,7,11,4,11,9,9,11,10,-1],
[9,5,4,-1],[9,5,4,0,8,3,-1],[0,5,4,1,5,0,-1],[8,5,4,8,3,5,3,1,5,-1],[1,2,10,9,5,4,-1],[3,0,8,1,2,10,4,9,5,-1],[5,2,10,5,4,2,4,0,2,-1],[2,10,5,3,2,5,3,5,4,3,4,8,-1],[9,5,4,2,3,11,-1],[0,11,2,0,8,11,4,9,5,-1],[0,5,4,0,1,5,2,3,11,-1],[2,1,5,2,5,8,2,8,11,4,8,5,-1],[10,3,11,10,1,3,9,5,4,-1],[4,9,5,0,8,1,8,10,1,8,11,10,-1],[5,4,0,5,0,11,5,11,10,11,0,3,-1],[5,4,8,5,8,10,10,8,11,-1],
[9,7,8,5,7,9,-1],[9,3,0,9,5,3,5,7,3,-1],[0,7,8,0,1,7,1,5,7,-1],[1,5,3,3,5,7,-1],[9,7,8,9,5,7,10,1,2,-1],[10,1,2,9,5,0,5,3,0,5,7,3,-1],[8,0,2,8,2,5,8,5,7,10,5,2,-1],[2,10,5,2,5,3,3,5,7,-1],[7,9,5,7,8,9,3,11,2,-1],[9,5,7,9,7,2,9,2,0,2,7,11,-1],[2,3,11,0,1,8,1,7,8,1,5,7,-1],[11,2,1,11,1,7,7,1,5,-1],[9,5,8,8,5,7,10,1,3,10,3,11,-1],[5,7,0,5,0,9,7,11,0,1,0,10,11,10,0,-1],[11,10,0,11,0,3,10,5,0,8,0,7,5,7,0,-1],[11,10,5,7,11,5,-1],
[10,6,5,-1],[0,8,3,5,10,6,-1],[9,0,1,5,10,6,-1],[1,8,3,1,9,8,5,10,6,-1],[1,6,5,2,6,1,-1],[1,6,5,1,2,6,3,0,8,-1],[9,6,5,9,0,6,0,2,6,-1],[5,9,8,5,8,2,5,2,6,3,2,8,-1],[2,3,11,10,6,5,-1],[11,0,8,11,2,0,10,6,5,-1],[0,1,9,2,3,11,5,10,6,-1],[5,10,6,1,9,2,9,11,2,9,8,11,-1],[6,3,11,6,5,3,5,1,3,-1],[0,8,11,0,11,5,0,5,1,5,11,6,-1],[3,11,6,0,3,6,0,6,5,0,5,9,-1],[6,5,9,6,9,11,11,9,8,-1],
[5,10,6,4,7,8,-1],[4,3,0,4,7,3,6,5,10,-1],[1,9,0,5,10,6,8,4,7,-1],[10,6,5,1,9,7,1,7,3,7,9,4,-1],[6,1,2,6,5,1,4,7,8,-1],[1,2,5,5,2,6,3,0,4,3,4,7,-1],[8,4,7,9,0,5,0,6,5,0,2,6,-1],[7,3,9,7,9,4,3,2,9,5,9,6,2,6,9,-1],[3,11,2,7,8,4,10,6,5,-1],[5,10,6,4,7,2,4,2,0,2,7,11,-1],[0,1,9,4,7,8,2,3,11,5,10,6,-1],[9,2,1,9,11,2,9,4,11,7,11,4,5,10,6,-1],[8,4,7,3,11,5,3,5,1,5,11,6,-1],[5,1,11,5,11,6,1,0,11,7,11,4,0,4,11,-1],[0,5,9,0,6,5,0,3,6,11,6,3,8,4,7,-1],[6,5,9,6,9,11,4,7,9,7,11,9,-1],
[10,4,9,6,4,10,-1],[4,10,6,4,9,10,0,8,3,-1],[10,0,1,10,6,0,6,4,0,-1],[8,3,1,8,1,6,8,6,4,6,1,10,-1],[1,4,9,1,2,4,2,6,4,-1],[3,0,8,1,2,4,2,6,4,4,2,9,-1],[0,2,4,4,2,6,-1],[8,3,2,8,2,4,4,2,6,-1],[10,4,9,10,6,4,11,2,3,-1],[0,8,2,2,8,11,4,9,10,4,10,6,-1],[3,11,2,0,1,6,0,6,4,6,1,10,-1],[6,4,1,6,1,10,4,8,1,2,1,11,8,11,1,-1],[9,6,4,9,3,6,9,1,3,11,6,3,-1],[8,11,1,8,1,0,11,6,1,9,1,4,6,4,1,-1],[3,11,6,3,6,0,0,6,4,-1],[6,4,8,11,6,8,-1],
[7,10,6,7,8,10,8,9,10,-1],[0,7,3,0,10,7,0,9,10,6,7,10,-1],[10,6,7,1,10,7,1,7,8,1,8,0,-1],[10,6,7,10,7,1,1,7,3,-1],[1,2,6,1,6,8,1,8,9,8,6,7,-1],[2,6,9,2,9,1,6,7,9,0,9,3,7,3,9,-1],[7,8,0,7,0,6,6,0,2,-1],[7,3,2,6,7,2,-1],[2,3,11,10,6,8,10,8,9,8,6,7,-1],[2,0,7,2,7,11,0,9,7,6,7,10,9,10,7,-1],[1,8,0,1,7,8,1,10,7,6,7,10,2,3,11,-1],[11,2,1,11,1,7,10,6,1,6,7,1,-1],[8,9,6,8,6,7,9,1,6,11,6,3,1,3,6,-1],[0,9,1,11,6,7,-1],[7,8,0,7,0,6,3,11,0,11,6,0,-1],[7,11,6,-1],
[7,6,11,-1],[3,0,8,11,7,6,-1],[0,1,9,11,7,6,-1],[8,1,9,8,3,1,11,7,6,-1],[10,1,2,6,11,7,-1],[1,2,10,3,0,8,6,11,7,-1],[2,9,0,2,10,9,6,11,7,-1],[6,11,7,2,10,3,10,8,3,10,9,8,-1],[7,2,3,6,2,7,-1],[7,0,8,7,6,0,6,2,0,-1],[2,7,6,2,3,7,0,1,9,-1],[1,6,2,1,8,6,1,9,8,8,7,6,-1],[10,7,6,10,1,7,1,3,7,-1],[10,7,6,1,7,10,1,8,7,1,0,8,-1],[0,3,7,0,7,10,0,10,9,6,10,7,-1],[7,6,10,7,10,8,8,10,9,-1],
[6,8,4,11,8,6,-1],[3,6,11,3,0,6,0,4,6,-1],[8,6,11,8,4,6,9,0,1,-1],[9,4,6,9,6,3,9,3,1,11,3,6,-1],[6,8,4,6,11,8,2,10,1,-1],[1,2,10,3,0,11,0,6,11,0,4,6,-1],[4,11,8,4,6,11,0,2,9,2,10,9,-1],[10,9,3,10,3,2,9,4,3,11,3,6,4,6,3,-1],[8,2,3,8,4,2,4,6,2,-1],[0,4,2,4,6,2,-1],[1,9,0,2,3,4,2,4,6,4,3,8,-1],[1,9,4,1,4,2,2,4,6,-1],[8,1,3,8,6,1,8,4,6,6,10,1,-1],[10,1,0,10,0,6,6,0,4,-1],[4,6,3,4,3,8,6,10,3,0,3,9,10,9,3,-1],[10,9,4,6,10,4,-1],
[4,9,5,7,6,11,-1],[0,8,3,4,9,5,11,7,6,-1],[5,0,1,5,4,0,7,6,11,-1],[11,7,6,8,3,4,3,5,4,3,1,5,-1],[9,5,4,10,1,2,7,6,11,-1],[6,11,7,1,2,10,0,8,3,4,9,5,-1],[7,6,11,5,4,10,4,2,10,4,0,2,-1],[3,4,8,3,5,4,3,2,5,10,5,2,11,7,6,-1],[7,2,3,7,6,2,5,4,9,-1],[9,5,4,0,8,6,0,6,2,6,8,7,-1],[3,6,2,3,7,6,1,5,0,5,4,0,-1],[6,2,8,6,8,7,2,1,8,4,8,5,1,5,8,-1],[9,5,4,10,1,6,1,7,6,1,3,7,-1],[1,6,10,1,7,6,1,0,7,8,7,0,9,5,4,-1],[4,0,10,4,10,5,0,3,10,6,10,7,3,7,10,-1],[7,6,10,7,10,8,5,4,10,4,8,10,-1],
[6,9,5,6,11,9,11,8,9,-1],[3,6,11,0,6,3,0,5,6,0,9,5,-1],[0,11,8,0,5,11,0,1,5,5,6,11,-1],[6,11,3,6,3,5,5,3,1,-1],[1,2,10,9,5,11,9,11,8,11,5,6,-1],[0,11,3,0,6,11,0,9,6,5,6,9,1,2,10,-1],[11,8,5,11,5,6,8,0,5,10,5,2,0,2,5,-1],[6,11,3,6,3,5,2,10,3,10,5,3,-1],[5,8,9,5,2,8,5,6,2,3,8,2,-1],[9,5,6,9,6,0,0,6,2,-1],[1,5,8,1,8,0,5,6,8,3,8,2,6,2,8,-1],[1,5,6,2,1,6,-1],[1,3,6,1,6,10,3,8,6,5,6,9,8,9,6,-1],[10,1,0,10,0,6,9,5,0,5,6,0,-1],[0,3,8,5,6,10,-1],[10,5,6,-1],
[11,5,10,7,5,11,-1],[11,5,10,11,7,5,8,3,0,-1],[5,11,7,5,10,11,1,9,0,-1],[10,7,5,10,11,7,9,8,1,8,3,1,-1],[11,1,2,11,7,1,7,5,1,-1],[0,8,3,1,2,7,1,7,5,7,2,11,-1],[9,7,5,9,2,7,9,0,2,2,11,7,-1],[7,5,2,7,2,11,5,9,2,3,2,8,9,8,2,-1],[2,5,10,2,3,5,3,7,5,-1],[8,2,0,8,5,2,8,7,5,10,2,5,-1],[9,0,1,5,10,3,5,3,7,3,10,2,-1],[9,8,2,9,2,1,8,7,2,10,2,5,7,5,2,-1],[1,3,5,3,7,5,-1],[0,8,7,0,7,1,1,7,5,-1],[9,0,3,9,3,5,5,3,7,-1],[9,8,7,5,9,7,-1],
[5,8,4,5,10,8,10,11,8,-1],[5,0,4,5,11,0,5,10,11,11,3,0,-1],[0,1,9,8,4,10,8,10,11,10,4,5,-1],[10,11,4,10,4,5,11,3,4,9,4,1,3,1,4,-1],[2,5,1,2,8,5,2,11,8,4,5,8,-1],[0,4,11,0,11,3,4,5,11,2,11,1,5,1,11,-1],[0,2,5,0,5,9,2,11,5,4,5,8,11,8,5,-1],[9,4,5,2,11,3,-1],[2,5,10,3,5,2,3,4,5,3,8,4,-1],[5,10,2,5,2,4,4,2,0,-1],[3,10,2,3,5,10,3,8,5,4,5,8,0,1,9,-1],[5,10,2,5,2,4,1,9,2,9,4,2,-1],[8,4,5,8,5,3,3,5,1,-1],[0,4,5,1,0,5,-1],[8,4,5,8,5,3,9,0,5,0,3,5,-1],[9,4,5,-1],
[4,11,7,4,9,11,9,10,11,-1],[0,8,3,4,9,7,9,11,7,9,10,11,-1],[1,10,11,1,11,4,1,4,0,7,4,11,-1],[3,1,4,3,4,8,1,10,4,7,4,11,10,11,4,-1],[4,11,7,9,11,4,9,2,11,9,1,2,-1],[9,7,4,9,11,7,9,1,11,2,11,1,0,8,3,-1],[11,7,4,11,4,2,2,4,0,-1],[11,7,4,11,4,2,8,3,4,3,2,4,-1],[2,9,10,2,7,9,2,3,7,7,4,9,-1],[9,10,7,9,7,4,10,2,7,8,7,0,2,0,7,-1],[3,7,10,3,10,2,7,4,10,1,10,0,4,0,10,-1],[1,10,2,8,7,4,-1],[4,9,1,4,1,7,7,1,3,-1],[4,9,1,4,1,7,0,8,1,8,7,1,-1],[4,0,3,7,4,3,-1],[4,8,7,-1],
[9,10,8,10,11,8,-1],[3,0,9,3,9,11,11,9,10,-1],[0,1,10,0,10,8,8,10,11,-1],[3,1,10,11,3,10,-1],[1,2,11,1,11,9,9,11,8,-1],[3,0,9,3,9,11,1,2,9,2,11,9,-1],[0,2,11,8,0,11,-1],[3,2,11,-1],[2,3,8,2,8,10,10,8,9,-1],[9,10,2,0,9,2,-1],[2,3,8,2,8,10,0,1,8,1,10,8,-1],[1,10,2,-1],[1,3,8,9,1,8,-1],[0,9,1,-1],[0,3,8,-1],[-1]];

// =========================================================================
// sdfMesh() — Marching Cubes iso-surface extraction from an SDF function
//
// Pipeline:
//   1. Evaluate the SDF on a regular 3D grid within the bounding box
//   2. For each cubic cell, classify its 8 corners as inside/outside
//   3. Look up which edges are intersected by the iso-surface
//   4. Interpolate vertex positions along intersected edges
//   5. Compute per-vertex normals from SDF gradient via central differences
//   6. Emit smooth-shaded triangles with color from colorFn
//
// Parameters:
//   sdfFn(x,y,z) — returns signed distance (negative = inside)
//   colorFn(x,y,z) — returns [r,g,b] array at a surface point
//   bMin [x,y,z] — minimum corner of evaluation bounding box
//   bMax [x,y,z] — maximum corner of evaluation bounding box
//   resolution — grid cells per axis (capped at 64 to prevent OOM)
// =========================================================================
function sdfMesh(sdfFn, colorFn, bMin, bMax, resolution) {
  var res = resolution || 32;
  var nx = res + 1, ny = res + 1, nz = res + 1;

  // Bounding box dimensions and cell size
  var dx = (bMax[0] - bMin[0]) / res;
  var dy = (bMax[1] - bMin[1]) / res;
  var dz = (bMax[2] - bMin[2]) / res;

  // Phase 1: Evaluate SDF at every grid vertex into a flat Float32Array.
  // Index layout: field[iz * ny * nx + iy * nx + ix]
  var field = new Float32Array(nx * ny * nz);
  for (var iz = 0; iz < nz; iz++) {
    var pz = bMin[2] + iz * dz;
    for (var iy = 0; iy < ny; iy++) {
      var py = bMin[1] + iy * dy;
      for (var ix = 0; ix < nx; ix++) {
        var px = bMin[0] + ix * dx;
        field[iz * ny * nx + iy * nx + ix] = sdfFn(px, py, pz);
      }
    }
  }

  // Small epsilon for computing SDF gradient via central differences.
  // The gradient of an SDF at the surface points in the direction of the
  // outward normal — this gives us smooth per-vertex normals for free.
  var eps = Math.max(dx, dy, dz) * 0.5;

  // Phase 2 & 3: March through each cell and extract triangles
  // Edge vertex indices: which two corners each of the 12 edges connects
  var edgeVerts = [
    [0,1],[1,2],[2,3],[3,0], // bottom face edges
    [4,5],[5,6],[6,7],[7,4], // top face edges
    [0,4],[1,5],[2,6],[3,7]  // vertical edges
  ];
  // Corner offsets in (ix, iy, iz) for the 8 corners of a cube
  var cornerOffsets = [
    [0,0,0],[1,0,0],[1,1,0],[0,1,0],
    [0,0,1],[1,0,1],[1,1,1],[0,1,1]
  ];

  for (var iz = 0; iz < res; iz++) {
    for (var iy = 0; iy < res; iy++) {
      for (var ix = 0; ix < res; ix++) {
        // Read SDF values at the 8 corners of this cell
        var vals = [];
        for (var c = 0; c < 8; c++) {
          var ci = ix + cornerOffsets[c][0];
          var cj = iy + cornerOffsets[c][1];
          var ck = iz + cornerOffsets[c][2];
          vals[c] = field[ck * ny * nx + cj * nx + ci];
        }

        // Phase 2: Classify cube — build an 8-bit index where bit i is set
        // if corner i is inside the surface (SDF < 0)
        var cubeIndex = 0;
        for (var c = 0; c < 8; c++) {
          if (vals[c] < 0) cubeIndex |= (1 << c);
        }
        // Skip cells entirely inside or outside the surface
        if (MC_EDGE_TABLE[cubeIndex] === 0) continue;

        // Phase 3: Interpolate vertex positions along intersected edges.
        // For each edge that crosses the surface, find where SDF = 0 via
        // linear interpolation between the two endpoint SDF values.
        var edgeMask = MC_EDGE_TABLE[cubeIndex];
        var verts = [];
        for (var e = 0; e < 12; e++) {
          if (!(edgeMask & (1 << e))) { verts[e] = null; continue; }
          var ev = edgeVerts[e];
          var c0 = cornerOffsets[ev[0]], c1 = cornerOffsets[ev[1]];
          var v0 = vals[ev[0]], v1 = vals[ev[1]];
          // t is the interpolation parameter: where SDF crosses zero on this edge
          var t = v0 / (v0 - v1);
          // World-space position of the vertex
          var vx = bMin[0] + (ix + c0[0] + (c1[0]-c0[0])*t) * dx;
          var vy = bMin[1] + (iy + c0[1] + (c1[1]-c0[1])*t) * dy;
          var vz = bMin[2] + (iz + c0[2] + (c1[2]-c0[2])*t) * dz;

          // Phase 5: Compute normal from SDF gradient via central differences.
          // The gradient of a distance field at the surface equals the outward
          // unit normal. We approximate it with finite differences:
          //   n_x ≈ (sdf(x+ε) - sdf(x-ε)) / (2ε)
          var gnx = sdfFn(vx+eps,vy,vz) - sdfFn(vx-eps,vy,vz);
          var gny = sdfFn(vx,vy+eps,vz) - sdfFn(vx,vy-eps,vz);
          var gnz = sdfFn(vx,vy,vz+eps) - sdfFn(vx,vy,vz-eps);
          var glen = Math.sqrt(gnx*gnx+gny*gny+gnz*gnz) || 1;
          verts[e] = [vx, vy, vz, gnx/glen, gny/glen, gnz/glen];
        }

        // Phase 4: Look up triangle list and emit smooth-shaded triangles.
        // MC_TRI_TABLE gives sequences of edge indices forming triangles.
        var tris = MC_TRI_TABLE[cubeIndex];
        for (var t = 0; t < tris.length - 1; t += 3) {
          if (tris[t] === -1) break;
          var a = verts[tris[t]], b = verts[tris[t+1]], c = verts[tris[t+2]];
          if (!a || !b || !c) continue;

          // Phase 6: Color from colorFn at triangle centroid
          var cx = (a[0]+b[0]+c[0])/3, cy = (a[1]+b[1]+c[1])/3, cz = (a[2]+b[2]+c[2])/3;
          var col = colorFn(cx, cy, cz);

          // Emit triangle with per-vertex normals for smooth shading.
          // Winding order: counter-clockwise when viewed from outside (normals point outward)
          _emitSmoothTriangle(
            a[0],a[1],a[2], a[3],a[4],a[5],
            b[0],b[1],b[2], b[3],b[4],b[5],
            c[0],c[1],c[2], c[3],c[4],c[5],
            col[0], col[1], col[2]
          );
        }
      }
    }
  }
}

// =========================================================================
// lathe() — Surface of Revolution
// Generates a rotationally-symmetric mesh by revolving a 2D profile around
// the Y axis. Generalizes sphere and cylinder into arbitrary profiles
// (mushroom caps, vases, columns, tree trunks with taper, etc.).
//
// Parameters:
//   cx,cy,cz — center of revolution
//   profile — array of [radius, yOffset] pairs defining the cross-section.
//             The profile is revolved around the Y axis at (cx, cy+yOffset, cz).
//             Order matters: adjacent pairs form connected rings.
//   segments — number of angular subdivisions (higher = smoother)
//   r,g,b — face color
// =========================================================================
function lathe(cx,cy,cz, profile, segments, r,g,b) {
  segments = segments || 16;
  var pLen = profile.length;
  if (pLen < 2) return;

  // Precompute trig tables for angular subdivisions
  var cosA = [], sinA = [];
  for (var i = 0; i <= segments; i++) {
    var angle = 2 * Math.PI * i / segments;
    cosA[i] = Math.cos(angle);
    sinA[i] = Math.sin(angle);
  }

  // Connect adjacent profile points with quads (or triangles at poles)
  for (var p = 0; p < pLen - 1; p++) {
    var r0 = profile[p][0], y0 = cy + profile[p][1];
    var r1 = profile[p+1][0], y1 = cy + profile[p+1][1];

    for (var s = 0; s < segments; s++) {
      // Four corners of the quad between two profile rings
      var bx0 = cx + r0 * cosA[s],   bz0 = cz + r0 * sinA[s];
      var bx1 = cx + r0 * cosA[s+1], bz1 = cz + r0 * sinA[s+1];
      var tx0 = cx + r1 * cosA[s],   tz0 = cz + r1 * sinA[s];
      var tx1 = cx + r1 * cosA[s+1], tz1 = cz + r1 * sinA[s+1];

      if (r0 === 0) {
        // Degenerate top pole: triangle fan from pole to next ring
        // Winding: outward-facing normal (CCW from outside)
        emitTriangle(cx,y0,cz, tx1,y1,tz1, tx0,y1,tz0, r,g,b);
      } else if (r1 === 0) {
        // Degenerate bottom pole: triangle fan from ring to pole
        // Winding: outward-facing normal (CCW from outside)
        emitTriangle(bx0,y0,bz0, bx1,y0,bz1, cx,y1,cz, r,g,b);
      } else {
        // Standard quad between two rings
        // Winding: outward-facing normal (CCW from outside)
        emitQuad(bx0,y0,bz0, bx1,y0,bz1, tx1,y1,tz1, tx0,y1,tz0, r,g,b);
      }
    }
  }
}

function extrudePath(profile, path, closed, r,g,b) {
  var pLen = profile.length, pathLen = path.length;
  if (pLen < 2 || pathLen < 2) return;

  // Compute tangents
  var tangents = [];
  for (var i = 0; i < pathLen; i++) {
    var prev = i > 0 ? path[i-1] : path[i];
    var next = i < pathLen-1 ? path[i+1] : path[i];
    var dx = next[0]-prev[0], dy = next[1]-prev[1], dz = next[2]-prev[2];
    var len = Math.sqrt(dx*dx+dy*dy+dz*dz) || 1;
    tangents[i] = [dx/len, dy/len, dz/len];
  }

  // Build rotation-minimizing frames via double reflection
  var normals = [], binormals = [];
  // Initial frame: pick an arbitrary vector not parallel to the first tangent
  var t0 = tangents[0];
  var notParallel = Math.abs(t0[0]) < 0.9;
  var arbx = notParallel ? 1 : 0;
  var arby = notParallel ? 0 : 1;
  // Cross product t0 x arb (arbz is always 0)
  var nx = -t0[2]*arby;
  var ny = t0[2]*arbx;
  var nz = t0[0]*arby - t0[1]*arbx;
  var nLen = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
  normals[0] = [nx/nLen, ny/nLen, nz/nLen];
  // Binormal = tangent x normal
  binormals[0] = [
    t0[1]*normals[0][2] - t0[2]*normals[0][1],
    t0[2]*normals[0][0] - t0[0]*normals[0][2],
    t0[0]*normals[0][1] - t0[1]*normals[0][0]
  ];

  // Propagate frames along path using double reflection (rotation-minimizing)
  for (var i = 1; i < pathLen; i++) {
    var ti = tangents[i-1], tj = tangents[i];
    var pi = path[i-1], pj = path[i];
    var vx = pj[0]-pi[0], vy = pj[1]-pi[1], vz = pj[2]-pi[2];
    var c1 = vx*vx+vy*vy+vz*vz;
    // Degenerate segment: copy previous frame
    if (c1 < 1e-10) {
      normals[i] = normals[i-1];
      binormals[i] = binormals[i-1];
      continue;
    }
    // Reflect previous normal across the segment midpoint plane
    var nPrev = normals[i-1];
    var dot1n = (vx*nPrev[0]+vy*nPrev[1]+vz*nPrev[2])/c1*2;
    var rn = [nPrev[0]-dot1n*vx, nPrev[1]-dot1n*vy, nPrev[2]-dot1n*vz];
    var dot1t = (vx*ti[0]+vy*ti[1]+vz*ti[2])/c1*2;
    var rt = [ti[0]-dot1t*vx, ti[1]-dot1t*vy, ti[2]-dot1t*vz];
    // Reflect again to align with the actual tangent at this point
    var v2x = tj[0]-rt[0], v2y = tj[1]-rt[1], v2z = tj[2]-rt[2];
    var c2 = v2x*v2x+v2y*v2y+v2z*v2z;
    if (c2 < 1e-10) {
      normals[i] = rn;
    } else {
      var dot2 = (v2x*rn[0]+v2y*rn[1]+v2z*rn[2])/c2*2;
      normals[i] = [rn[0]-dot2*v2x, rn[1]-dot2*v2y, rn[2]-dot2*v2z];
    }
    binormals[i] = [
      tj[1]*normals[i][2] - tj[2]*normals[i][1],
      tj[2]*normals[i][0] - tj[0]*normals[i][2],
      tj[0]*normals[i][1] - tj[1]*normals[i][0]
    ];
  }

  // Build rings and connect with quads
  var rings = [];
  for (var i = 0; i < pathLen; i++) {
    var ring = [];
    var p = path[i], n = normals[i], b = binormals[i];
    for (var j = 0; j < pLen; j++) {
      var px = profile[j][0], py = profile[j][1];
      ring[j] = [p[0]+px*n[0]+py*b[0], p[1]+px*n[1]+py*b[1], p[2]+px*n[2]+py*b[2]];
    }
    rings[i] = ring;
  }

  // Connect adjacent rings
  for (var i = 0; i < pathLen-1; i++) {
    var r0 = rings[i], r1 = rings[i+1];
    var jMax = closed ? pLen : pLen - 1;
    for (var j = 0; j < jMax; j++) {
      var j1 = (j+1) % pLen;
      emitQuad(
        r0[j][0],r0[j][1],r0[j][2],
        r0[j1][0],r0[j1][1],r0[j1][2],
        r1[j1][0],r1[j1][1],r1[j1][2],
        r1[j][0],r1[j][1],r1[j][2],
        r,g,b
      );
    }
  }
}

function grid(x0,z0, x1,z1, resX,resZ, heightFn, colorFn) {
  var stepX = (x1-x0)/resX, stepZ = (z1-z0)/resZ;
  // Precompute heights
  var heights = [];
  for (var i = 0; i <= resX; i++) {
    heights[i] = [];
    for (var j = 0; j <= resZ; j++) {
      heights[i][j] = heightFn(x0+i*stepX, z0+j*stepZ);
    }
  }
  // Emit quads
  for (var i = 0; i < resX; i++) {
    for (var j = 0; j < resZ; j++) {
      var px = x0+i*stepX, pz = z0+j*stepZ;
      var px1 = px+stepX, pz1 = pz+stepZ;
      var h00 = heights[i][j], h10 = heights[i+1][j];
      var h11 = heights[i+1][j+1], h01 = heights[i][j+1];
      var col = colorFn ? colorFn(px+stepX/2, pz+stepZ/2) : [0.5,0.5,0.5];
      emitQuad(
        px,h00,pz, px,h01,pz1, px1,h11,pz1, px1,h10,pz,
        col[0],col[1],col[2]
      );
    }
  }
}

self.onmessage = function(e) {
  const { code, seed, sceneBounds } = e.data;
  _seed = seed || 42;
  _count = 0;
  _pointCap = 100000;
  _positions = new Float32Array(_pointCap * 3);
  _colors = new Float32Array(_pointCap * 3);
  _sizes = new Float32Array(_pointCap);
  _meshCount = 0;
  _meshCap = 300000;
  _meshPositions = new Float32Array(_meshCap * 3);
  _meshColors = new Float32Array(_meshCap * 3);
  _meshNormals = new Float32Array(_meshCap * 3);
  _hasCustomNormals = false;

  const SCENE_MIN_X = sceneBounds.min[0];
  const SCENE_MAX_X = sceneBounds.max[0];
  const SCENE_MIN_Y = sceneBounds.min[1];
  const SCENE_MAX_Y = sceneBounds.max[1];
  const SCENE_MIN_Z = sceneBounds.min[2];
  const SCENE_MAX_Z = sceneBounds.max[2];
  const SCENE_CENTER_X = sceneBounds.center[0];
  const SCENE_CENTER_Y = sceneBounds.center[1];
  const SCENE_CENTER_Z = sceneBounds.center[2];
  const POINT_COUNT = sceneBounds.pointCount;

  const fn = new Function(
    "emit", "emitTriangle", "emitQuad",
    "box", "extrudePath", "grid", "sdfMesh", "lathe",
    "sdSphere", "sdBox", "sdCapsule", "sdTorus", "sdCone", "sdPlane", "sdCylinder",
    "opUnion", "opSubtract", "opIntersect",
    "opSmoothUnion", "opSmoothSubtract", "opSmoothIntersect",
    "opRound", "opDisplace",
    "noise2D", "noise3D", "fbm2D", "fbm3D", "random", "Math",
    "SCENE_MIN_X", "SCENE_MAX_X", "SCENE_MIN_Y", "SCENE_MAX_Y",
    "SCENE_MIN_Z", "SCENE_MAX_Z", "SCENE_CENTER_X", "SCENE_CENTER_Y",
    "SCENE_CENTER_Z", "POINT_COUNT",
    code
  );
  fn(
    emit, emitTriangle, emitQuad,
    box, extrudePath, grid, sdfMesh, lathe,
    sdSphere, sdBox, sdCapsule, sdTorus, sdCone, sdPlane, sdCylinder,
    opUnion, opSubtract, opIntersect,
    opSmoothUnion, opSmoothSubtract, opSmoothIntersect,
    opRound, opDisplace,
    noise2D, noise3D, fbm2D, fbm3D, _mulberry32, Math,
    SCENE_MIN_X, SCENE_MAX_X, SCENE_MIN_Y, SCENE_MAX_Y,
    SCENE_MIN_Z, SCENE_MAX_Z, SCENE_CENTER_X, SCENE_CENTER_Y,
    SCENE_CENTER_Z, POINT_COUNT
  );

  const positions = _positions.slice(0, _count * 3);
  const colors = _colors.slice(0, _count * 3);
  const sizes = _sizes.slice(0, _count);
  const meshPositions = _meshPositions.slice(0, _meshCount * 3);
  const meshColors = _meshColors.slice(0, _meshCount * 3);
  const meshNormals = _meshNormals.slice(0, _meshCount * 3);
  const transferables = [positions.buffer, colors.buffer, sizes.buffer, meshPositions.buffer, meshColors.buffer];
  if (_hasCustomNormals) transferables.push(meshNormals.buffer);
  self.postMessage(
    { positions, colors, sizes, count: _count, meshPositions, meshColors, meshVertexCount: _meshCount, meshNormals: _hasCustomNormals ? meshNormals : null, hasCustomNormals: _hasCustomNormals },
    transferables
  );
};
`;

let _workerBlobUrl: string | null = null;

function getWorkerBlobUrl(): string {
  if (!_workerBlobUrl) {
    const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
    _workerBlobUrl = URL.createObjectURL(blob);
  }
  return _workerBlobUrl;
}

let _nextLayerId = 0;

export function executeProceduralCode(
  code: string,
  bounds: SceneBounds,
  seed?: number,
): Promise<GeneratedLayer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(getWorkerBlobUrl());
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Code execution timed out (300s)"));
    }, 300000);

    worker.onmessage = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      const {
        positions,
        colors,
        sizes,
        count,
        meshPositions,
        meshColors,
        meshVertexCount,
        meshNormals,
        hasCustomNormals,
      } = e.data as {
        positions: Float32Array;
        colors: Float32Array;
        sizes: Float32Array;
        count: number;
        meshPositions: Float32Array;
        meshColors: Float32Array;
        meshVertexCount: number;
        meshNormals: Float32Array | null;
        hasCustomNormals: boolean;
      };
      const layer: GeneratedLayer = {
        id: `layer-${_nextLayerId++}`,
        positions,
        colors,
        sizes,
        count,
      };
      if (meshVertexCount > 0) {
        layer.meshPositions = meshPositions;
        layer.meshColors = meshColors;
        layer.meshVertexCount = meshVertexCount;
        if (hasCustomNormals && meshNormals) {
          layer.meshNormals = meshNormals;
          layer.hasCustomNormals = true;
        }
      }
      resolve(layer);
    };

    worker.onerror = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(e.message || "Worker error"));
    };

    worker.postMessage({
      code,
      seed: seed ?? Math.floor(Math.random() * 0xffffffff),
      sceneBounds: bounds,
    });
  });
}
