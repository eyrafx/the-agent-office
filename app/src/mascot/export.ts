import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildMascot, disposeModel } from './model';

/** Browser callable: exports the complete editable hierarchy in its neutral pose. */
export async function exportMascotGLB(): Promise<ArrayBuffer> {
  const rig = buildMascot();
  try {
    const result = await new GLTFExporter().parseAsync(rig.root, { binary: true, onlyVisible: true });
    if (!(result instanceof ArrayBuffer)) throw new Error('GLB exporter returned a non-binary asset');
    return result;
  } finally { disposeModel(rig); }
}

export async function downloadMascotGLB(): Promise<void> {
  const result = await exportMascotGLB();
  const url = URL.createObjectURL(new Blob([result], { type: 'model/gltf-binary' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'agentoffice-robot.glb'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
