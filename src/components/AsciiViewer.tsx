import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { fpsAtom } from "@/atoms/fps";
import { renderModeAtom } from "@/atoms/renderMode";
import { createAsciiAtlas } from "@/lib/asciiAtlas";
import { createAsciiPass } from "@/lib/asciiPass";
import type { PointCloud } from "@/lib/pointcloud";
import { createScene, type SceneHandle } from "@/lib/scene";

interface Props {
  pointCloud: PointCloud | null;
  overlay?: React.ReactNode;
  onSceneReady?: (handle: SceneHandle | null) => void;
}

const CHAR_W = 3.6;
const CHAR_H = 6;

export function AsciiViewer({ pointCloud, overlay, onSceneReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const setFps = useSetAtom(fpsAtom);
  const renderMode = useAtomValue(renderModeAtom);

  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;
  const activeHandleRef = useRef<SceneHandle | null>(null);

  const fireSceneReady = useCallback((handle: SceneHandle | null) => {
    activeHandleRef.current = handle;
    onSceneReadyRef.current?.(handle);
  }, []);

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

    // ----- ASCII mode (GPU shader pipeline) -----
    canvas.style.display = "none";
    let cancelled = false;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(container.clientWidth * dpr);
    const h = Math.round(container.clientHeight * dpr);

    const handle = createScene(pointCloud, w, h, container, {
      antialias: false,
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

    // Build the font atlas asynchronously, then start rendering
    createAsciiAtlas().then((atlas) => {
      if (cancelled) {
        atlas.texture.dispose();
        return;
      }

      const asciiPass = createAsciiPass(
        atlas,
        Math.max(Math.floor(container.clientWidth / CHAR_W), 40),
        Math.max(Math.floor(container.clientHeight / CHAR_H), 20),
        w,
        h,
      );

      handle.camera.aspect = container.clientWidth / container.clientHeight;
      handle.camera.updateProjectionMatrix();
      fireSceneReady(handle);

      function onResize(): void {
        const nextDpr = window.devicePixelRatio || 1;
        const nw = Math.round(container!.clientWidth * nextDpr);
        const nh = Math.round(container!.clientHeight * nextDpr);
        handle.resize(nw, nh);
        handle.renderer.setPixelRatio(nextDpr);
        handle.camera.aspect = container!.clientWidth / container!.clientHeight;
        handle.camera.updateProjectionMatrix();
        asciiPass.resize(
          container!.clientWidth,
          container!.clientHeight,
          CHAR_W,
          CHAR_H,
        );
      }

      window.addEventListener("resize", onResize);

      let lastTime = performance.now();
      let frameCount = 0;
      let fpsLastTime = performance.now();

      function animate(): void {
        if (cancelled) return;
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
        asciiPass.render(handle.renderer, handle.scene, handle.camera);
        rafRef.current = requestAnimationFrame(animate);
      }

      rafRef.current = requestAnimationFrame(animate);

      // Store cleanup references on the handle for the effect teardown
      cleanupRef.current = () => {
        window.removeEventListener("resize", onResize);
        asciiPass.dispose();
      };
    });

    return () => {
      cancelled = true;
      fireSceneReady(null);
      cancelAnimationFrame(rafRef.current);
      cleanupRef.current?.();
      handle.dispose();
      glCanvas.remove();
      canvas.style.display = "";
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
