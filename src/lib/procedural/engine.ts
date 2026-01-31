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

const MAX_POINTS = 100000;
let _count = 0;
let _positions, _colors, _sizes;

function emit(x, y, z, r, g, b, size) {
  if (_count >= MAX_POINTS) return;
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

self.onmessage = function(e) {
  const { code, seed, sceneBounds } = e.data;
  _seed = seed || 42;
  _count = 0;
  _positions = new Float32Array(MAX_POINTS * 3);
  _colors = new Float32Array(MAX_POINTS * 3);
  _sizes = new Float32Array(MAX_POINTS);

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
    "emit", "noise2D", "noise3D", "fbm2D", "fbm3D", "random", "Math",
    "SCENE_MIN_X", "SCENE_MAX_X", "SCENE_MIN_Y", "SCENE_MAX_Y",
    "SCENE_MIN_Z", "SCENE_MAX_Z", "SCENE_CENTER_X", "SCENE_CENTER_Y",
    "SCENE_CENTER_Z", "POINT_COUNT",
    code
  );
  fn(
    emit, noise2D, noise3D, fbm2D, fbm3D, _mulberry32, Math,
    SCENE_MIN_X, SCENE_MAX_X, SCENE_MIN_Y, SCENE_MAX_Y,
    SCENE_MIN_Z, SCENE_MAX_Z, SCENE_CENTER_X, SCENE_CENTER_Y,
    SCENE_CENTER_Z, POINT_COUNT
  );

  const positions = _positions.slice(0, _count * 3);
  const colors = _colors.slice(0, _count * 3);
  const sizes = _sizes.slice(0, _count);
  self.postMessage({ positions, colors, sizes, count: _count }, [positions.buffer, colors.buffer, sizes.buffer]);
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
      reject(new Error("Code execution timed out (5s)"));
    }, 5000);

    worker.onmessage = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      const { positions, colors, sizes, count } = e.data as {
        positions: Float32Array;
        colors: Float32Array;
        sizes: Float32Array;
        count: number;
      };
      resolve({
        id: `layer-${_nextLayerId++}`,
        positions,
        colors,
        sizes,
        count,
      });
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
