import { atom } from "jotai";

export interface LayerInfo {
  id: string;
  description: string;
  vertexCount: number;
  visible: boolean;
}

export const layersAtom = atom<LayerInfo[]>([]);
