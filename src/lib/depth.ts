import { pipeline, env, RawImage } from "@huggingface/transformers";

// Disable local model check — always use remote
env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let depthPipeline: any = null;

export interface DepthResult {
  depthData: Float32Array;
  depthWidth: number;
  depthHeight: number;
}

export async function loadDepthModel(
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (depthPipeline) return;

  const device = (navigator as any).gpu ? "webgpu" : "wasm";

  depthPipeline = await pipeline(
    "depth-estimation" as any,
    "onnx-community/depth-anything-v2-small",
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

export async function estimateDepth(
  image: HTMLImageElement,
): Promise<DepthResult> {
  if (!depthPipeline) {
    throw new Error("Depth model not loaded. Call loadDepthModel() first.");
  }

  const rawImage = await RawImage.fromURL(image.src);
  const output = await depthPipeline(rawImage);
  const result = Array.isArray(output) ? output[0] : output;
  const depthTensor = result.predicted_depth;
  const [depthHeight, depthWidth] = depthTensor.dims;
  const depthData = depthTensor.data as Float32Array;

  return { depthData, depthWidth, depthHeight };
}
