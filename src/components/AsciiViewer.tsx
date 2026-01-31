import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { fpsAtom } from "@/atoms/fps";
import { renderModeAtom } from "@/atoms/renderMode";
import { CHAR_RAMP, readAsciiFrame } from "@/lib/ascii";
import type { PointCloud } from "@/lib/pointcloud";
import { createScene, type SceneHandle } from "@/lib/scene";

interface Props {
  pointCloud: PointCloud | null;
  overlay?: React.ReactNode;
  onSceneReady?: (handle: SceneHandle | null) => void;
}

const FONT_SIZE = 6;
const FONT = `${FONT_SIZE}px "JetBrains Mono", monospace`;
const MIN_COLS = 40;
const MIN_ROWS = 20;

/** Measure the width of a single character in the monospace font. */
function measureCharWidth(): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = FONT;
  return ctx.measureText("@").width;
}

/** Compute the ASCII grid dimensions that fit within a container. */
function computeGridDims(
  container: HTMLElement,
  charW: number,
  charH: number,
): { cols: number; rows: number } {
  const cols = Math.max(Math.floor(container.clientWidth / charW), MIN_COLS);
  const rows = Math.max(Math.floor(container.clientHeight / charH), MIN_ROWS);
  return { cols, rows };
}

export function AsciiViewer({ pointCloud, overlay, onSceneReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const setFps = useSetAtom(fpsAtom);
  const renderMode = useAtomValue(renderModeAtom);

  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;

  const fireSceneReady = useCallback(
    (handle: SceneHandle | null) => onSceneReadyRef.current?.(handle),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (renderMode === "webgl") {
      // ----- WebGL mode -----
      canvas.style.display = "none";

      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(container.clientWidth * dpr);
      const h = Math.round(container.clientHeight * dpr);

      const handle = createScene(pointCloud, w, h, container, {
        antialias: true,
        hidden: false,
      });

      const glCanvas = handle.renderer.domElement;
      glCanvas.style.width = "100%";
      glCanvas.style.height = "100%";
      glCanvas.style.cursor = "grab";
      glCanvas.style.outline = "none";
      glCanvas.tabIndex = 0;
      container.appendChild(glCanvas);

      handle.attachKeyboard(glCanvas);
      glCanvas.focus();
      handle.renderer.setPixelRatio(dpr);
      fireSceneReady(handle);

      function onResize(): void {
        const nextDpr = window.devicePixelRatio || 1;
        const nw = Math.round(container!.clientWidth * nextDpr);
        const nh = Math.round(container!.clientHeight * nextDpr);
        handle.resize(nw, nh);
        handle.renderer.setPixelRatio(nextDpr);
      }

      window.addEventListener("resize", onResize);

      let lastTime = performance.now();
      let frameCount = 0;
      let fpsLastTime = performance.now();

      function animate(): void {
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        frameCount++;
        if (now - fpsLastTime >= 500) {
          setFps(Math.round((frameCount * 1000) / (now - fpsLastTime)));
          frameCount = 0;
          fpsLastTime = now;
        }

        handle.updateMovement(dt);
        handle.controls.update();
        handle.renderer.render(handle.scene, handle.camera);
        rafRef.current = requestAnimationFrame(animate);
      }

      rafRef.current = requestAnimationFrame(animate);

      return () => {
        fireSceneReady(null);
        window.removeEventListener("resize", onResize);
        cancelAnimationFrame(rafRef.current);
        handle.dispose();
        glCanvas.remove();
        canvas.style.display = "";
      };
    }

    // ----- ASCII mode (default) -----
    const charW = measureCharWidth();
    const charH = FONT_SIZE;

    const dims = computeGridDims(container, charW, charH);

    canvas.width = Math.round(dims.cols * charW);
    canvas.height = Math.round(dims.rows * charH);

    const handle = createScene(pointCloud, dims.cols, dims.rows, canvas);
    handle.camera.aspect = (dims.cols * charW) / (dims.rows * charH);
    handle.camera.updateProjectionMatrix();
    handle.attachKeyboard(canvas);
    canvas.focus();
    document.body.appendChild(handle.renderer.domElement);
    fireSceneReady(handle);

    const ctx = canvas.getContext("2d", { alpha: false })!;
    ctx.font = FONT;
    ctx.textBaseline = "top";

    function restoreCanvasState(): void {
      ctx.font = FONT;
      ctx.textBaseline = "top";
    }

    function onResize(): void {
      const next = computeGridDims(container!, charW, charH);
      dims.cols = next.cols;
      dims.rows = next.rows;
      handle.resize(dims.cols, dims.rows);
      handle.camera.aspect = (dims.cols * charW) / (dims.rows * charH);
      handle.camera.updateProjectionMatrix();
      canvas!.width = Math.round(dims.cols * charW);
      canvas!.height = Math.round(dims.rows * charH);
      restoreCanvasState();
    }

    window.addEventListener("resize", onResize);

    const gl = handle.renderer.getContext();
    let prevStyle = "";
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsLastTime = performance.now();

    function animate(): void {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      frameCount++;
      if (now - fpsLastTime >= 500) {
        setFps(Math.round((frameCount * 1000) / (now - fpsLastTime)));
        frameCount = 0;
        fpsLastTime = now;
      }

      handle.updateMovement(dt);
      handle.controls.update();
      handle.renderer.render(handle.scene, handle.camera);

      const frame = readAsciiFrame(gl, dims.cols, dims.rows);

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas!.width, canvas!.height);

      for (let row = 0; row < frame.rows; row++) {
        for (let col = 0; col < frame.cols; col++) {
          const idx = row * frame.cols + col;
          const charIdx = frame.chars[idx];
          if (charIdx === 0) continue;

          const style = `rgb(${frame.r[idx]},${frame.g[idx]},${frame.b[idx]})`;
          if (style !== prevStyle) {
            ctx.fillStyle = style;
            prevStyle = style;
          }
          ctx.fillText(CHAR_RAMP[charIdx], col * charW, row * charH);
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      fireSceneReady(null);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
      handle.dispose();
      handle.renderer.domElement.remove();
    };
  }, [pointCloud, renderMode, setFps, fireSceneReady]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full bg-background outline-none select-none cursor-grab"
        tabIndex={0}
      />
      {overlay}
    </div>
  );
}
