import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useSetAtom } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import { imageTo3dProgressAtom } from "@/atoms/imageTo3dProgress";
import { estimateDepth, loadDepthModel } from "@/lib/depth";
import { getAllImages, getImage, storeImage } from "@/lib/imageStore";
import { buildPointCloud } from "@/lib/pointcloud";
import {
  executeProceduralCode,
  type GeneratedLayer,
  type SceneBounds,
} from "@/lib/procedural/engine";
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

export interface ChatManagerOptions {
  onTransitionToViewing: () => void;
}

export function useChatManager(
  sceneHandleRef: React.RefObject<SceneHandle | null>,
  boundsRef: React.RefObject<SceneBounds>,
  options: ChatManagerOptions,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const pendingLayersRef = useRef<GeneratedLayer[]>([]);
  /** Persistent store of all active layers — survives scene disposal/recreation. */
  const activeLayersRef = useRef<Map<string, GeneratedLayer>>(new Map());
  const setImageTo3dProgress = useSetAtom(imageTo3dProgressAtom);

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
        body: () => {
          const images = getAllImages().map((e) => ({
            id: e.id,
            filename: e.filename,
          }));
          return {
            sceneBounds: boundsRef.current,
            activeLayers: sceneHandleRef.current?.getLayerIds() ?? [],
            availableImages: images,
          };
        },
        headers: () => buildRequestHeaders(loadSettings()),
      }),
    [sceneHandleRef, boundsRef],
  );

  const { messages, sendMessage, addToolOutput, status } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName === "generate_3d_points") {
        const input = toolCall.input as { code: string };
        try {
          const layer: GeneratedLayer = await executeProceduralCode(
            input.code,
            boundsRef.current,
          );
          activeLayersRef.current.set(layer.id, layer);
          const handle = sceneHandleRef.current;
          if (handle) {
            handle.addLayer(layer);
          } else {
            pendingLayersRef.current.push(layer);
            optionsRef.current.onTransitionToViewing();
          }
          addToolOutput({
            tool: "generate_3d_points",
            toolCallId: toolCall.toolCallId,
            output: `Generated ${layer.count} points (layer: ${layer.id})`,
          });
        } catch (err) {
          addToolOutput({
            tool: "generate_3d_points",
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : "Execution failed",
          });
        }
      } else if (toolCall.toolName === "image_to_3d") {
        const input = toolCall.input as { imageId: string };
        const entry = getImage(input.imageId);
        if (!entry) {
          addToolOutput({
            tool: "image_to_3d",
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: `Image "${input.imageId}" not found. Available images: ${
              getAllImages()
                .map((e) => `${e.filename} (${e.id})`)
                .join(", ") || "none"
            }`,
          });
          return;
        }
        try {
          setImageTo3dProgress({ status: "loading-model", progress: 0 });
          await loadDepthModel((p) => {
            setImageTo3dProgress({ status: "loading-model", progress: p });
          });

          setImageTo3dProgress({ status: "estimating-depth" });
          const depth = await estimateDepth(entry.image);

          setImageTo3dProgress({ status: "building-cloud" });
          const pointCloud = buildPointCloud(depth, entry.imageData, 2);
          const defaultSizes = new Float32Array(pointCloud.count);
          defaultSizes.fill(0.035);
          const layer: GeneratedLayer = {
            id: `img-${entry.id.slice(0, 8)}`,
            positions: pointCloud.positions,
            colors: pointCloud.colors,
            sizes: defaultSizes,
            count: pointCloud.count,
          };
          activeLayersRef.current.set(layer.id, layer);
          const handle = sceneHandleRef.current;
          if (handle) {
            handle.addLayer(layer);
          } else {
            pendingLayersRef.current.push(layer);
            optionsRef.current.onTransitionToViewing();
          }
          addToolOutput({
            tool: "image_to_3d",
            toolCallId: toolCall.toolCallId,
            output: `Converted "${entry.filename}" to 3D: ${pointCloud.count} points (layer: ${layer.id})`,
          });
        } catch (err) {
          addToolOutput({
            tool: "image_to_3d",
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText:
              err instanceof Error ? err.message : "Depth estimation failed",
          });
        } finally {
          setImageTo3dProgress({ status: "idle" });
        }
      } else if (toolCall.toolName === "remove_layer") {
        const input = toolCall.input as { layerId: string };
        const handle = sceneHandleRef.current;
        if (handle) {
          const exists = handle.getLayerIds().includes(input.layerId);
          if (exists) {
            handle.removeLayer(input.layerId);
            activeLayersRef.current.delete(input.layerId);
            addToolOutput({
              tool: "remove_layer",
              toolCallId: toolCall.toolCallId,
              output: `Removed layer: ${input.layerId}`,
            });
          } else {
            addToolOutput({
              tool: "remove_layer",
              toolCallId: toolCall.toolCallId,
              state: "output-error",
              errorText: `Layer "${input.layerId}" not found. Active layers: ${handle.getLayerIds().join(", ") || "none"}`,
            });
          }
        }
      } else if (toolCall.toolName === "clear_all_layers") {
        const handle = sceneHandleRef.current;
        if (handle) {
          const count = handle.getLayerIds().length;
          handle.clearLayers();
          activeLayersRef.current.clear();
          addToolOutput({
            tool: "clear_all_layers",
            toolCallId: toolCall.toolCallId,
            output: `Cleared ${count} layer(s) from the scene`,
          });
        }
      } else if (toolCall.toolName === "delete_points_in_region") {
        const input = toolCall.input as {
          minX: number;
          maxX: number;
          minY: number;
          maxY: number;
          minZ: number;
          maxZ: number;
        };
        const handle = sceneHandleRef.current;
        if (handle) {
          const deleted = handle.deletePointsInRegion(input);
          addToolOutput({
            tool: "delete_points_in_region",
            toolCallId: toolCall.toolCallId,
            output: `Deleted ${deleted} points from the original point cloud`,
          });
        }
      } else if (toolCall.toolName === "delete_points_in_sphere") {
        const input = toolCall.input as {
          x: number;
          y: number;
          z: number;
          radius: number;
        };
        const handle = sceneHandleRef.current;
        if (handle) {
          const deleted = handle.deletePointsInSphere(
            { x: input.x, y: input.y, z: input.z },
            input.radius,
          );
          addToolOutput({
            tool: "delete_points_in_sphere",
            toolCallId: toolCall.toolCallId,
            output: `Deleted ${deleted} points from the original point cloud`,
          });
        }
      } else if (toolCall.toolName === "toggle_original_cloud") {
        const input = toolCall.input as { visible: boolean };
        const handle = sceneHandleRef.current;
        if (handle) {
          handle.setOriginalCloudVisible(input.visible);
          addToolOutput({
            tool: "toggle_original_cloud",
            toolCallId: toolCall.toolCallId,
            output: `Original point cloud is now ${input.visible ? "visible" : "hidden"}`,
          });
        }
      }
    },
  });

  const handleSubmit = useCallback(
    async ({
      text,
      files,
    }: {
      text: string;
      files?: { url: string; mediaType: string; filename?: string }[];
    }) => {
      if (!text.trim() && (!files || files.length === 0)) return;

      let augmentedText = text;

      if (files && files.length > 0) {
        for (const file of files) {
          try {
            const response = await fetch(file.url);
            const blob = await response.blob();
            const fileObj = new File([blob], file.filename ?? "image", {
              type: file.mediaType,
            });
            const imageId = await storeImage(fileObj);
            augmentedText += `\n[Image uploaded: "${file.filename ?? "image"}" (id: ${imageId})]`;
          } catch {
            augmentedText += `\n[Failed to process attachment: "${file.filename ?? "image"}"]`;
          }
        }
      }

      sendMessage({ text: augmentedText });
    },
    [sendMessage],
  );

  const flushPendingLayers = useCallback((handle: SceneHandle) => {
    // First, flush any layers that arrived before the scene existed
    for (const layer of pendingLayersRef.current) {
      activeLayersRef.current.set(layer.id, layer);
    }
    pendingLayersRef.current = [];
    // Replay all active layers into the (potentially new) scene
    for (const layer of activeLayersRef.current.values()) {
      handle.addLayer(layer);
    }
  }, []);

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
