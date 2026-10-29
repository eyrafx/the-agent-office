import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { followLanguageClock } from './patch-view.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
// The desktop project's app folder (a sibling checkout by default; AGENTOFFICE_APP overrides it).
const app = process.env.AGENTOFFICE_APP || path.resolve(root, '../AgentOffice/app');
const files = ['notch/view.ts','notch/strip.ts','notch/controller.ts','notch/pager.ts','notch/kit.ts','notch/media.ts','notch/focus.ts','notch/alarms.ts','notch/notes.ts','notch/water.ts','notch/shelf.ts','notch/limits.ts','notch/glass.ts','notch/notch.css','notch/pages.css','ui/styles.css','ui/offices.css','ui/state.ts','ui/icons.ts','ui/preferences.ts','ui/settings-panel.ts','ui/first-run.ts','ui/dropdown.ts','ui/city-picker.ts','shared/contract.ts','shared/settings.ts','shared/people.ts','shared/places.ts','mascot/still.ts','mascot/sprite.css'];
const sources = [];
for (const file of files) {
  let source = await readFile(path.join(app, 'src', file), 'utf8');
  // The website supplies its illustrated desktop to the original glass renderer; no screen capture.
  if(file==='notch/view.ts')source=followLanguageClock(source);
  if(file==='notch/view.ts')source=source.replace('  const setLook = (dark: boolean) => {',`  (window as any).__demoGlassFrame = (frame: HTMLCanvasElement) => { if (!glass || darkLook) return false; glass.setFrame(frame, { x: 0, y: 0, w: innerWidth, h: innerHeight }); backdrop.hidden = false; if (!root.classList.contains('live-glass')) root.classList.add('live-glass'); drawGlass(); animate(850); return true; };\n  const setLook = (dark: boolean) => {`);
  if (file === 'mascot/still.ts') for (const [tr,en] of [['Hazır','Ready'],['Çalışıyor','Working'],['Yanıt bekliyor','Waiting for a reply'],['Yanıt tamamlandı','Reply complete'],['Dikkat gerekiyor','Needs attention'],['Dinleniyor','Resting'],['Taşınıyor','Moving'],['maskot','mascot']]) source = source.split(tr).join(en);
  if (file === 'shared/settings.ts') source = source.replaceAll("unit: 'sn'", "unit: 's'").replaceAll("unit: 'dk'", "unit: 'min'");
  const target = path.join(root, 'product-src/source', file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source);
  sources.push(file);
}
// The production product uses this same layered mascot. The unused 3D studio is not bundled.
await writeFile(path.join(root, 'product-src/source/mascot/renderer.ts'), `import { createStillMascot } from './still';\nexport interface MascotController { setState(state:any):void;setPointer(x:number,y:number):void;setVisible(on:boolean):void;setReducedMotion(on:boolean):void;dispose():void }\nexport const createMascot=(el:HTMLElement,o:any={})=>createStillMascot(el,o.reducedMotion);\n`);
await mkdir(path.join(root, 'dist/mascot'), { recursive: true });
await cp(path.join(app, 'public/mascot/layers'), path.join(root, 'dist/mascot/layers'), { recursive: true });
await cp(path.join(app,'src/i18n'),path.join(root,'product-src/source/i18n'),{recursive:true});
const { build } = await import(pathToFileURL(path.join(app, 'node_modules/vite/dist/node/index.js')).href);
await build({ root: path.join(root, 'product-src'), configFile: false, publicDir: false, base: './', resolve: { alias: { '@tauri-apps/api/webview': path.join(app,'node_modules/@tauri-apps/api/webview.js') } }, build: { outDir: path.join(root, 'dist/product'), emptyOutDir: true, sourcemap: false, minify: true } });
await writeFile(path.join(root, 'outputs/product-source.json'), JSON.stringify({ source: 'AgentOffice desktop UI', files: sources, language: 'en', bridge: 'browser-only demonstration' }, null, 2));

await import('./fix-subpath.mjs');
