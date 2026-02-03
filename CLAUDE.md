# CLAUDE.md

## Project Overview

autoscene is a React + TypeScript + Vite web app for AI-powered 3D scene generation. Users describe scenes via a chat interface, and an LLM generates procedural code that creates shaded mesh geometry rendered in real-time via Three.js WebGL. The app uses SDF (Signed Distance Functions) with marching cubes for organic shapes, plus grid heightfields, lathe, and extrusion for other geometry. Scenes can be exported as glTF (.glb) files.

## Commands

- `npm run dev` — Start Vite dev server (includes `/api/chat` middleware)
- `npm run build` — TypeScript check (`tsc -b`) + Vite production build
- `npm run lint` — Run Biome (`biome check .`) — linting + formatting
- `npm run preview` — Preview production build
- `npx @biomejs/biome check --write .` — Auto-fix all lint + format issues

## Linting & Formatting

**Biome** handles all linting and formatting. Config: `biome.json`.

Key enforced rules:
- **`@/` path alias required** — relative imports (`./`, `../`) are lint errors via `noRestrictedImports`
- **No `any`** — `noExplicitAny` is an error
- **No `var`** — use `const`/`let` (`noVar`, `useConst`)
- **No `ts-ignore`** — use `@ts-expect-error` instead (`noTsIgnore`)
- **No unused variables** — `noUnusedVariables` is an error (also enforced by `tsc`)
- **No CommonJS** — ES modules only (`noCommonJs`)
- **Double quotes**, 2-space indent, space indent style
- **No `namespace`** — `noNamespace` is an error
- **React hooks rules** — `useExhaustiveDependencies` (warn), `useHookAtTopLevel` (error)
- Import organization handled by Biome assist

## Architecture

**App state machine:** `chat` → `viewing` | `error`
- Defined as a discriminated union `AppState` in `App.tsx`
- `chat` phase shows centered chat with prompt input; first message transitions to `viewing`
- `viewing` phase shows 3D viewport with chat sidebar

**AI chat flow:** User message → `POST /api/chat` → LLM streams response → tool call `generate_3d_points` → code AST-validated → executed in Web Worker sandbox → mesh output validated → layer added to Three.js scene

### `src/lib/` — Core logic
- `scene.ts` — Three.js scene setup with OrbitControls, hemisphere + directional lighting, MeshStandardMaterial for layers; exports `SceneHandle` interface for imperative control; `dispose()` cleans up all GPU resources
- `procedural/engine.ts` — Executes user-generated JS in a Web Worker sandbox with 300s timeout; mesh-only output (`emitTriangle()`, `emitQuad()`), no point particles; noise functions, seeded `random()`; buffers grow dynamically. Includes shape primitives: `box`, `extrudePath`, `grid`, `lathe`. SDF system: primitives (`sdSphere`, `sdBox`, `sdCapsule`, `sdTorus`, `sdCone`, `sdPlane`, `sdCylinder`, `sdEllipsoid`, `sdOctahedron`, `sdHexPrism`), operators (`opUnion`, `opSubtract`, `opIntersect`, `opSmoothUnion/Subtract/Intersect`, `opRound`, `opDisplace`, `opXOR`, `opChamfer`, `opStairs`, `opShell`, `opOnion`), domain ops (`domainMirror`, `domainRepeat`, `domainTwist`, `domainBend`), and `sdfMesh()` for marching cubes iso-surface extraction with smooth normals
- `sandbox/validate.ts` — AST validation using `acorn`; blocks dangerous APIs (fetch, eval, Worker, import, etc.); enforces max nesting depth
- `sandbox/outputValidation.ts` — Mesh output validation: vertex count limits (warn 100k, error 500k), NaN/Infinity detection, bounds check, degenerate triangle detection
- `export.ts` — glTF/GLB export using Three.js GLTFExporter; downloads .glb file to user's device

### `src/components/` — UI
- `App.tsx` — Root component with state machine, wraps everything in `JotaiProvider` + `ThemeProvider`
- `CenteredChat.tsx` — Initial chat view with centered prompt input (empty state) or scrollable messages
- `SceneViewer.tsx` — Three.js WebGL viewport with animation loop, FPS tracking, resize handling, WASD keyboard controls
- `ChatSidebar.tsx` — AI chat panel in viewing mode
- `ChatMessageParts.tsx` — Renders chat message parts (text, reasoning, tool calls)
- `SceneOverlay.tsx` — HUD overlay on the 3D scene (FPS counter, controls help, GLB export button, settings)
- `SettingsDialog.tsx` — API key configuration dialog
- `ui/` — shadcn/ui primitives (button, card, dialog, etc.)
- `ai-elements/` — AI SDK UI components from `@ai-elements` registry

### `src/atoms/` — Jotai atoms
- `fps.ts` — FPS counter atom, updated every 500ms from animation loop

### `src/hooks/`
- `useChatManager.ts` — Chat state management via `useChat` from `@ai-sdk/react`; handles tool execution for `generate_3d_points`, `remove_layer`, `clear_all_layers`; manages pending layers and scene bounds

### `src/providers/`
- `ThemeProvider.tsx` — React context for theme (`dark`/`light`/`system`); persists to localStorage key `autoscene-theme`

### `api/` — Serverless API (Vercel functions + Vite SSR in dev)
- `chat.ts` — AI chat handler via AI SDK `streamText`; tools: `load_skills` (server-executed), `generate_3d_points`, `remove_layer`, `clear_all_layers`. System prompt describes SDF-first mesh workflow, coordinate system, and API reference.
- `_skills.ts` — 6 comprehensive knowledge-domain skills (`advanced-sdf`, `natural-world`, `materials-and-color`, `objects-and-characters`, `math-and-patterns`, `atmosphere-and-fx`) loaded by the LLM via `load_skills` tool before generating code

## Environment Variables

- API keys are configured per-provider in the Settings dialog, stored in localStorage (`autoscene-settings`), and sent per-request via headers (`x-api-key`, `x-provider`, `x-model`).

## Tech Stack

- **React 19** + **Vite 7** + **SWC**
- **Tailwind CSS v4** with OKLch colors via `@tailwindcss/vite`
- **shadcn/ui** (base-lyra style) + **@ai-elements** registry — config in `components.json`
- **Biome** — linter/formatter
- **Jotai** — atomic state management
- **AI SDK** (`ai`) + **Cerebras/Groq/OpenAI/Anthropic** — multi-provider LLM chat with tool calling
- **Zod** — schema validation (tool input schemas)
- **Three.js** — WebGL 3D rendering with MeshStandardMaterial
- **acorn** — AST parsing for sandbox code validation
- **Motion** (`motion/react`) — animations
- **TypeScript 5.9** strict mode, target ES2022, `verbatimModuleSyntax`

## Code Style & Patterns

- **Imports:** Always `@/` alias, never relative. Example: `import { Button } from "@/components/ui/button"`
- **Formatting:** Double quotes, 2-space indent (Biome-enforced)
- **Tailwind:** Classes merged via `cn()` from `@/lib/utils` (`clsx` + `tailwind-merge`)
- **Font:** JetBrains Mono Variable (monospace) for everything
- **CSS colors:** OKLch color space via CSS variables (`:root` for light, `.dark` for dark)
- **Tailwind dark mode:** Custom variant `@custom-variant dark (&:is(.dark *))`
- **State:** Jotai atoms for shared state (`useAtomValue`/`useSetAtom`), React `useState` for local
- **Error handling:** Always `err instanceof Error ? err.message : "fallback"` pattern
- **Three.js cleanup:** All scenes use `SceneHandle.dispose()` which cleans up geometry, materials, renderer, controls, and layers
- **Stable callbacks:** Ref-forwarding pattern to avoid effect re-runs: store callback in ref, wrap in empty-deps `useCallback`
- **shadcn components:** Use CVA (`class-variance-authority`) for variants; `data-slot` attributes for styling hooks; `@base-ui/react` primitives underneath. **Always use existing shadcn/ui primitives** (Button, Tabs, Switch, Select, etc.) for UI controls — never use raw HTML `<button>` or `<select>` elements for settings/controls.
- **Graphics code comments** — All geometry generation, shader code, and rendering pipeline code must include inline comments explaining the math and algorithm steps. Graphics code is inherently hard to read; comments are mandatory, not optional.

## Gotchas

- **Relative imports fail lint** — Biome rejects `./` and `../` imports. Always use `@/`.
- **`/api/chat` is Vite middleware in dev** — defined as a Vite plugin in `vite.config.ts`, SSR-loads `api/chat.ts` via `server.ssrLoadModule()`. In production, Vercel serves it as a serverless function from `api/chat.ts`.
- **Procedural code runs in Worker** — 300-second timeout, no hard vertex limits (buffers grow dynamically but output validation warns at 100k, errors at 500k), seeded PRNG (Mulberry32). Worker is created from a blob URL and terminated after each execution.
- **AST validation** — All procedural code is parsed by acorn and checked for dangerous API calls before execution in the worker.
- **Two shadcn registries** — `@shadcn` (default) and `@ai-elements` (AI SDK components). Both in `components.json`.
- **`verbatimModuleSyntax`** — use `import type` for type-only imports; bare type imports cause build errors.
- **Theme localStorage key** is `autoscene-theme`, settings key is `autoscene-settings`.
- **3D coordinate system** — X right, Y up, Z negative into screen. Scene volume: X [-3,3], Y [-1.5,1.5], Z [-1,-6], center ~(0,0,-3). Camera at origin looking down -Z.
- **Mesh-only rendering** — No point cloud or ASCII rendering. All geometry is rendered as `THREE.Mesh` with `MeshStandardMaterial` and vertex colors.
