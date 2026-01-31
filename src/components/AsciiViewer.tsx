import { useEffect, useRef } from "react";
import type { PointCloud } from "../lib/pointcloud";
import { createScene, type SceneHandle } from "../lib/scene";
import { renderAscii } from "../lib/ascii";

interface Props {
  pointCloud: PointCloud;
}

const ASCII_COLS = 160;
const ASCII_ROWS = 90;

export function AsciiViewer({ pointCloud }: Props) {
  const preRef = useRef<HTMLPreElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const pre = preRef.current;
    if (!pre) return;

    const handle = createScene(pointCloud, ASCII_COLS, ASCII_ROWS, pre);
    sceneRef.current = handle;

    // Append the hidden canvas to the DOM so WebGL context is active
    document.body.appendChild(handle.renderer.domElement);

    function animate() {
      handle.controls.update();
      handle.renderer.render(handle.scene, handle.camera);
      const gl = handle.renderer.getContext();
      const ascii = renderAscii(gl, ASCII_COLS, ASCII_ROWS);
      if (preRef.current) {
        preRef.current.textContent = ascii;
      }
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      handle.dispose();
      handle.renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, [pointCloud]);

  return (
    <pre
      ref={preRef}
      className="ascii-viewer"
      tabIndex={0}
      style={{ cursor: "grab" }}
    />
  );
}
