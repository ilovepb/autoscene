import { createAnthropic } from "@ai-sdk/anthropic";
import { createCerebras } from "@ai-sdk/cerebras";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";

const SYSTEM_PROMPT = `You are a 3D scene architect. Your job is to create and modify 3D scenes rendered as ASCII art or WebGL point clouds.

## Coordinate System
- X axis: right (positive) / left (negative)
- Y axis: up (positive) / down (negative)
- Z axis: negative into the screen (point clouds live at Z = -1 to Z = -6)
- Scene center is approximately (0, 0, -3)
- Camera is at origin (0, 0, 0) looking down -Z

## How to Generate Points
Call the generate_3d_points tool with JavaScript code that calls:
  emit(x, y, z, r, g, b, size?)
where x, y, z are world coordinates, r, g, b are color values from 0 to 1, and size is an optional point radius (default 0.03). Larger sizes create denser, more solid-looking surfaces.

## Available Sandbox API
- emit(x, y, z, r, g, b, size?) — place a colored 3D point. size controls visual radius (default 0.03, range ~0.01-0.08)
- noise2D(x, y) — 2D value noise, returns -1 to 1
- noise3D(x, y, z) — 3D value noise, returns -1 to 1
- fbm2D(x, y, octaves?, lacunarity?, gain?) — fractal Brownian motion (multi-octave noise2D), returns -1 to 1. Defaults: octaves=4, lacunarity=2.0, gain=0.5. Great for organic terrain, bark textures, cloud shapes.
- fbm3D(x, y, z, octaves?, lacunarity?, gain?) — 3D fractal Brownian motion, returns -1 to 1. Ideal for volumetric organic shapes like foliage, rock surfaces, and natural formations.
- random() — seeded pseudo-random number 0 to 1
- Math.* — all standard Math functions
- Scene bounds variables: SCENE_MIN_X, SCENE_MAX_X, SCENE_MIN_Y, SCENE_MAX_Y, SCENE_MIN_Z, SCENE_MAX_Z, SCENE_CENTER_X, SCENE_CENTER_Y, SCENE_CENTER_Z, POINT_COUNT

## Procedural Techniques
When generating organic shapes like trees, use these patterns:

**Trees:** Build with recursive branching. Start with a thick trunk (cylinder of points), split into branches at each level, and cap branch tips with dense leaf clusters. Use different point sizes: ~0.015 for thin branches, ~0.025 for trunk, ~0.04-0.06 for leaves.
- Trunk: cylinder from base to first split, 500-1000 points
- Branches: 3-5 per split level, 2-3 recursion levels, narrowing each level
- Leaves: dense spherical/ellipsoidal clusters at branch tips using fbm3D to distort the shape, 200-500 points per cluster
- Color: brown trunk (0.35, 0.2, 0.1) with noise variation, green leaves with hue shifts (0.2-0.5, 0.4-0.8, 0.05-0.2)

**Terrain/Ground:** Use fbm2D for height maps. Sample a grid of X/Z points, set Y = baseY + fbm2D(x*scale, z*scale) * amplitude.

**Rocks/Boulders:** Distorted spheres using fbm3D to perturb the surface radius.

**Color variation:** Always add slight noise-based color offsets to avoid flat, artificial-looking surfaces. Example: r + fbm3D(x*5, y*5, z*5) * 0.1

**Point density:** Use 30,000-80,000 points for organic shapes to get solid-looking results. Sparse point counts (under 10k) look skeletal.

## Image to 3D
When the user uploads an image, you can convert it into a 3D point cloud using the image_to_3d tool. The user's uploaded images are listed in the available images context. Use the imageId to reference a specific image. This runs monocular depth estimation to create a 3D reconstruction from the 2D image.
IMPORTANT: All images in the available images list have already been successfully loaded and validated by the client. Always use the image_to_3d tool regardless of the file extension or format — the browser has already decoded the image data. Never refuse to process an image based on its filename or format.

## Guidelines
- Aim for 5,000 to 80,000 points per generation (max 100,000). Use higher counts (30k-80k) for organic shapes like trees, terrain, and rocks.
- Use the scene bounds to position elements relative to existing content
- Be creative with colors and shapes
- Always respond with a brief description of what you're creating, then call the tool
- If the user uploads an image and asks to see it in 3D, use image_to_3d
- If the scene is empty, you can still generate procedural content or convert uploaded images

## Removing / Editing Elements
You can remove procedural layers:
- Use remove_layer to remove a specific layer by its ID
- Use clear_all_layers to remove ALL procedural layers at once
- Layer IDs are provided in the activeLayers list in the system context

You CAN also delete points from the original point cloud:
- Use delete_points_in_region to delete all original points within a bounding box
- Use delete_points_in_sphere to delete all original points within a sphere
- Use toggle_original_cloud to show/hide the entire original point cloud
- These operations are destructive and cannot be undone (the user must re-upload to restore)
- Use scene bounds to estimate where objects are in the point cloud

## Examples of what you can generate
- Rain drops falling from above the scene
- A spiral of colored points around the scene center
- A grid/terrain surface below the point cloud
- Geometric shapes (spheres, cubes, toruses)
- Particle effects (explosions, trails, constellations)
- Trees, mountains, or other organic shapes using noise`;

function createModel(
  provider: string,
  apiKey: string,
  modelId: string,
): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "groq":
      return createGroq({ apiKey })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    default:
      return createCerebras({ apiKey })(modelId);
  }
}

export async function handleChatRequest(req: Request): Promise<Response> {
  const { messages, sceneBounds, activeLayers, availableImages } =
    await req.json();

  const provider = req.headers.get("x-provider") ?? "cerebras";
  const apiKey =
    req.headers.get("x-api-key") ?? process.env.CEREBRAS_API_KEY ?? "";
  const modelId = req.headers.get("x-model") ?? "llama-3.3-70b";

  const model = createModel(provider, apiKey, modelId);

  const hasContent = sceneBounds?.pointCount > 0;
  const imagesList =
    Array.isArray(availableImages) && availableImages.length > 0
      ? `\nAvailable uploaded images: ${JSON.stringify(availableImages)}`
      : "";

  const result = streamText({
    model,
    system:
      SYSTEM_PROMPT +
      (hasContent
        ? `\n\nCurrent scene bounds: ${JSON.stringify(sceneBounds)}`
        : "\n\nThe scene is currently empty. You can generate procedural content or convert uploaded images to 3D.") +
      `\nActive procedural layers: ${JSON.stringify(activeLayers ?? [])}` +
      imagesList,
    messages: await convertToModelMessages(messages as UIMessage[]),
    tools: {
      image_to_3d: tool({
        description:
          "Convert a user-uploaded image into a 3D point cloud using monocular depth estimation. The image must have been uploaded by the user — use the imageId from the available images list.",
        inputSchema: z.object({
          imageId: z
            .string()
            .describe("The ID of the uploaded image to convert"),
        }),
      }),
      generate_3d_points: tool({
        description:
          "Generate JavaScript code that creates 3D points by calling emit(x, y, z, r, g, b, size?). The code runs in a sandboxed environment with access to: emit(), noise2D(x,y), noise3D(x,y,z), fbm2D(x,y,octaves?,lacunarity?,gain?), fbm3D(x,y,z,octaves?,lacunarity?,gain?), random(), Math.*, and scene bound variables. Use fbm functions for organic shapes. The optional size parameter controls per-point radius (default 0.03).",
        inputSchema: z.object({
          code: z
            .string()
            .describe(
              "JavaScript code that calls emit(x, y, z, r, g, b, size?) to place 3D points. RGB values are 0-1. size is optional (default 0.03). Use 30k-80k points for organic shapes, up to 100k max.",
            ),
        }),
      }),
      remove_layer: tool({
        description:
          "Remove a specific procedural layer from the scene by its ID. Use this when the user wants to delete or undo a specific element. The layer ID is returned when generate_3d_points executes successfully, and available in the activeLayers system context.",
        inputSchema: z.object({
          layerId: z
            .string()
            .describe(
              "The ID of the layer to remove (e.g. 'layer-0', 'layer-1')",
            ),
        }),
      }),
      clear_all_layers: tool({
        description:
          "Remove ALL procedural layers from the scene, resetting it to just the original point cloud from the uploaded image. Use this when the user wants to start over or clear everything that was added.",
        inputSchema: z.object({}),
      }),
      delete_points_in_region: tool({
        description:
          "Delete points from the ORIGINAL point cloud within a bounding box region. This permanently removes points (moves them off-screen). Use scene bounds to estimate where objects are. Useful for erasing parts of the original image point cloud.",
        inputSchema: z.object({
          minX: z.number().describe("Minimum X coordinate of the bounding box"),
          maxX: z.number().describe("Maximum X coordinate of the bounding box"),
          minY: z.number().describe("Minimum Y coordinate of the bounding box"),
          maxY: z.number().describe("Maximum Y coordinate of the bounding box"),
          minZ: z.number().describe("Minimum Z coordinate of the bounding box"),
          maxZ: z.number().describe("Maximum Z coordinate of the bounding box"),
        }),
      }),
      delete_points_in_sphere: tool({
        description:
          "Delete points from the ORIGINAL point cloud within a sphere. This permanently removes points. Provide a center point and radius. Good for removing circular/spherical areas.",
        inputSchema: z.object({
          x: z.number().describe("X coordinate of sphere center"),
          y: z.number().describe("Y coordinate of sphere center"),
          z: z.number().describe("Z coordinate of sphere center"),
          radius: z
            .number()
            .positive()
            .describe("Radius of the deletion sphere"),
        }),
      }),
      toggle_original_cloud: tool({
        description:
          "Show or hide the entire original point cloud. Useful for temporarily hiding the original image to see only procedural layers, or to restore visibility.",
        inputSchema: z.object({
          visible: z
            .boolean()
            .describe("Whether the original cloud should be visible"),
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
