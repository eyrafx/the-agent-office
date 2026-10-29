// Rebuild only the checked-in browser adapter and its existing product snapshot.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
// The desktop project's app folder (a sibling checkout by default; AGENTOFFICE_APP overrides it).
const app=(process.env.AGENTOFFICE_APP||path.resolve('../AgentOffice/app')).split(path.sep).join('/');
const {build}=await import(pathToFileURL(app+'/node_modules/vite/dist/node/index.js').href);
await build({root:path.resolve('product-src'),configFile:false,publicDir:false,base:'./',resolve:{alias:{'@app':app+'/src','@tauri-apps/api/webview':app+'/node_modules/@tauri-apps/api/webview.js'}},build:{outDir:path.resolve('dist/product'),emptyOutDir:true,rollupOptions:{input:{index:path.resolve('product-src/index.html'),office:path.resolve('product-src/office.html'),mascot:path.resolve('product-src/mascot.html')}},sourcemap:false,minify:true}});

const fs=await import('node:fs/promises');await fs.cp('dist/assets/ofis','dist/ofis',{recursive:true});

await import('./fix-subpath.mjs');
