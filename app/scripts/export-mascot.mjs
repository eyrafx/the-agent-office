import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// GLTFExporter only needs these FileReader methods for texture-free binary export.
globalThis.FileReader ??= class {
  result = null;
  onloadend = null;
  onerror = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }, error => this.onerror?.(error));
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }, error => this.onerror?.(error));
  }
};
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
try {
  const { exportMascotGLB } = await server.ssrLoadModule('/src/mascot/export.ts');
  const bytes = Buffer.from(await exportMascotGLB());
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('Invalid GLB header');
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const names = gltf.nodes.map(node => node.name ?? '');
  if (names.filter(name => /^arm_\d+_shoulder$/.test(name)).length !== 8) throw new Error('Export lost an arm chain');
  const directory = fileURLToPath(new URL('../public/mascot/', import.meta.url));
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/agentoffice-robot.glb`, bytes);
  console.log(`Exported ${bytes.length} bytes; ${gltf.nodes.length} nodes; eight shoulder/elbow/wrist chains.`);
} finally { await server.close(); }
