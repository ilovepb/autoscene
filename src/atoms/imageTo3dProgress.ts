import { atom } from "jotai";

export type ImageTo3dStep =
  | { status: "idle" }
  | { status: "loading-model"; progress: number }
  | { status: "estimating-depth" }
  | { status: "building-cloud" };

export const imageTo3dProgressAtom = atom<ImageTo3dStep>({ status: "idle" });
