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

  // Temporarily hide ground plane(s) so they aren't included in the GLB.
  // We use the onlyVisible flag below, so setting visible=false excludes them.
  const hiddenMeshes: THREE.Object3D[] = [];
  scene.traverse((child) => {
    if (child.userData.isGroundPlane && child.visible) {
      child.visible = false;
      hiddenMeshes.push(child);
    }
  });

  const glb = await exporter.parseAsync(scene, {
    binary: true,
    // Only export visible meshes (skip lights, cameras, helpers, hidden ground)
    onlyVisible: true,
  });

  // Restore visibility of ground planes after export
  for (const mesh of hiddenMeshes) {
    mesh.visible = true;
  }

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
