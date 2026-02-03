import { Provider as JotaiProvider } from "jotai";
import { useCallback, useRef, useState } from "react";
import { CenteredChat } from "@/components/CenteredChat";
import { ChatSidebar } from "@/components/ChatSidebar";
import { SceneOverlay } from "@/components/SceneOverlay";
import { SceneViewer } from "@/components/SceneViewer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useChatManager } from "@/hooks/useChatManager";
import { exportSceneAsGLB } from "@/lib/export";
import type { SceneBounds } from "@/lib/procedural/engine";
import type { SceneHandle } from "@/lib/scene";
import { ThemeProvider } from "@/providers/ThemeProvider";

type AppState =
  | { phase: "chat" }
  | { phase: "viewing" }
  | { phase: "error"; message: string };

const DEFAULT_BOUNDS: SceneBounds = {
  min: [-2, -2, -6],
  max: [2, 2, -1],
  center: [0, 0, -3],
};

export default function App() {
  const [state, setState] = useState<AppState>({ phase: "chat" });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sceneHandleRef = useRef<SceneHandle | null>(null);
  const boundsRef = useRef(DEFAULT_BOUNDS);

  const handleTransitionToViewing = useCallback(() => {
    setState((prev) => {
      if (prev.phase === "viewing") return prev;
      return { phase: "viewing" };
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
    setState({ phase: "viewing" });
  }, []);

  const handleExportGLB = useCallback(() => {
    const handle = sceneHandleRef.current;
    if (handle) {
      exportSceneAsGLB(handle.scene);
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
                <SceneViewer
                  overlay={
                    <SceneOverlay
                      sidebarOpen={sidebarOpen}
                      onToggleSidebar={() => setSidebarOpen((v) => !v)}
                      onExportGLB={handleExportGLB}
                    />
                  }
                  onSceneReady={handleSceneReady}
                />
              </div>
              <ChatSidebar chat={chat} open={sidebarOpen} />
            </main>
          ) : (
            <main className="flex-1 flex items-center justify-center">
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
            </main>
          )}
        </div>
      </ThemeProvider>
    </JotaiProvider>
  );
}
