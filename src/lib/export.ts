import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

/**
 * Export the current Three.js scene as a binary glTF (.glb) file.
 * Triggers a download in the user's browser.
 */
export async function exportSceneAsGLB(
  scene: THREE.Scene,
  filename = "autoscene-export.glb",
): Promise<void> {
  const exporter = new GLTFExporter();

  const glb = await exporter.parseAsync(scene, {
    binary: true,
    // Only export meshes (skip lights, cameras, helpers)
    onlyVisible: true,
  });

  // parseAsync with binary:true returns an ArrayBuffer
  const blob = new Blob([glb as ArrayBuffer], {
    type: "model/gltf-binary",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  // Cleanup the object URL after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
