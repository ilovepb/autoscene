import { atomWithStorage } from "jotai/utils";

export type RenderMode = "ascii" | "webgl";

export const renderModeAtom = atomWithStorage<RenderMode>(
  "autoscene-render-mode",
  "ascii",
);
