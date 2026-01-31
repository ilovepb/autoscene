# CLAUDE.md

## Project Overview

autoscene is a React + TypeScript + Vite web app that converts 2D images into interactive 3D ASCII art with an AI chat sidebar for procedural scene generation. It uses browser-based depth estimation (Transformers.js) to create depth maps, backprojects them into 3D point clouds via Three.js, and renders output as real-time ASCII art at 60fps.

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

**App state machine:** `upload` → `loading` → `viewing` | `error`
- Defined as a discriminated union `AppState` in `App.tsx`
- Phase transitions happen via `setState` in `handleFile` callback

**Data flow:** Image → depth estimation (WebGPU/WASM) → point cloud → Three.js WebGL → ASCII pixel conversion → `<pre>` display

**AI chat flow:** User message → `POST /api/chat` → Cerebras LLM streams response → tool call `generate_3d_points` → code executed in Web Worker sandbox → points added as layer to Three.js scene

### `src/lib/` — Core logic
- `depth.ts` — Loads `depth-anything-v2-small` ONNX model via `@huggingface/transformers`, runs monocular depth estimation
- `pointcloud.ts` — Backprojects depth map to 3D positions using pinhole camera model (~60° FOV)
- `scene.ts` — Three.js scene setup with OrbitControls; exports `SceneHandle` interface for imperative control; `dispose()` cleans up all GPU resources
- `ascii.ts` — Reads WebGL framebuffer at 160x90, maps luminance to ASCII character ramp
- `procedural/engine.ts` — Executes user-generated JS in a Web Worker sandbox with 5s timeout; supports `emit()`, `noise2D()`, `noise3D()`, seeded `random()`; max 100k points per layer

### `src/components/` — UI
- `App.tsx` — Root component with state machine, wraps everything in `JotaiProvider` + `ThemeProvider`
- `UploadZone.tsx` — File upload drag-and-drop UI
- `AsciiViewer.tsx` — Three.js scene with hidden WebGL canvas + ASCII `<pre>` output; manages animation loop via `requestAnimationFrame`
- `ChatSidebar.tsx` — AI chat panel using `useChat` from `@ai-sdk/react`; handles tool execution for `generate_3d_points`
- `LoadingState.tsx` — Progress indicator during model loading/inference
- `ModeToggle.tsx` — Light/dark/system theme toggle
- `SceneOverlay.tsx` — HUD overlay on the 3D scene (FPS counter, controls)
- `ui/` — shadcn/ui primitives (button, card, dialog, etc.)
- `ai-elements/` — AI SDK UI components from `@ai-elements` registry

### `src/atoms/` — Jotai atoms
- `fps.ts` — FPS counter atom, updated every 500ms from animation loop

### `src/providers/`
- `ThemeProvider.tsx` — React context for theme (`dark`/`light`/`system`); persists to localStorage key `autoscene-theme`

### `src/server/` — Server-side (Vite SSR-loaded)
- `chat.ts` — AI chat handler: Cerebras `llama-4-scout-17b-16e-instruct` via AI SDK `streamText`; single tool `generate_3d_points` with Zod schema

## Environment Variables

- `CEREBRAS_API_KEY` — Required for AI chat. Also overridable per-request via `x-api-key` header (stored client-side in localStorage `autoscene-api-key`)

## Tech Stack

- **React 19** + **Vite 7** + **SWC**
- **Tailwind CSS v4** with OKLch colors via `@tailwindcss/vite`
- **shadcn/ui** (base-lyra style) + **@ai-elements** registry — config in `components.json`
- **Biome** — linter/formatter
- **Jotai** — atomic state management
- **AI SDK** (`ai`) + **Cerebras** (`@ai-sdk/cerebras`) — LLM chat with tool calling
- **Zod** — schema validation (tool input schemas)
- **Three.js** — WebGL 3D rendering
- **@huggingface/transformers** — browser-side ONNX depth estimation
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
- **shadcn components:** Use CVA (`class-variance-authority`) for variants; `data-slot` attributes for styling hooks; `@base-ui/react` primitives underneath

## Gotchas

- **Relative imports fail lint** — Biome rejects `./` and `../` imports. Always use `@/`.
- **`/api/chat` is Vite middleware** — defined as a Vite plugin in `vite.config.ts`, not a standalone server. It SSR-loads `@/server/chat` via `server.ssrLoadModule()`.
- **Hidden WebGL canvas** — the Three.js renderer canvas is appended to `document.body` with `display:none`; pixel data is read via `gl.readPixels()` each frame and converted to ASCII.
- **Procedural code runs in Worker** — 5-second timeout, max 100k points, seeded PRNG (Mulberry32). Worker is created from a blob URL and terminated after each execution.
- **Two shadcn registries** — `@shadcn` (default) and `@ai-elements` (AI SDK components). Both in `components.json`.
- **`verbatimModuleSyntax`** — use `import type` for type-only imports; bare type imports cause build errors.
- **Theme localStorage key** is `autoscene-theme`, API key is `autoscene-api-key`.
- **3D coordinate system** — X right, Y up, Z negative into screen. Point cloud lives at Z=-1 to Z=-6, center ~(0,0,-3). Camera at origin looking down -Z.
