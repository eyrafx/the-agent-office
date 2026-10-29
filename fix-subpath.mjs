// Makes the built site work from any folder (GitHub Pages serves it from /agentoffice/), as well as
// from the root. The desktop app's code refers to its own files from the server root
// (/mascot/layers, /ofis, /assets); the product frames live in dist/product/, so those become
// paths relative to that folder. Idempotent: run after every product build (build-*.mjs call it).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist', 'product', 'assets');
const swaps = [['`/mascot/layers/', '`../mascot/layers/'], ['`/ofis/index.html`', '`../ofis/index.html`'], ['`/assets/', '`../assets/'], ["'/mascot/layers/", "'../mascot/layers/"], ['"/mascot/layers/', '"../mascot/layers/']];
let changed = 0;
for (const name of await fs.readdir(dir)) {
  if (!name.endsWith('.js')) continue;
  const file = path.join(dir, name); let text = await fs.readFile(file, 'utf8'); const before = text;
  for (const [from, to] of swaps) text = text.split(from).join(to);
  if (text !== before) { await fs.writeFile(file, text); changed++; }
  const left = text.match(/[`'"]\/(mascot|ofis|assets)\//g);
  if (left) throw new Error(`${name} still has root paths: ${left.join(', ')}`);
}
console.log(`Subpath-safe product assets (${changed} file(s) updated).`);
