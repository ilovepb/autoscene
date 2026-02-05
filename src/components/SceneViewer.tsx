import { useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { fpsAtom } from "@/atoms/fps";
import { createScene, type SceneHandle } from "@/lib/scene";

interface Props {
  overlay?: React.ReactNode;
  onSceneReady?: (handle: SceneHandle | null) => void;
}

export function SceneViewer({ overlay, onSceneReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const setFps = useSetAtom(fpsAtom);

  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;

  const fireSceneReady = useCallback((handle: SceneHandle | null) => {
    onSceneReadyRef.current?.(handle);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(container.clientWidth * dpr);
    const h = Math.round(container.clientHeight * dpr);

    const handle = createScene(w, h, container);

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
      // Use the post-processing composer instead of direct renderer.render()
      // — the composer's RenderPass handles the scene render internally
      handle.composer.render();
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      fireSceneReady(null);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
      handle.dispose();
      glCanvas.remove();
    };
  }, [setFps, fireSceneReady]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      {overlay}
    </div>
  );
}
