// Renders the film (harness/film.*) frame by frame: seek(t) draws the exact frame, a screenshot
// keeps it. Out: film-frames/<lang>-<format>/NNNNN.jpg and film-frames/<lang>-<format>/cues.json
// (its length and the music's tempo and cuts). With --at, only those seconds are drawn (for the storyboard).
// Needs `npm run serve`. Usage: node render.mjs [tr|en] [wide|tall] [--fps 30] [--at 1.5,3,8] [--from s --to s]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../app/node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const lang = args.includes('en') ? 'en' : 'tr', format = args.includes('tall') ? 'tall' : 'wide';
const fps = Number(opt('fps', 30)), at = opt('at', ''), part = opt('part', ''), outDir = opt('out', join('film-frames', `${lang}-${format}${part ? `-${part}` : ''}`));

const executablePath = process.env.PROMO_CHROME || join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1246', 'chrome-win64', 'chrome.exe');
const browser = await chromium.launch({ executablePath, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization', '--force-color-profile=srgb', '--hide-scrollbars'] });
const [W, H] = format === 'tall' ? [1080, 1350] : [1920, 1080];
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.goto(`http://127.0.0.1:5190/promo/film.html?lang=${lang}&format=${format}${part ? `&part=${part}` : ''}`);
await page.waitForFunction(() => window.__film?.ready, null, { timeout: 120_000 });
const { duration, cues, music } = await page.evaluate(() => ({ duration: window.__film.duration, cues: window.__film.cues, music: window.__film.music }));
const cdp = await page.context().newCDPSession(page);

const times = at ? at.split(',').map(Number) : (() => {
  const from = Number(opt('from', 0)), to = Number(opt('to', duration));
  return Array.from({ length: Math.round((to - from) * fps) }, (_, i) => from + i / fps);
})();
if (!at && !args.includes('--keep')) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'cues.json'), JSON.stringify({ duration, cues, music }, null, 1));

const t0 = Date.now();
for (const [i, t] of times.entries()) {
  await page.evaluate(t => window.__film.seek(t), t);
  // The film's frames are kept lossless (PNG), so the type stays crisp up to the encoder; the
  // storyboard's few stills (--at) are JPEG.
  const { data } = await cdp.send('Page.captureScreenshot', at ? { format: 'jpeg', quality: 94 } : { format: 'png' });
  const name = at ? `at-${t.toFixed(2)}.jpg` : `${String(Math.round(t * fps)).padStart(5, '0')}.png`;
  writeFileSync(join(outDir, name), Buffer.from(data, 'base64'));
  if (i % 150 === 149) console.log(`${i + 1}/${times.length} frames, ${((Date.now() - t0) / (i + 1)).toFixed(0)} ms each`);
}
console.log(`${lang}-${format}: ${times.length} frames → ${outDir} (${duration.toFixed(2)} s film)`);
await browser.close();
