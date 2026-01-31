import { Provider as JotaiProvider } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import { AsciiViewer } from "@/components/AsciiViewer";
import { CenteredChat } from "@/components/CenteredChat";
import { ChatSidebar } from "@/components/ChatSidebar";
import { LoadingState } from "@/components/LoadingState";
import { SceneOverlay } from "@/components/SceneOverlay";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useChatManager } from "@/hooks/useChatManager";
import { estimateDepth, loadDepthModel } from "@/lib/depth";
import { storeImage } from "@/lib/imageStore";
import { buildPointCloud, type PointCloud } from "@/lib/pointcloud";
import { computeSceneBounds } from "@/lib/procedural/engine";
import type { SceneHandle } from "@/lib/scene";
import { ThemeProvider } from "@/providers/ThemeProvider";

type AppState =
  | { phase: "chat" }
  | { phase: "loading"; message: string; progress?: number }
  | { phase: "viewing"; pointCloud: PointCloud | null }
  | { phase: "error"; message: string };

export default function App() {
  const [state, setState] = useState<AppState>({ phase: "chat" });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sceneHandleRef = useRef<SceneHandle | null>(null);

  const sceneBounds = useMemo(() => {
    if (state.phase !== "viewing" || !state.pointCloud) {
      return {
        min: [-2, -2, -6] as [number, number, number],
        max: [2, 2, -1] as [number, number, number],
        center: [0, 0, -3] as [number, number, number],
        pointCount: 0,
      };
    }
    return computeSceneBounds(
      state.pointCloud.positions,
      state.pointCloud.count,
    );
  }, [state]);

  const boundsRef = useRef(sceneBounds);
  boundsRef.current = sceneBounds;

  const handleTransitionToViewing = useCallback(() => {
    setState((prev) => {
      if (prev.phase === "viewing") return prev;
      return { phase: "viewing", pointCloud: null };
    });
  }, []);

  const chat = useChatManager(sceneHandleRef, boundsRef, {
    onTransitionToViewing: handleTransitionToViewing,
  });

  const handleSceneReady = useCallback(
    (handle: SceneHandle | null) => {
      sceneHandleRef.current = handle;
      if (handle) {
        chat.flushPendingLayers(handle);
      }
    },
    [chat],
  );

  const handleFirstMessage = useCallback(() => {
    setState({ phase: "viewing", pointCloud: null });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    try {
      setState({
        phase: "loading",
        message: "Loading depth model...",
        progress: 0,
      });

      await loadDepthModel((p) => {
        setState({
          phase: "loading",
          message: "Loading depth model...",
          progress: p,
        });
      });

      setState({ phase: "loading", message: "Estimating depth..." });

      const imageId = await storeImage(file);
      const { getImage } = await import("@/lib/imageStore");
      const entry = getImage(imageId)!;

      const depth = await estimateDepth(entry.image);

      setState({ phase: "loading", message: "Building point cloud..." });

      const pointCloud = buildPointCloud(depth, entry.imageData, 2);

      setState({ phase: "viewing", pointCloud });
    } catch (err) {
      console.error(err);
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  }, []);

  return (
    <JotaiProvider>
      <ThemeProvider defaultTheme="dark" storageKey="autoscene-theme">
        <div className="flex flex-col h-screen w-screen overflow-hidden">
          {state.phase === "chat" ? (
            <CenteredChat chat={chat} onFirstMessage={handleFirstMessage} />
          ) : state.phase === "viewing" ? (
            <main className="flex-1 flex flex-row overflow-hidden">
              <div className="flex-1 relative">
                <AsciiViewer
                  pointCloud={state.pointCloud}
                  overlay={
                    <SceneOverlay
                      onNewImage={handleFile}
                      sidebarOpen={sidebarOpen}
                      onToggleSidebar={() => setSidebarOpen((v) => !v)}
                    />
                  }
                  onSceneReady={handleSceneReady}
                />
              </div>
              <ChatSidebar chat={chat} open={sidebarOpen} />
            </main>
          ) : (
            <>
              <header className="flex items-center justify-between px-4 py-3">
                <span className="text-xs tracking-[0.1em] text-muted-foreground">
                  Autoscene
                </span>
              </header>
              <main className="flex-1 flex items-center justify-center">
                {state.phase === "loading" && (
                  <LoadingState
                    message={state.message}
                    progress={state.progress}
                  />
                )}
                {state.phase === "error" && (
                  <div className="flex flex-col items-center gap-4">
                    <Alert variant="destructive" className="max-w-md">
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{state.message}</AlertDescription>
                    </Alert>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setState({ phase: "chat" })}
                    >
                      Try again
                    </Button>
                  </div>
                )}
              </main>
            </>
          )}
        </div>
      </ThemeProvider>
    </JotaiProvider>
  );
}
