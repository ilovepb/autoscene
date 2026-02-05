import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useSetAtom } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import { layersAtom } from "@/atoms/layers";
import {
  computeLayerBounds,
  executeProceduralCode,
  type GeneratedLayer,
  type LayerMeta,
  type SceneBounds,
} from "@/lib/procedural/engine";
import {
  analyzeSpatialRelationships,
  formatSpatialAnalysis,
} from "@/lib/procedural/spatial";
import { validateMeshOutput } from "@/lib/sandbox/outputValidation";
import type { SceneHandle } from "@/lib/scene";
import {
  type AIProvider,
  ALL_PROVIDERS,
  BUILTIN_MODELS,
  buildRequestHeaders,
  getAvailableModels,
  loadSettings,
  PROVIDER_META,
  parseModelKey,
  saveSettings,
} from "@/lib/settings";

function formatLayerOutput(layer: GeneratedLayer, meta: LayerMeta): string {
  const triangles = Math.floor(layer.meshVertexCount / 3);
  const b = meta.bounds;
  const fmt = (n: number) => n.toFixed(2);
  const size: [number, number, number] = [
    b.max[0] - b.min[0],
    b.max[1] - b.min[1],
    b.max[2] - b.min[2],
  ];
  const topCenter: [number, number, number] = [
    b.center[0],
    b.max[1],
    b.center[2],
  ];
  const bottomCenter: [number, number, number] = [
    b.center[0],
    b.min[1],
    b.center[2],
  ];
  return [
    `generated ${triangles} triangles (layer: ${layer.id})`,
    `  bounds: min=[${b.min.map(fmt)}] max=[${b.max.map(fmt)}]`,
    `  center: [${b.center.map(fmt)}]`,
    `  top-center: [${topCenter.map(fmt)}]  bottom-center: [${bottomCenter.map(fmt)}]`,
    `  size: [${size.map(fmt)}]`,
    `  use LAYERS["${layer.id}"] in subsequent code to reference these bounds`,
  ].join("\n");
}

export interface ChatManagerOptions {
  onTransitionToViewing: () => void;
}

export function useChatManager(
  sceneHandleRef: React.RefObject<SceneHandle | null>,
  boundsRef: React.RefObject<SceneBounds>,
  options: ChatManagerOptions,
) {
  const setLayers = useSetAtom(layersAtom);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const pendingLayersRef = useRef<GeneratedLayer[]>([]);
  /** Persistent store of all active layers — survives scene disposal/recreation. */
  const activeLayersRef = useRef<Map<string, GeneratedLayer>>(new Map());
  /** Per-layer spatial metadata sent to the LLM for positioning awareness. */
  const layerMetaRef = useRef<Map<string, LayerMeta>>(new Map());

  const [selectedModel, setSelectedModel] = useState(
    () => loadSettings().selectedModel,
  );
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  const handleModelChange = useCallback((value: string) => {
    setSelectedModel(value);
    const s = loadSettings();
    saveSettings({ ...s, selectedModel: value });
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          sceneBounds: boundsRef.current,
          activeLayers: Array.from(layerMetaRef.current.values()),
        }),
        headers: () => buildRequestHeaders(loadSettings()),
      }),
    [boundsRef],
  );

  const { messages, sendMessage, addToolOutput, status } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName === "generate_3d_points") {
        const input = toolCall.input as {
          code: string;
          description?: string;
        };
        try {
          const layer: GeneratedLayer = await executeProceduralCode(
            input.code,
            boundsRef.current,
            undefined,
            Array.from(layerMetaRef.current.values()),
          );
          activeLayersRef.current.set(layer.id, layer);
          const meta: LayerMeta = {
            ...computeLayerBounds(layer),
            description: input.description ?? "",
          };
          // Analyze spatial relationships BEFORE adding to the map
          // so the new layer isn't compared against itself
          const spatial = analyzeSpatialRelationships(
            meta,
            Array.from(layerMetaRef.current.values()),
          );
          layerMetaRef.current.set(layer.id, meta);
          const handle = sceneHandleRef.current;
          if (handle) {
            handle.addLayer(layer);
          } else {
            pendingLayersRef.current.push(layer);
            optionsRef.current.onTransitionToViewing();
          }
          setLayers((prev) => [
            ...prev,
            {
              id: layer.id,
              description: input.description ?? "",
              vertexCount: layer.meshVertexCount,
              visible: true,
            },
          ]);
          // Check for mesh quality warnings and include them in tool output
          const meshVal = validateMeshOutput(layer);
          let output = formatLayerOutput(layer, meta);
          if (spatial) {
            output += formatSpatialAnalysis(spatial);
          }
          if (meshVal.warnings.length > 0) {
            output += `\n\nwarnings:\n${meshVal.warnings.map((w) => `- ${w}`).join("\n")}`;
          }
          addToolOutput({
            tool: "generate_3d_points",
            toolCallId: toolCall.toolCallId,
            output,
          });
        } catch (err) {
          addToolOutput({
            tool: "generate_3d_points",
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : "execution failed",
          });
        }
      } else if (toolCall.toolName === "remove_layer") {
        const input = toolCall.input as { layerId: string };
        const handle = sceneHandleRef.current;
        if (handle) {
          const exists = handle.getLayerIds().includes(input.layerId);
          if (exists) {
            handle.removeLayer(input.layerId);
            activeLayersRef.current.delete(input.layerId);
            layerMetaRef.current.delete(input.layerId);
            setLayers((prev) => prev.filter((l) => l.id !== input.layerId));
            addToolOutput({
              tool: "remove_layer",
              toolCallId: toolCall.toolCallId,
              output: `removed layer: ${input.layerId}`,
            });
          } else {
            addToolOutput({
              tool: "remove_layer",
              toolCallId: toolCall.toolCallId,
              state: "output-error",
              errorText: `layer "${input.layerId}" not found. active layers: ${handle.getLayerIds().join(", ") || "none"}`,
            });
          }
        }
      } else if (toolCall.toolName === "clear_all_layers") {
        const handle = sceneHandleRef.current;
        if (handle) {
          const count = handle.getLayerIds().length;
          handle.clearLayers();
          activeLayersRef.current.clear();
          layerMetaRef.current.clear();
          setLayers([]);
          addToolOutput({
            tool: "clear_all_layers",
            toolCallId: toolCall.toolCallId,
            output: `cleared ${count} layer(s) from the scene`,
          });
        }
      }
    },
  });

  const handleSubmit = useCallback(
    async ({ text }: { text: string }) => {
      if (!text.trim()) return;
      sendMessage({ text });
    },
    [sendMessage],
  );

  const flushPendingLayers = useCallback(
    (handle: SceneHandle) => {
      // First, flush any layers that arrived before the scene existed
      for (const layer of pendingLayersRef.current) {
        activeLayersRef.current.set(layer.id, layer);
      }
      pendingLayersRef.current = [];
      // Replay all active layers into the (potentially new) scene
      for (const layer of activeLayersRef.current.values()) {
        handle.addLayer(layer);
      }
      // Rebuild the layers atom from current state
      setLayers(
        Array.from(activeLayersRef.current.entries()).map(([id, layer]) => ({
          id,
          description: layerMetaRef.current.get(id)?.description ?? "",
          vertexCount: layer.meshVertexCount,
          visible: true,
        })),
      );
    },
    [setLayers],
  );

  return {
    messages,
    sendMessage: handleSubmit,
    status,
    addToolOutput,
    selectedModel,
    setSelectedModel: handleModelChange,
    modelSelectorOpen,
    setModelSelectorOpen,
    flushPendingLayers,
    // Expose these for the model selector UI
    parseModelKey,
    getAvailableModels,
    loadSettings,
    ALL_PROVIDERS,
    BUILTIN_MODELS,
    PROVIDER_META,
  } as const;
}

export type ChatManager = ReturnType<typeof useChatManager>;

export type { AIProvider };
