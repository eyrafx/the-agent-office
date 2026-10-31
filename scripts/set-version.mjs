// The app's version lives in seven places; this keeps them the same.
//
//   node scripts/set-version.mjs            print the version and check every place agrees
//   node scripts/set-version.mjs 0.9.0      set every place to 0.9.0
//
// Scheme: MAJOR.MINOR.PATCH (0.x while the app is young). The Microsoft Store package adds a
// fourth number that stays 0 (0.9.0 -> 0.9.0.0); scripts/store builds take it from tauri.conf.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = p => join(root, p);
const json = p => JSON.parse(readFileSync(at(p), 'utf8'));
const tomlVersion = /^(\[package\]\r?\nname = "[^"]+"\r?\nversion = ")([^"]+)(")/m;
const lockVersion = name => new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${name}"\\r?\\nversion = ")([^"]+)(")`);

const places = [
  { file: 'app/src-tauri/tauri.conf.json', get: () => json('app/src-tauri/tauri.conf.json').version, set: v => editJson('app/src-tauri/tauri.conf.json', 1, v) },
  { file: 'app/package.json', get: () => json('app/package.json').version, set: v => editJson('app/package.json', 1, v) },
  { file: 'app/package-lock.json', get: () => { const o = json('app/package-lock.json'); return o.version === o.packages[''].version ? o.version : `${o.version} / ${o.packages[''].version}`; }, set: v => editJson('app/package-lock.json', 2, v) },
  { file: 'app/src-tauri/Cargo.toml', get: () => match('app/src-tauri/Cargo.toml', tomlVersion), set: v => edit('app/src-tauri/Cargo.toml', tomlVersion, v) },
  { file: 'app/src-tauri/Cargo.lock', get: () => match('app/src-tauri/Cargo.lock', lockVersion('agentoffice')), set: v => edit('app/src-tauri/Cargo.lock', lockVersion('agentoffice'), v) },
  { file: 'app/hook/Cargo.toml', get: () => match('app/hook/Cargo.toml', tomlVersion), set: v => edit('app/hook/Cargo.toml', tomlVersion, v) },
  { file: 'app/hook/Cargo.lock', get: () => match('app/hook/Cargo.lock', lockVersion('agentoffice-hook')), set: v => edit('app/hook/Cargo.lock', lockVersion('agentoffice-hook'), v) },
];

function match(file, re) {
  const m = readFileSync(at(file), 'utf8').match(re);
  if (!m) throw new Error(`no version found in ${file}`);
  return m[2];
}
function edit(file, re, v) {
  const text = readFileSync(at(file), 'utf8');
  if (!re.test(text)) throw new Error(`no version found in ${file}`);
  writeFileSync(at(file), text.replace(re, `$1${v}$3`));
}
// The first `count` "version" keys (the top-level one, and in package-lock.json also the root
// package's), edited in place so the file's own layout stays as it is.
function editJson(file, count, v) {
  let n = 0;
  const text = readFileSync(at(file), 'utf8').replace(/("version":\s*")([^"]+)(")/g, (all, a, _, b) => (n++ < count ? `${a}${v}${b}` : all));
  if (n < count) throw new Error(`no version found in ${file}`);
  writeFileSync(at(file), text);
}

const wanted = process.argv[2];
if (wanted) {
  if (!/^\d+\.\d+\.\d+$/.test(wanted)) { console.error(`A version is three numbers, like 0.9.0 (not "${wanted}").`); process.exit(2); }
  for (const p of places) p.set(wanted);
}
const found = places.map(p => ({ file: p.file, version: p.get() }));
const versions = new Set(found.map(f => f.version));
for (const f of found) console.log(`${f.version.padEnd(10)} ${f.file}`);
if (versions.size !== 1) { console.error('The versions differ. Run: node scripts/set-version.mjs <version>'); process.exit(1); }
console.log(`AgentOffice ${[...versions][0]}`);
