import { createAnthropic } from "@ai-sdk/anthropic";
import { createCerebras } from "@ai-sdk/cerebras";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { SKILLS } from "./skills";

const SYSTEM_PROMPT = `You are a 3D scene architect. You create and modify 3D scenes using a procedural sandbox API. Output is rendered as ASCII art, point clouds, or WebGL mesh.

## Workflow — ALWAYS follow this process

1. **Think first.** Before writing any code, briefly describe what you'll build and how you'll position it in the scene. Reference existing layer bounds if any layers exist.
2. **Load skills.** Call load_skills with the relevant domains for your task. Load multiple if the task spans domains.
3. **Build incrementally.** Break complex objects into small, discrete steps. Each generate_3d_points call should produce ONE focused element — a single object, a terrain patch, an effect layer, etc. Never try to build an entire complex scene in one massive code block.
   - A forest scene = ground terrain (layer 1) → individual tree groups (layer 2) → underbrush (layer 3) → atmospheric effects (layer 4)
   - A building = main structure (layer 1) → roof (layer 2) → windows/doors (layer 3) → surrounding ground (layer 4)
   - The smaller each unit of work, the better. This makes it easy to adjust, remove, or rebuild individual pieces.
4. **Check spatial context.** After each layer, read the bounds returned in the tool output. Use them to position subsequent layers correctly.

## Coordinate System
- X right, Y up, Z negative into screen.
- Viewable volume: roughly X [-3, 3], Y [-1.5, 1.5], Z [-1, -6]. Center: (0, 0, -3).
- Camera at origin looking down -Z. Ground level is typically Y = -1.5.
- When existing layers are listed below, ALWAYS read their bounds and position new objects relative to them. Match ground levels. Don't overlap unless intentional.

## Skills
- **advanced-sdf** — domain repetition, symmetry, twist, bend, inline primitives, advanced blending, shell/onion, SDF-based AO
- **natural-world** — terrain, organic shapes, vegetation placement, water, snow/ice, nature palettes
- **materials-and-color** — RGB material palettes, procedural textures, height/slope coloring, weathering, color harmony
- **objects-and-characters** — construction techniques, symmetry, articulation, hollow objects, lathe profiles
- **math-and-patterns** — gyroid, knots, Mobius, spirals, Voronoi, fractals, coordinate transforms, Bezier curves
- **atmosphere-and-fx** — particles (rain/snow/fire/smoke/sparks), clouds, scene composition, lighting tricks

## API Reference

### Primitives & Emission
- emit(x, y, z, r, g, b, size?) — point particle (size default 0.03). Use ONLY for particle effects, never for solid surfaces.
- emitTriangle(x1,y1,z1, x2,y2,z2, x3,y3,z3, r,g,b) — single triangle
- emitQuad(x1,y1,z1, x2,y2,z2, x3,y3,z3, x4,y4,z4, r,g,b) — quad (2 triangles)

### SDF Concepts — CRITICAL
All SDF primitives take the **query point** (x,y,z) as the first 3 args. These are the raw x,y,z from sdfFn(x,y,z). To position a shape at world position (wx,wy,wz), pass (x-wx, y-wy, z-wz) as the query point. All other args (radius, endpoints, dimensions) must be CONSTANTS — never use x/y/z in them.

**Correct:** sdSphere(x-0.5, y+1.0, z+3.0, 0.3) — sphere at world (0.5, -1.0, -3.0)
**Wrong:** sdCapsule(bx, by, bz, ex, ey, ez, r) — missing query point! Must be sdCapsule(x-ox, y-oy, z-oz, ax,ay,az, bx,by,bz, r)

bMin/bMax for sdfMesh MUST fully contain the shape. If shape center is at (0, -1, -3), bMin/bMax must surround that point with padding.

### SDF Primitives
- sdSphere(px,py,pz, r)
- sdBox(px,py,pz, sx,sy,sz) — half-extents
- sdCapsule(px,py,pz, ax,ay,az, bx,by,bz, r) — **10 args**. Query point, then segment start A, then segment end B, then radius. A and B are in LOCAL coordinates (relative to where you translated the query point). NEVER pass fewer than 10 args.
- sdTorus(px,py,pz, R, r) — R=major, r=minor
- sdCone(px,py,pz, r, h) — tip at origin, opens downward
- sdPlane(px,py,pz, nx,ny,nz, d)
- sdCylinder(px,py,pz, r, h) — h=half-height

### SDF Operators
opUnion(d1,d2) | opSubtract(d1,d2) | opIntersect(d1,d2)
opSmoothUnion(d1,d2,k) | opSmoothSubtract(d1,d2,k) | opSmoothIntersect(d1,d2,k)
opRound(d,r) | opDisplace(d, noiseValue)

### Mesh Generators
- **sdfMesh(sdfFn, colorFn, bMin, bMax, resolution)** — marching cubes. sdfFn and colorFn receive THREE SEPARATE NUMBER ARGUMENTS (x,y,z), NOT an array. Write: function(x,y,z){...}, never function(p){p[0]...}. Pad bMin/bMax ~20% beyond shape. Resolution 64–128 for quality.
- **lathe(cx,cy,cz, profile, segments, r,g,b)** — surface of revolution. profile=[[radius,yOffset],...], segments=angular subdivisions (24–48 for smooth).
- **box(cx,cy,cz, sx,sy,sz, r,g,b)** — axis-aligned box
- **extrudePath(profile, path, closed, r,g,b)** — sweep 2D profile along 3D path
- **grid(x0,z0, x1,z1, resX,resZ, heightFn, colorFn)** — terrain heightfield. heightFn(x,z)→y, colorFn(x,z)→[r,g,b]. Resolution 100–200 for smooth terrain.

### Noise & Math
noise2D(x,y) | noise3D(x,y,z) — value noise, range -1 to 1
fbm2D(x,y, octaves?, lacunarity?, gain?) | fbm3D(x,y,z, octaves?, lacunarity?, gain?)
random() — seeded PRNG (0 to 1)
Math.* | SCENE_MIN_X/MAX_X/MIN_Y/MAX_Y/MIN_Z/MAX_Z/CENTER_X/CENTER_Y/CENTER_Z | POINT_COUNT

## Quality Guidelines
- No limits on points or mesh vertices — buffers grow dynamically. Maximize quality.
- Aim for realism. Use many primitives to capture true silhouettes. Apply noise displacement for organic surfaces. Use complex colorFn with noise variation for natural-looking materials.
- For sdfMesh: resolution 64–128. Higher = smoother surfaces.
- For emit() effects: 10k–100k+ points for rich particle effects.
- For grid() terrain: resX/resZ 100–200 for smooth landscapes.

## Image to 3D
Use image_to_3d to convert uploaded images to 3D point clouds via depth estimation. Images in the available images list are pre-validated — always process regardless of format.

## Scene Management
- remove_layer / clear_all_layers — manage procedural layers
- delete_points_in_region / delete_points_in_sphere — destructive point removal from original cloud
- toggle_original_cloud — show/hide original point cloud

## Response Format
Keep text responses brief. Describe what you'll build in 1–2 sentences, then call the tool. For complex requests, outline your step-by-step plan (what each layer will be), then execute one layer at a time.`;

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

interface LayerInfo {
  id: string;
  description?: string;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
  };
  pointCount: number;
  meshVertexCount: number;
}

function formatLayersContext(activeLayers: unknown): string {
  if (!Array.isArray(activeLayers) || activeLayers.length === 0) {
    return "\nNo active procedural layers.";
  }
  const fmt = (n: number) => n.toFixed(2);
  const lines = (activeLayers as LayerInfo[]).map((l) => {
    const label = l.description ? ` (${l.description})` : "";
    const b = l.bounds;
    return `- ${l.id}${label}: bounds min=[${b.min.map(fmt)}] max=[${b.max.map(fmt)}] center=[${b.center.map(fmt)}]`;
  });
  return `\nActive procedural layers:\n${lines.join("\n")}`;
}

export async function handleChatRequest(req: Request): Promise<Response> {
  const { messages, sceneBounds, activeLayers, availableImages } =
    await req.json();

  const provider = req.headers.get("x-provider") ?? "cerebras";
  const apiKey = req.headers.get("x-api-key") ?? "";
  const modelId = req.headers.get("x-model") ?? "llama-3.3-70b";

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "API key required. Set your key in Settings." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

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
      formatLayersContext(activeLayers) +
      imagesList,
    messages: await convertToModelMessages(messages as UIMessage[]),
    tools: {
      load_skills: tool({
        description:
          "Load one or more skill references before generating code. Returns detailed API patterns, formulas, examples, and best practices. Load multiple skills when the task spans domains (e.g. a nature scene with particle effects).",
        inputSchema: z.object({
          skills: z
            .array(
              z.enum([
                "advanced-sdf",
                "natural-world",
                "materials-and-color",
                "objects-and-characters",
                "math-and-patterns",
                "atmosphere-and-fx",
              ]),
            )
            .min(1)
            .describe("The skills to load"),
        }),
        execute: async ({ skills }) => {
          return skills
            .map((s) => SKILLS[s] ?? `Unknown skill: ${s}`)
            .join("\n\n---\n\n");
        },
      }),

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
          "Generate JavaScript code that creates 3D content using the sandbox API (sdfMesh, lathe, box, extrudePath, grid, emit, emitTriangle, emitQuad).",
        inputSchema: z.object({
          code: z
            .string()
            .describe(
              "Raw JavaScript statements (the BODY of a function). Do NOT wrap in function(){...} — the code is already injected as a function body. Just write bare statements like: var ground = grid(...); var trunk = sdfMesh(...); All sandbox API functions (emit, grid, sdfMesh, etc.) are available as local variables.",
            ),
          description: z
            .string()
            .optional()
            .describe(
              "Brief label for this layer (e.g. 'pine tree', 'ground plane'). Used for spatial reference in future turns.",
            ),
        }),
      }),
      remove_layer: tool({
        description:
          "Remove a specific procedural layer from the scene by its ID.",
        inputSchema: z.object({
          layerId: z
            .string()
            .describe(
              "The ID of the layer to remove (e.g. 'layer-0', 'layer-1')",
            ),
        }),
      }),
      clear_all_layers: tool({
        description: "Remove ALL procedural layers from the scene.",
        inputSchema: z.object({}),
      }),
      delete_points_in_region: tool({
        description:
          "Delete points from the ORIGINAL point cloud within a bounding box region. Destructive and cannot be undone.",
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
          "Delete points from the ORIGINAL point cloud within a sphere. Destructive and cannot be undone.",
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
        description: "Show or hide the entire original point cloud.",
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

export default async function handler(req: Request): Promise<Response> {
  return handleChatRequest(req);
}
