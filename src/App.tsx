import { useState, useCallback } from "react";
import { UploadZone } from "./components/UploadZone";
import { LoadingState } from "./components/LoadingState";
import { AsciiViewer } from "./components/AsciiViewer";
import { loadDepthModel, estimateDepth } from "./lib/depth";
import { buildPointCloud, type PointCloud } from "./lib/pointcloud";

type AppState =
  | { phase: "upload" }
  | { phase: "loading"; message: string; progress?: number }
  | { phase: "viewing"; pointCloud: PointCloud }
  | { phase: "error"; message: string };

function getImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export default function App() {
  const [state, setState] = useState<AppState>({ phase: "upload" });

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

      const img = new Image();
      img.crossOrigin = "anonymous";
      const url = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = url;
      });

      const depth = await estimateDepth(img);

      setState({ phase: "loading", message: "Building point cloud..." });

      const imageData = getImageData(img);
      URL.revokeObjectURL(url);

      const pointCloud = buildPointCloud(depth, imageData, 2);

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
    <div className="app">
      <header className="header">
        <pre className="title">autoscene</pre>
      </header>
      <main className="main">
        {state.phase === "upload" && <UploadZone onFile={handleFile} />}
        {state.phase === "loading" && (
          <LoadingState message={state.message} progress={state.progress} />
        )}
        {state.phase === "viewing" && (
          <AsciiViewer pointCloud={state.pointCloud} />
        )}
        {state.phase === "error" && (
          <div className="error">
            <pre>{`Error: ${state.message}\n\nRefresh to try again.`}</pre>
          </div>
        )}
      </main>
    </div>
  );
}
