import type { DepthResult } from "./depth";

export interface PointCloud {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
}

/**
 * Backproject depth map + RGB image data into a 3D point cloud.
 * Assumes a pinhole camera with ~60° horizontal FOV.
 */
export function buildPointCloud(
  depth: DepthResult,
  imageData: ImageData,
  step = 2,
): PointCloud {
  const { depthData, depthWidth, depthHeight } = depth;
  const { data: rgba, width: imgW, height: imgH } = imageData;

  // Resample depth to image dimensions if they differ
  const useW = imgW;
  const useH = imgH;

  const cx = useW / 2;
  const cy = useH / 2;
  const fov = 60;
  const fx = useW / (2 * Math.tan(((fov / 2) * Math.PI) / 180));
  const fy = fx; // square pixels

  // Normalize depth to [0, 1] range then scale
  let minD = Infinity;
  let maxD = -Infinity;
  for (let i = 0; i < depthData.length; i++) {
    if (depthData[i] < minD) minD = depthData[i];
    if (depthData[i] > maxD) maxD = depthData[i];
  }
  const depthRange = maxD - minD || 1;

  const maxPoints = Math.ceil(useW / step) * Math.ceil(useH / step);
  const positions = new Float32Array(maxPoints * 3);
  const colors = new Float32Array(maxPoints * 3);
  let idx = 0;

  for (let v = 0; v < useH; v += step) {
    for (let u = 0; u < useW; u += step) {
      // Sample depth (bilinear-ish via nearest for speed)
      const du = Math.floor((u / useW) * depthWidth);
      const dv = Math.floor((v / useH) * depthHeight);
      const rawZ = depthData[dv * depthWidth + du];

      // Normalize and scale depth. Depth-Anything returns relative depth
      // where higher values = closer. Invert so closer objects have smaller Z.
      const normZ = (rawZ - minD) / depthRange; // 0..1, 0=far, 1=near
      const Z = 1 + (1 - normZ) * 5; // range [1, 6], near=1, far=6

      const X = ((u - cx) * Z) / fx;
      const Y = -((v - cy) * Z) / fy; // flip Y

      const pi = idx * 3;
      positions[pi] = X;
      positions[pi + 1] = Y;
      positions[pi + 2] = -Z; // camera looks down -Z

      // Sample color from image
      const ri = (v * imgW + u) * 4;
      colors[pi] = rgba[ri] / 255;
      colors[pi + 1] = rgba[ri + 1] / 255;
      colors[pi + 2] = rgba[ri + 2] / 255;

      idx++;
    }
  }

  return {
    positions: positions.subarray(0, idx * 3),
    colors: colors.subarray(0, idx * 3),
    count: idx,
  };
}
