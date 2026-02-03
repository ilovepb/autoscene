export interface SceneBounds {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
}

export interface GeneratedLayer {
  id: string;
  meshPositions: Float32Array;
  meshColors: Float32Array;
  meshVertexCount: number;
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
  meshVertexCount: number;
}

/** Compute bounding box from a generated layer's mesh positions. */
export function computeLayerBounds(
  layer: GeneratedLayer,
): Omit<LayerMeta, "description"> {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const mc = layer.meshVertexCount;
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
    meshVertexCount: mc,
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
// =========================================================================

// Signed distance to a sphere centered at origin with radius r.
function sdSphere(px,py,pz, r) {
  return Math.sqrt(px*px + py*py + pz*pz) - r;
}

// Signed distance to an axis-aligned box centered at origin with half-extents (sx,sy,sz).
function sdBox(px,py,pz, sx,sy,sz) {
  var dx = Math.abs(px) - sx;
  var dy = Math.abs(py) - sy;
  var dz = Math.abs(pz) - sz;
  var ex = Math.max(dx, 0), ey = Math.max(dy, 0), ez = Math.max(dz, 0);
  return Math.sqrt(ex*ex + ey*ey + ez*ez) + Math.min(Math.max(dx, Math.max(dy, dz)), 0);
}

// Signed distance to a capsule (line segment from a to b, with uniform radius r).
function sdCapsule(px,py,pz, ax,ay,az, bx,by,bz, r) {
  var bax = bx-ax, bay = by-ay, baz = bz-az;
  var pax = px-ax, pay = py-ay, paz = pz-az;
  var h = Math.max(0, Math.min(1, (pax*bax+pay*bay+paz*baz) / (bax*bax+bay*bay+baz*baz)));
  var qx = pax - bax*h, qy = pay - bay*h, qz = paz - baz*h;
  return Math.sqrt(qx*qx + qy*qy + qz*qz) - r;
}

// Signed distance to a torus lying in the XZ plane, centered at origin.
function sdTorus(px,py,pz, R, r) {
  var qx = Math.sqrt(px*px + pz*pz) - R;
  return Math.sqrt(qx*qx + py*py) - r;
}

// Signed distance to a cone with tip at origin, opening downward along -Y.
function sdCone(px,py,pz, r, h) {
  var q = Math.sqrt(px*px + pz*pz);
  var nLen = Math.sqrt(h*h + r*r);
  var coneDist = (q * h + py * r) / nLen;
  var tipDist = py;
  var capDist = -py - h;
  return Math.max(coneDist, Math.max(tipDist, capDist));
}

// Signed distance to an infinite plane with normal (nx,ny,nz) at distance d from origin.
function sdPlane(px,py,pz, nx,ny,nz, d) {
  return px*nx + py*ny + pz*nz - d;
}

// Signed distance to a cylinder aligned along Y axis, centered at origin.
function sdCylinder(px,py,pz, r, h) {
  var d = Math.sqrt(px*px + pz*pz) - r;
  var dy = Math.abs(py) - h;
  var outside = Math.sqrt(Math.max(d,0)*Math.max(d,0) + Math.max(dy,0)*Math.max(dy,0));
  var inside = Math.min(Math.max(d, dy), 0);
  return outside + inside;
}

// Ellipsoid (approximate SDF) — centered at origin with radii (rx,ry,rz).
function sdEllipsoid(px,py,pz, rx,ry,rz) {
  var k0 = Math.sqrt(px*px/(rx*rx) + py*py/(ry*ry) + pz*pz/(rz*rz));
  var k1 = Math.sqrt(px*px/(rx*rx*rx*rx) + py*py/(ry*ry*ry*ry) + pz*pz/(rz*rz*rz*rz));
  return k0 * (k0 - 1.0) / k1;
}

// Octahedron (exact SDF) — centered at origin with size s.
function sdOctahedron(px,py,pz, s) {
  px=Math.abs(px); py=Math.abs(py); pz=Math.abs(pz);
  var m = px + py + pz - s;
  var q;
  if (3*px < m) q = [px,py,pz];
  else if (3*py < m) q = [py,pz,px];
  else if (3*pz < m) q = [pz,px,py];
  else return m * 0.57735027;
  var k = Math.max(0, Math.min(s, 0.5*(q[2]-q[1]+s)));
  return Math.sqrt((q[0])*(q[0]) + (q[1]-s+k)*(q[1]-s+k) + (q[2]-k)*(q[2]-k));
}

// Hex Prism (approximate SDF) — centered at origin with half-height h and radius r.
function sdHexPrism(px,py,pz, h,r) {
  px=Math.abs(px); pz=Math.abs(pz);
  var d = Math.max(px*0.866025+pz*0.5, pz) - r;
  return Math.sqrt(Math.max(d,0)*Math.max(d,0) + Math.max(Math.abs(py)-h,0)*Math.max(Math.abs(py)-h,0)) + Math.min(Math.max(d,Math.abs(py)-h),0);
}

// =========================================================================
// SDF Operators — Combine or modify signed distance fields
// =========================================================================

function opUnion(d1, d2) { return Math.min(d1, d2); }
function opSubtract(d1, d2) { return Math.max(d1, -d2); }
function opIntersect(d1, d2) { return Math.max(d1, d2); }

function opSmoothUnion(d1, d2, k) {
  var h = Math.max(0, Math.min(1, 0.5 + 0.5*(d2-d1)/k));
  return d2*(1-h) + d1*h - k*h*(1-h);
}
function opSmoothSubtract(d1, d2, k) {
  var h = Math.max(0, Math.min(1, 0.5 - 0.5*(d1+d2)/k));
  return d1*(1-h) + (-d2)*h + k*h*(1-h);
}
function opSmoothIntersect(d1, d2, k) {
  var h = Math.max(0, Math.min(1, 0.5 - 0.5*(d2-d1)/k));
  return d2*(1-h) + d1*h + k*h*(1-h);
}

function opRound(d, r) { return d - r; }
function opDisplace(d, displacement) { return d + displacement; }

// XOR — only non-overlapping regions
function opXOR(d1, d2) {
  return Math.max(Math.min(d1,d2), -Math.max(d1,d2));
}

// Chamfer union — beveled edge between two shapes
function opChamfer(d1, d2) {
  var ch = (d1 + d2) * 0.707;
  return Math.min(Math.min(d1,d2), ch);
}

// Stair-step union — quantized blend between two shapes
function opStairs(d1, d2, r, n) {
  var s = r/n, u = d2 - r;
  return Math.min(Math.min(d1,d2), 0.5*(u+d1+Math.abs(((u-d1)%s+s)%s*2-s)));
}

// Shell/Onion — turn any solid into a thin shell of given thickness
function opShell(d, thickness) { return Math.abs(d) - thickness; }
function opOnion(d, thickness) { return Math.abs(d) - thickness; }

// =========================================================================
// Domain Operations — transform query point before SDF evaluation
// =========================================================================

// Mirror across YZ plane (reflect x)
function domainMirror(px) { return Math.abs(px); }

// Infinite repetition along one axis with given spacing
// Returns the local coordinate to use instead of px
function domainRepeat(px, spacing) {
  return ((px % spacing) + spacing) % spacing - spacing / 2;
}

// Twist around Y axis — rotates XZ by angle proportional to Y
// Returns [rx, rz] to use instead of [px, pz]
function domainTwist(px, py, pz, k) {
  var c = Math.cos(k * py), s = Math.sin(k * py);
  return [px * c - pz * s, px * s + pz * c];
}

// Bend around X axis — rotates XY by angle proportional to X
// Returns [bx, by] to use instead of [px, py]
function domainBend(px, py, k) {
  var c = Math.cos(k * px), s = Math.sin(k * px);
  return [px * c - py * s, px * s + py * c];
}

// =========================================================================
// Smooth normal mesh buffer
// =========================================================================
var _meshNormals;
var _hasCustomNormals = false;

// Emit a triangle with explicit per-vertex normals (for smooth shading).
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
// =========================================================================
function sdfMesh(sdfFn, colorFn, bMin, bMax, resolution) {
  var res = resolution || 32;
  var nx = res + 1, ny = res + 1, nz = res + 1;

  // Bounding box dimensions and cell size
  var dx = (bMax[0] - bMin[0]) / res;
  var dy = (bMax[1] - bMin[1]) / res;
  var dz = (bMax[2] - bMin[2]) / res;

  // Phase 1: Evaluate SDF at every grid vertex
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

  // Epsilon for SDF gradient via central differences
  var eps = Math.max(dx, dy, dz) * 0.5;

  // Edge vertex indices and corner offsets
  var edgeVerts = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7]
  ];
  var cornerOffsets = [
    [0,0,0],[1,0,0],[1,1,0],[0,1,0],
    [0,0,1],[1,0,1],[1,1,1],[0,1,1]
  ];

  // Phase 2-6: March through cells and extract triangles
  for (var iz = 0; iz < res; iz++) {
    for (var iy = 0; iy < res; iy++) {
      for (var ix = 0; ix < res; ix++) {
        var vals = [];
        for (var c = 0; c < 8; c++) {
          var ci = ix + cornerOffsets[c][0];
          var cj = iy + cornerOffsets[c][1];
          var ck = iz + cornerOffsets[c][2];
          vals[c] = field[ck * ny * nx + cj * nx + ci];
        }

        var cubeIndex = 0;
        for (var c = 0; c < 8; c++) {
          if (vals[c] < 0) cubeIndex |= (1 << c);
        }
        if (MC_EDGE_TABLE[cubeIndex] === 0) continue;

        var edgeMask = MC_EDGE_TABLE[cubeIndex];
        var verts = [];
        for (var e = 0; e < 12; e++) {
          if (!(edgeMask & (1 << e))) { verts[e] = null; continue; }
          var ev = edgeVerts[e];
          var c0 = cornerOffsets[ev[0]], c1 = cornerOffsets[ev[1]];
          var v0 = vals[ev[0]], v1 = vals[ev[1]];
          var t = v0 / (v0 - v1);
          var vx = bMin[0] + (ix + c0[0] + (c1[0]-c0[0])*t) * dx;
          var vy = bMin[1] + (iy + c0[1] + (c1[1]-c0[1])*t) * dy;
          var vz = bMin[2] + (iz + c0[2] + (c1[2]-c0[2])*t) * dz;

          // Normal from SDF gradient via central differences
          var gnx = sdfFn(vx+eps,vy,vz) - sdfFn(vx-eps,vy,vz);
          var gny = sdfFn(vx,vy+eps,vz) - sdfFn(vx,vy-eps,vz);
          var gnz = sdfFn(vx,vy,vz+eps) - sdfFn(vx,vy,vz-eps);
          var glen = Math.sqrt(gnx*gnx+gny*gny+gnz*gnz) || 1;
          verts[e] = [vx, vy, vz, gnx/glen, gny/glen, gnz/glen];
        }

        var tris = MC_TRI_TABLE[cubeIndex];
        for (var t = 0; t < tris.length - 1; t += 3) {
          if (tris[t] === -1) break;
          var a = verts[tris[t]], b = verts[tris[t+1]], c = verts[tris[t+2]];
          if (!a || !b || !c) continue;

          var cx = (a[0]+b[0]+c[0])/3, cy = (a[1]+b[1]+c[1])/3, cz = (a[2]+b[2]+c[2])/3;
          var col = colorFn(cx, cy, cz);

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
// =========================================================================
function lathe(cx,cy,cz, profile, segments, r,g,b, angleOffset) {
  segments = segments || 16;
  angleOffset = angleOffset || 0;
  var pLen = profile.length;
  if (pLen < 2) return;

  // Pre-compute sin/cos for each segment step, offset by angleOffset
  var cosA = [], sinA = [];
  for (var i = 0; i <= segments; i++) {
    var angle = angleOffset + 2 * Math.PI * i / segments;
    cosA[i] = Math.cos(angle);
    sinA[i] = Math.sin(angle);
  }

  for (var p = 0; p < pLen - 1; p++) {
    var r0 = profile[p][0], y0 = cy + profile[p][1];
    var r1 = profile[p+1][0], y1 = cy + profile[p+1][1];

    for (var s = 0; s < segments; s++) {
      var bx0 = cx + r0 * cosA[s],   bz0 = cz + r0 * sinA[s];
      var bx1 = cx + r0 * cosA[s+1], bz1 = cz + r0 * sinA[s+1];
      var tx0 = cx + r1 * cosA[s],   tz0 = cz + r1 * sinA[s];
      var tx1 = cx + r1 * cosA[s+1], tz1 = cz + r1 * sinA[s+1];

      if (r0 === 0) {
        emitTriangle(cx,y0,cz, tx1,y1,tz1, tx0,y1,tz0, r,g,b);
      } else if (r1 === 0) {
        emitTriangle(bx0,y0,bz0, bx1,y0,bz1, cx,y1,cz, r,g,b);
      } else {
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
  var t0 = tangents[0];
  var notParallel = Math.abs(t0[0]) < 0.9;
  var arbx = notParallel ? 1 : 0;
  var arby = notParallel ? 0 : 1;
  var nx = -t0[2]*arby;
  var ny = t0[2]*arbx;
  var nz = t0[0]*arby - t0[1]*arbx;
  var nLen = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
  normals[0] = [nx/nLen, ny/nLen, nz/nLen];
  binormals[0] = [
    t0[1]*normals[0][2] - t0[2]*normals[0][1],
    t0[2]*normals[0][0] - t0[0]*normals[0][2],
    t0[0]*normals[0][1] - t0[1]*normals[0][0]
  ];

  for (var i = 1; i < pathLen; i++) {
    var ti = tangents[i-1], tj = tangents[i];
    var pi = path[i-1], pj = path[i];
    var vx = pj[0]-pi[0], vy = pj[1]-pi[1], vz = pj[2]-pi[2];
    var c1 = vx*vx+vy*vy+vz*vz;
    if (c1 < 1e-10) {
      normals[i] = normals[i-1];
      binormals[i] = binormals[i-1];
      continue;
    }
    var nPrev = normals[i-1];
    var dot1n = (vx*nPrev[0]+vy*nPrev[1]+vz*nPrev[2])/c1*2;
    var rn = [nPrev[0]-dot1n*vx, nPrev[1]-dot1n*vy, nPrev[2]-dot1n*vz];
    var dot1t = (vx*ti[0]+vy*ti[1]+vz*ti[2])/c1*2;
    var rt = [ti[0]-dot1t*vx, ti[1]-dot1t*vy, ti[2]-dot1t*vz];
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
  var heights = [];
  for (var i = 0; i <= resX; i++) {
    heights[i] = [];
    for (var j = 0; j <= resZ; j++) {
      heights[i][j] = heightFn(x0+i*stepX, z0+j*stepZ);
    }
  }
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

// --- Convenience helpers for common shapes ---
// These reduce boilerplate for simple single-primitive meshes.

function sphereMesh(cx, cy, cz, radius, r, g, b, res) {
  res = res || 64;
  var pad = radius * 1.3;
  sdfMesh(
    function(x, y, z) { return sdSphere(x - cx, y - cy, z - cz, radius); },
    function() { return [r, g, b]; },
    [cx - pad, cy - pad, cz - pad], [cx + pad, cy + pad, cz + pad], res
  );
}

function boxMesh(cx, cy, cz, sx, sy, sz, r, g, b, res) {
  res = res || 64;
  // Half-extents plus 30% padding for marching cubes bounds
  var px = sx * 0.5 * 1.3, py = sy * 0.5 * 1.3, pz = sz * 0.5 * 1.3;
  sdfMesh(
    function(x, y, z) { return sdBox(x - cx, y - cy, z - cz, sx * 0.5, sy * 0.5, sz * 0.5); },
    function() { return [r, g, b]; },
    [cx - px, cy - py, cz - pz], [cx + px, cy + py, cz + pz], res
  );
}

function cylinderMesh(cx, cy, cz, radius, height, r, g, b, res) {
  res = res || 64;
  var padR = radius * 1.3, padH = height * 0.5 * 1.3;
  sdfMesh(
    function(x, y, z) { return sdCylinder(x - cx, y - cy, z - cz, radius, height * 0.5); },
    function() { return [r, g, b]; },
    [cx - padR, cy - padH, cz - padR], [cx + padR, cy + padH, cz + padR], res
  );
}

function torusMesh(cx, cy, cz, majorR, minorR, r, g, b, res) {
  res = res || 64;
  var padXZ = (majorR + minorR) * 1.3, padY = minorR * 1.3;
  sdfMesh(
    function(x, y, z) { return sdTorus(x - cx, y - cy, z - cz, majorR, minorR); },
    function() { return [r, g, b]; },
    [cx - padXZ, cy - padY, cz - padXZ], [cx + padXZ, cy + padY, cz + padXZ], res
  );
}

self.onmessage = function(e) {
  const { code, seed, sceneBounds } = e.data;
  _seed = seed || 42;
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

  try {
    const fn = new Function(
      "emitTriangle", "emitQuad",
      "box", "extrudePath", "grid", "sdfMesh", "lathe",
      "sdSphere", "sdBox", "sdCapsule", "sdTorus", "sdCone", "sdPlane", "sdCylinder",
      "sdEllipsoid", "sdOctahedron", "sdHexPrism",
      "opUnion", "opSubtract", "opIntersect",
      "opSmoothUnion", "opSmoothSubtract", "opSmoothIntersect",
      "opRound", "opDisplace",
      "opXOR", "opChamfer", "opStairs", "opShell", "opOnion",
      "domainMirror", "domainRepeat", "domainTwist", "domainBend",
      "noise2D", "noise3D", "fbm2D", "fbm3D", "random", "Math",
      "SCENE_MIN_X", "SCENE_MAX_X", "SCENE_MIN_Y", "SCENE_MAX_Y",
      "SCENE_MIN_Z", "SCENE_MAX_Z", "SCENE_CENTER_X", "SCENE_CENTER_Y",
      "SCENE_CENTER_Z",
      "sphereMesh", "boxMesh", "cylinderMesh", "torusMesh",
      code
    );
    fn(
      emitTriangle, emitQuad,
      box, extrudePath, grid, sdfMesh, lathe,
      sdSphere, sdBox, sdCapsule, sdTorus, sdCone, sdPlane, sdCylinder,
      sdEllipsoid, sdOctahedron, sdHexPrism,
      opUnion, opSubtract, opIntersect,
      opSmoothUnion, opSmoothSubtract, opSmoothIntersect,
      opRound, opDisplace,
      opXOR, opChamfer, opStairs, opShell, opOnion,
      domainMirror, domainRepeat, domainTwist, domainBend,
      noise2D, noise3D, fbm2D, fbm3D, _mulberry32, Math,
      SCENE_MIN_X, SCENE_MAX_X, SCENE_MIN_Y, SCENE_MAX_Y,
      SCENE_MIN_Z, SCENE_MAX_Z, SCENE_CENTER_X, SCENE_CENTER_Y,
      SCENE_CENTER_Z,
      sphereMesh, boxMesh, cylinderMesh, torusMesh
    );
  } catch (err) {
    // Send structured error back with partial progress info
    self.postMessage({
      error: true,
      message: err.message || "Unknown runtime error",
      stack: err.stack || "",
      meshVertexCount: _meshCount
    });
    return;
  }

  const meshPositions = _meshPositions.slice(0, _meshCount * 3);
  const meshColors = _meshColors.slice(0, _meshCount * 3);
  const meshNormals = _meshNormals.slice(0, _meshCount * 3);
  const transferables = [meshPositions.buffer, meshColors.buffer];
  if (_hasCustomNormals) transferables.push(meshNormals.buffer);
  self.postMessage(
    { meshPositions, meshColors, meshVertexCount: _meshCount, meshNormals: _hasCustomNormals ? meshNormals : null, hasCustomNormals: _hasCustomNormals },
    transferables
  );
};
`;

import { validateMeshOutput } from "@/lib/sandbox/outputValidation";
import { validateCode } from "@/lib/sandbox/validate";

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
  // AST validation — reject dangerous code before creating the worker
  const validation = validateCode(code);
  if (!validation.valid) {
    return Promise.reject(
      new Error(`Code validation failed: ${validation.error}`),
    );
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(getWorkerBlobUrl());
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Code execution timed out (300s)"));
    }, 300000);

    worker.onmessage = (e) => {
      clearTimeout(timeout);
      worker.terminate();

      // Check for structured runtime errors from the worker's try/catch
      if (e.data.error) {
        const {
          message,
          stack,
          meshVertexCount: partialCount,
        } = e.data as {
          error: true;
          message: string;
          stack: string;
          meshVertexCount: number;
        };
        // Extract line number from stack trace (anonymous function lines)
        const lineMatch = stack.match(/<anonymous>:(\d+):(\d+)/);
        let detail = `Runtime error: ${message}`;
        if (lineMatch) {
          const lineNum = Number.parseInt(lineMatch[1], 10);
          // The code is wrapped in a function body, so line numbers are 1-indexed
          // relative to the user code
          const codeLines = code.split("\n");
          // new Function adds a wrapper — line 1 in stack = first line of user code
          const offendingLine =
            lineNum >= 1 && lineNum <= codeLines.length
              ? codeLines[lineNum - 1].trim()
              : null;
          detail += ` (line ${lineNum}`;
          if (offendingLine) {
            detail += `: \`${offendingLine}\``;
          }
          detail += ")";
        }
        if (partialCount > 0) {
          detail += `. Generated ${partialCount} vertices before error.`;
        }
        reject(new Error(detail));
        return;
      }

      const {
        meshPositions,
        meshColors,
        meshVertexCount,
        meshNormals,
        hasCustomNormals,
      } = e.data as {
        meshPositions: Float32Array;
        meshColors: Float32Array;
        meshVertexCount: number;
        meshNormals: Float32Array | null;
        hasCustomNormals: boolean;
      };
      const layer: GeneratedLayer = {
        id: `layer-${_nextLayerId++}`,
        meshPositions,
        meshColors,
        meshVertexCount,
      };
      if (hasCustomNormals && meshNormals) {
        layer.meshNormals = meshNormals;
        layer.hasCustomNormals = true;
      }

      // Validate mesh output — reject if hard errors, log warnings
      const meshValidation = validateMeshOutput(layer);
      if (!meshValidation.valid) {
        reject(
          new Error(
            `Mesh validation failed: ${meshValidation.errors.join("; ")}`,
          ),
        );
        return;
      }
      if (meshValidation.warnings.length > 0) {
        console.warn(
          "[autoscene] Mesh warnings:",
          meshValidation.warnings.join("; "),
        );
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
