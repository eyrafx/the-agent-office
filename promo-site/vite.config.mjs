// The promo site. It reuses the app's real island and office code read-only from ../app/src
// (nothing under app/ is changed) and swaps only two things: the Tauri bridge for an in-page demo
// bridge (src/demo/bridge.ts) and the WebGL mascot entry for the sprite mascot the app shows anyway.
// Vite comes from app/node_modules, so `npm install` in app/ is all the site needs.
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative, sep } from 'node:path';
import { existsSync, readFileSync, statSync, readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Script } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '../app');
// Only these parts of the app's public folder are used (the mascot layers and the office scene).
const SHARED = ['mascot/layers', 'ofis'];
const TYPES = { '.png': 'image/png', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };

// The office scene is a generated script the app's team regenerates now and then. If the working
// copy does not parse (caught mid-edit), the site uses the last committed scene instead, so the page
// never shows a broken office.
function officeFiles() {
  const read = name => readFileSync(join(app, 'public', 'ofis', name));
  const committed = name => execFileSync('git', ['show', `HEAD:app/public/ofis/${name}`], { cwd: app, maxBuffer: 32 << 20 });
  try { new Script(read('ofis.js').toString('utf8')); return { 'index.html': read('index.html'), 'ofis.js': read('ofis.js') }; }
  catch (error) {
    console.warn(`[site] app/public/ofis/ofis.js does not parse now (${error.message}); using the committed office scene.`);
    try { return { 'index.html': committed('index.html'), 'ofis.js': committed('ofis.js') }; } catch { return { 'index.html': read('index.html'), 'ofis.js': read('ofis.js') }; }
  }
}

function appPublic() {
  let outDir = 'dist';
  return {
    name: 'agentoffice-app-public',
    configResolved(c) { outDir = c.build.outDir; },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]);
        const hit = SHARED.find(p => url.startsWith(`/${p}/`));
        if (!hit) return next();
        if (hit === 'ofis') {
          const body = officeFiles()[url.slice('/ofis/'.length)];
          if (!body) return next();
          res.setHeader('Content-Type', TYPES[url.slice(url.lastIndexOf('.'))]); res.setHeader('Cache-Control', 'no-store'); res.end(body); return;
        }
        const file = join(app, 'public', url);
        if (!file.startsWith(join(app, 'public') + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', TYPES[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      const copy = (from, to) => { for (const name of readdirSync(from)) { const a = join(from, name), b = join(to, name); if (statSync(a).isDirectory()) copy(a, b); else { mkdirSync(to, { recursive: true }); copyFileSync(a, b); } } };
      copy(join(app, 'public', 'mascot', 'layers'), resolve(here, outDir, 'mascot', 'layers'));
      const office = officeFiles(); mkdirSync(resolve(here, outDir, 'ofis'), { recursive: true });
      for (const [name, body] of Object.entries(office)) writeFileSync(resolve(here, outDir, 'ofis', name), body);
    },
  };
}

export default {
  root: here,
  base: './',
  clearScreen: false,
  publicDir: resolve(here, 'public'),
  resolve: {
    alias: [
      // The island imports the mascot through renderer.ts, which also carries the three.js studio
      // rig; the product mascot is the sprite one, so the site loads only that.
      { find: /^\.\.\/mascot\/renderer$/, replacement: resolve(here, 'src/demo/mascot.ts') },
      // The AI tools' logos become neutral text labels on the site (src/demo/icons.ts).
      { find: /^(\.\.\/ui|\.)\/icons$/, replacement: resolve(here, 'src/demo/icons.ts') },
      // The site speaks Turkish (English later): the app's other catalogs are left out of the bundle.
      { find: /^\.\/locales\/(es|de|fr|pt-BR|it|ru|ja|ko|zh-Hans)\.json$/, replacement: resolve(here, 'src/demo/empty-locale.json') },
      { find: '@app', replacement: resolve(app, 'src') },
    ],
  },
  server: { fs: { allow: [here, app] } },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(here, 'index.html'), island: resolve(here, 'island.html'), office: resolve(here, 'office.html') } },
  },
  plugins: [appPublic()],
};
