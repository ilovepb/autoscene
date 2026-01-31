import { env, pipeline, RawImage } from "@huggingface/transformers";

// -----------------------------------------------------------------------
// Depth Estimation Pipeline
// -----------------------------------------------------------------------
// This module uses Hugging Face's Transformers.js to run a monocular depth
// estimation model *entirely in the browser* -- no server required.
//
// The model (Depth-Anything-v2-small) is a neural network trained on
// millions of image-depth pairs. Given a single 2D image, it predicts a
// "depth map": a grayscale image where each pixel's intensity represents
// how far that point is from the camera.
//
// Key limitation: the output is *relative* depth (ordering of near/far),
// not *metric* depth (actual centimeters). This is fine for our 3D
// visualization since we normalize the depth range anyway.
// -----------------------------------------------------------------------

// Always fetch the model from the Hugging Face CDN (no local file check).
env.allowLocalModels = false;

// Module-level singleton for the loaded pipeline. Loading the ONNX model
// is expensive (~50-100MB download + compilation), so we do it once and
// reuse for all subsequent depth estimations.
// biome-ignore lint/suspicious/noExplicitAny: pipeline type not exported by transformers
let depthPipeline: any = null;

export interface DepthResult {
  /** Raw depth values -- higher = closer to camera. */
  depthData: Float32Array;
  /** Width of the depth map (may differ from the input image width). */
  depthWidth: number;
  /** Height of the depth map. */
  depthHeight: number;
}

/**
 * Download and initialize the depth estimation model.
 *
 * The model runs on WebGPU if the browser supports it (Chrome 113+),
 * otherwise falls back to WebAssembly (WASM). WebGPU is significantly
 * faster because it runs inference on the GPU.
 *
 * @param onProgress - Called with download progress (0-100) during model fetch.
 */
export async function loadDepthModel(
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (depthPipeline) return;

  // Feature-detect WebGPU. The `navigator.gpu` property exists only in
  // browsers with WebGPU support.
  const device = (navigator as any).gpu ? "webgpu" : "wasm";

  depthPipeline = await pipeline(
    "depth-estimation" as any,
    "onnx-community/depth-anything-v2-base",
    {
      device: device as any,
      progress_callback: (p: any) => {
        if (onProgress && p.progress != null) {
          onProgress(p.progress);
        }
      },
    },
  );
}

/**
 * Run depth estimation on a loaded image element.
 *
 * The model internally resizes the image to its expected input resolution,
 * runs a forward pass through the neural network, and returns a depth map
 * tensor. The depth map dimensions may differ from the original image.
 *
 * @param image - An HTMLImageElement with a loaded src (data URL or blob URL).
 * @returns The raw depth map data and its dimensions.
 */
export async function estimateDepth(
  image: HTMLImageElement,
): Promise<DepthResult> {
  if (!depthPipeline) {
    throw new Error("Depth model not loaded. Call loadDepthModel() first.");
  }

  // Convert the HTML image to a RawImage that Transformers.js can process.
  const rawImage = await RawImage.fromURL(image.src);

  // Run inference. The pipeline returns the predicted depth tensor.
  const output = await depthPipeline(rawImage);
  const result = Array.isArray(output) ? output[0] : output;

  const depthTensor = result.predicted_depth;
  const [depthHeight, depthWidth] = depthTensor.dims;
  const depthData = depthTensor.data as Float32Array;

  return { depthData, depthWidth, depthHeight };
}
