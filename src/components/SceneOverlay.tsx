import { useAtomValue } from "jotai";
import {
  ArrowUp,
  ImageUp,
  Keyboard,
  Mouse,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fpsAtom } from "@/atoms/fps";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  onNewImage: (file: File) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
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
  onNewImage,
  sidebarOpen,
  onToggleSidebar,
}: Props) {
  const [showControls, setShowControls] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onNewImage(file);
      e.target.value = "";
    },
    [onNewImage],
  );

  // Auto-dismiss controls panel after 8 seconds
  useEffect(() => {
    if (!showControls) return;
    const t = setTimeout(() => setShowControls(false), 8000);
    return () => clearTimeout(t);
  }, [showControls]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {/* ── Top bar: title + actions ─────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 pointer-events-none">
        <div className="flex items-center gap-3">
          <span className="text-xs tracking-[0.1em] text-foreground/30">
            Autoscene
          </span>
          <FpsCounter />
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/5 backdrop-blur-sm gap-1.5"
            onClick={() => inputRef.current?.click()}
          >
            <ImageUp className="size-3.5" />
            New image
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/5 backdrop-blur-sm"
            onClick={() => setShowControls((v) => !v)}
            aria-label="Toggle controls help"
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
            aria-label={sidebarOpen ? "Close chat" : "Open chat"}
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
              Controls
            </div>
            <ControlRow
              label="Walk"
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
              label="Walk"
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
              label="Orbit"
              icon={<Mouse className="size-3 text-foreground/40" />}
              keys={
                <span className="text-foreground/40 text-[10px]">drag</span>
              }
            />
            <ControlRow
              label="Zoom"
              icon={<Mouse className="size-3 text-foreground/40" />}
              keys={
                <span className="text-foreground/40 text-[10px]">scroll</span>
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}
