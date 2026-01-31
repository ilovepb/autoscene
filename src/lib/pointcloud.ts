import type { DepthResult } from "@/lib/depth";

export interface PointCloud {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
}

// -----------------------------------------------------------------------
// Pinhole Camera Model (overview)
// -----------------------------------------------------------------------
// A pinhole camera projects 3D world points onto a 2D image plane through
// a single point (the "pinhole"). The key parameters are:
//
//   fx, fy — focal lengths in pixels (how many pixels per radian of view)
//   cx, cy — principal point (where the optical axis hits the image, usually center)
//
// The projection equations are:
//   u = fx * (X / Z) + cx      (pixel column from 3D X)
//   v = fy * (Y / Z) + cy      (pixel row from 3D Y)
//
// "Backprojection" reverses this: given a pixel (u, v) and its depth Z,
// we recover the original 3D point:
//   X = (u - cx) * Z / fx
//   Y = (v - cy) * Z / fy
//
// This is exactly what buildPointCloud does for every pixel.
// -----------------------------------------------------------------------

/**
 * Compute the horizontal focal length (in pixels) for a given image width
 * and horizontal field-of-view angle.
 *
 * Derivation: if the full image spans `fovDegrees` horizontally, then
 * half the image width subtends half the FOV angle. From trigonometry:
 *
 *   tan(fov/2) = (width/2) / fx
 *   fx = (width/2) / tan(fov/2)
 */
function focalLengthFromFov(imageWidth: number, fovDegrees: number): number {
  const halfFovRadians = ((fovDegrees / 2) * Math.PI) / 180;
  return imageWidth / (2 * Math.tan(halfFovRadians));
}

/**
 * Find the min and max values in a Float32Array.
 * Used to normalize depth values into a consistent range.
 */
function findMinMax(data: Float32Array): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  return { min, max };
}

/**
 * Backproject a depth map and RGB image into a 3D point cloud.
 *
 * For each sampled pixel we:
 *  1. Look up its depth value and normalize it to [0, 1]
 *  2. Map that to a world-space Z distance
 *  3. Use the pinhole camera equations (inverted) to find X, Y
 *  4. Store the position and the pixel's RGB color
 *
 * @param depth     - Depth estimation result (raw depth values + dimensions)
 * @param imageData - Original image pixel data (RGBA)
 * @param step      - Sampling stride (e.g. 2 = every other pixel). Higher = faster but fewer points.
 */
export function buildPointCloud(
  depth: DepthResult,
  imageData: ImageData,
  step = 2,
): PointCloud {
  const { depthData, depthWidth, depthHeight } = depth;
  const { data: rgba, width: imgW, height: imgH } = imageData;

  // Principal point: the center of the image, where the camera's optical
  // axis intersects the image plane.
  const cx = imgW / 2;
  const cy = imgH / 2;

  // We assume a ~60-degree horizontal FOV, which is a reasonable default for
  // typical photos (roughly equivalent to a 35mm lens on a full-frame camera).
  const HORIZONTAL_FOV_DEGREES = 60;
  const fx = focalLengthFromFov(imgW, HORIZONTAL_FOV_DEGREES);
  // fy = fx assumes square pixels (equal horizontal and vertical pixel pitch),
  // which is true for virtually all modern cameras and screens.
  const fy = fx;

  // -----------------------------------------------------------------------
  // Depth normalization
  // -----------------------------------------------------------------------
  // Depth-Anything-v2 outputs *relative* (not metric) depth. The raw values
  // have arbitrary scale: higher = closer to the camera. We normalize to
  // [0, 1] then map to a world-space Z range so the point cloud has
  // reasonable proportions.
  const { min: minDepth, max: maxDepth } = findMinMax(depthData);
  const depthRange = maxDepth - minDepth || 1; // avoid division by zero

  // Pre-allocate output buffers for the worst case (every sampled pixel).
  const maxPoints = Math.ceil(imgW / step) * Math.ceil(imgH / step);
  const positions = new Float32Array(maxPoints * 3);
  const colors = new Float32Array(maxPoints * 3);
  let pointIndex = 0;

  for (let v = 0; v < imgH; v += step) {
    for (let u = 0; u < imgW; u += step) {
      // Map image pixel (u, v) to the nearest depth map texel.
      // The depth map may be a different resolution than the image, so we
      // scale coordinates proportionally (nearest-neighbor sampling).
      const du = Math.floor((u / imgW) * depthWidth);
      const dv = Math.floor((v / imgH) * depthHeight);
      const rawDepth = depthData[dv * depthWidth + du];

      // Normalize raw depth to [0, 1] where 0 = farthest, 1 = nearest.
      const normalizedDepth = (rawDepth - minDepth) / depthRange;

      // Convert to world-space Z distance. We invert (1 - norm) because in
      // our coordinate system, *smaller* Z values should be closer to the
      // camera. The range [1, 6] keeps all points in front of the camera
      // (Z > 0) and gives a comfortable depth spread for viewing.
      const Z = 1 + (1 - normalizedDepth) * 5;

      // -----------------------------------------------------------------------
      // Backprojection: pixel (u, v) + depth Z --> 3D point (X, Y, Z)
      // -----------------------------------------------------------------------
      // X: horizontal offset from center, scaled by depth.
      //    Points farther from center appear farther in 3D.
      const X = ((u - cx) * Z) / fx;

      // Y: vertical offset from center, scaled by depth.
      //    We negate because image rows increase downward (top=0), but in
      //    Three.js / standard 3D convention, Y increases upward.
      const Y = -((v - cy) * Z) / fy;

      const pi = pointIndex * 3;
      positions[pi] = X;
      positions[pi + 1] = Y;
      // We place points along -Z because Three.js cameras look down the
      // negative Z axis by default.
      positions[pi + 2] = -Z;

      // Sample the original image color for this point (RGBA, 4 bytes/pixel).
      // Normalize from [0, 255] to [0, 1] for Three.js.
      const rgbaIndex = (v * imgW + u) * 4;
      colors[pi] = rgba[rgbaIndex] / 255;
      colors[pi + 1] = rgba[rgbaIndex + 1] / 255;
      colors[pi + 2] = rgba[rgbaIndex + 2] / 255;

      pointIndex++;
    }
  }

  // Return only the portion of the buffers we actually filled.
  return {
    positions: positions.subarray(0, pointIndex * 3),
    colors: colors.subarray(0, pointIndex * 3),
    count: pointIndex,
  };
}
