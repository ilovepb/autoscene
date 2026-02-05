import { useAtomValue, useSetAtom } from "jotai";
import {
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  Keyboard,
  Layers,
  Mouse,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { fpsAtom } from "@/atoms/fps";
import { layersAtom } from "@/atoms/layers";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onExportGLB?: () => void;
  onToggleLayerVisibility?: (id: string, visible: boolean) => void;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.4rem] h-[1.4rem] px-1 border border-foreground/20 bg-foreground/5 text-[10px] text-foreground/70 leading-none">
      {children}
    </kbd>
  );
}

function ControlRow({
  label,
  keys,
  icon,
}: {
  label: string;
  keys?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-foreground/50 text-[10px] tracking-[0.05em]">
        {label}
      </span>
      <div className="flex items-center gap-1">
        {icon}
        {keys}
      </div>
    </div>
  );
}

function FpsCounter() {
  const fps = useAtomValue(fpsAtom);
  return (
    <span className="text-[10px] tabular-nums text-foreground/25">
      {fps} fps
    </span>
  );
}

export function SceneOverlay({
  sidebarOpen,
  onToggleSidebar,
  onExportGLB,
  onToggleLayerVisibility,
}: Props) {
  const [showControls, setShowControls] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const layers = useAtomValue(layersAtom);
  const setLayers = useSetAtom(layersAtom);

  // Auto-dismiss controls panel after 8 seconds
  useEffect(() => {
    if (!showControls) return;
    const t = setTimeout(() => setShowControls(false), 8000);
    return () => clearTimeout(t);
  }, [showControls]);

  return (
    <>
      {/* ── Top bar: title + actions ─────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 pointer-events-none">
        <div className="flex items-center gap-3">
          <span className="text-xs tracking-[0.1em] text-foreground/30">
            autoscene
          </span>
          <FpsCounter />
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5">
          {onExportGLB && (
            <Button
              variant="ghost"
              size="sm"
              className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/5 backdrop-blur-sm gap-1.5"
              onClick={onExportGLB}
            >
              <Download className="size-3.5" />
              export glb
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/5 backdrop-blur-sm"
            onClick={() => setShowControls((v) => !v)}
            aria-label="toggle controls help"
          >
            {showControls ? (
              <X className="size-3.5" />
            ) : (
              <Keyboard className="size-3.5" />
            )}
          </Button>
          <SettingsDialog />
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/5 backdrop-blur-sm"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "close chat" : "open chat"}
          >
            {sidebarOpen ? (
              <PanelRightClose className="size-3.5" />
            ) : (
              <PanelRightOpen className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* ── Controls panel (drops down from top-right) ────────────── */}
      <div className="absolute top-12 right-4 z-20">
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-out",
            showControls
              ? "opacity-100 translate-y-0 max-h-60"
              : "opacity-0 -translate-y-2 max-h-0 pointer-events-none",
          )}
        >
          <div className="border border-foreground/10 bg-background/60 backdrop-blur-md px-4 py-3 space-y-2 min-w-[200px]">
            <div className="text-[9px] tracking-[0.1em] text-foreground/30 mb-2">
              controls
            </div>
            <ControlRow
              label="walk"
              keys={
                <>
                  <Kbd>W</Kbd>
                  <Kbd>A</Kbd>
                  <Kbd>S</Kbd>
                  <Kbd>D</Kbd>
                </>
              }
            />
            <ControlRow
              label="walk"
              keys={
                <div className="flex items-center gap-1">
                  <Kbd>
                    <ArrowUp className="size-2.5" />
                  </Kbd>
                  <span className="text-foreground/20 text-[9px]">arrows</span>
                </div>
              }
            />
            <ControlRow
              label="orbit"
              icon={<Mouse className="size-3 text-foreground/40" />}
              keys={
                <span className="text-foreground/40 text-[10px]">drag</span>
              }
            />
            <ControlRow
              label="zoom"
              icon={<Mouse className="size-3 text-foreground/40" />}
              keys={
                <span className="text-foreground/40 text-[10px]">scroll</span>
              }
            />
          </div>
        </div>
      </div>

      {/* ── Layer panel (top-left, below title) ────────────────────── */}
      {layers.length > 0 && (
        <div className="absolute top-12 left-4 z-20 pointer-events-auto">
          <Button
            variant="ghost"
            size="sm"
            className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/5 backdrop-blur-sm gap-1.5 mb-1"
            onClick={() => setShowLayers((v) => !v)}
          >
            <Layers className="size-3.5" />
            layers ({layers.length})
          </Button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-out",
              showLayers
                ? "opacity-100 translate-y-0 max-h-80"
                : "opacity-0 -translate-y-2 max-h-0 pointer-events-none",
            )}
          >
            <div className="border border-foreground/10 bg-background/60 backdrop-blur-md px-3 py-2 space-y-1 min-w-[200px] max-w-[280px]">
              <div className="text-[9px] tracking-[0.1em] text-foreground/30 mb-1.5">
                layers
              </div>
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-[10px] text-foreground/50 truncate flex-1">
                    {layer.description || layer.id}
                  </span>
                  <span className="text-[9px] tabular-nums text-foreground/25 shrink-0">
                    {layer.vertexCount >= 1000
                      ? `${Math.round(layer.vertexCount / 1000)}k`
                      : layer.vertexCount}{" "}
                    verts
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/5 size-5"
                    onClick={() => {
                      const newVisible = !layer.visible;
                      setLayers((prev) =>
                        prev.map((l) =>
                          l.id === layer.id ? { ...l, visible: newVisible } : l,
                        ),
                      );
                      onToggleLayerVisibility?.(layer.id, newVisible);
                    }}
                    aria-label={layer.visible ? "hide layer" : "show layer"}
                  >
                    {layer.visible ? (
                      <Eye className="size-3" />
                    ) : (
                      <EyeOff className="size-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
