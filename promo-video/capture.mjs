// Captures the film's layers from the real island and office (harness/lab.*, the site's demo world):
// stills and short clips, island with its own alpha, at 2× pixels. Every clock in the page runs
// SLOW× slower (lib/slow.mjs), so even a busy moment is caught at 30+ frames a second; each clip
// frame is saved with its page time. Out: assets/<name>.webp, assets/<clip>/NNNN.webp, assets/manifest.json.
// Needs `npm run serve`. Usage: node capture.mjs [shot ...]   (default: every shot)
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../app/node_modules/playwright/index.mjs';
import { slowClock } from './lib/slow.mjs';

const ASSETS = 'assets';
mkdirSync(ASSETS, { recursive: true });
const manifestFile = join(ASSETS, 'manifest.json');
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
const save = () => writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));

const executablePath = process.env.PROMO_CHROME || join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1246', 'chrome-win64', 'chrome.exe');
const browser = await chromium.launch({ executablePath, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization', '--force-color-profile=srgb', '--hide-scrollbars'] });

// Where things sit on the lab page (harness/lab.html).
const ISLAND = { x: 150, y: 0, w: 890, h: 500 };
const OFFICE = { x: 0, y: 540, w: 1180, h: 708 };
const STRIP = { x: 440, y: 0, w: 310, h: 72 };
// The office window (its frame and sill), for the close-ups of the sky.
const WINDOW = { x: 342, y: 540 + 54, w: 498, h: 186 };
// Every clock reads 09:41 at the start of a capture (today's date).
const nineFortyOne = () => { const d = new Date(); d.setHours(9, 41, 0, 0); return d.getTime() - Date.now(); };

// PROMO_LANG=en films the same shots in English (UI and made-up data); names get an -en suffix.
// PROMO_THEME=dark films the island in its solid black theme; names get a -dark suffix.
const LANG = process.env.PROMO_LANG || 'tr', THEME = process.env.PROMO_THEME === 'dark' ? 'dark' : 'glass';
const SFX = (LANG === 'tr' ? '' : `-${LANG}`) + (THEME === 'dark' ? '-dark' : '');

async function open({ lang = LANG, office = true, slow = 8, dsf = 2, backdrop = '' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1260 }, deviceScaleFactor: dsf });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.addInitScript(slowClock, { slow, anchor: Date.now(), offset: nineFortyOne() });
  await page.goto(`http://127.0.0.1:5190/promo/lab.html?lang=${lang}&theme=${THEME}${backdrop ? `&backdrop=${backdrop}` : ''}${office ? '' : '&office=0'}`);
  await page.waitForFunction(() => window.__lab?.ready, null, { timeout: 300_000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / slow });
  const lab = (fn, arg) => page.evaluate(fn, arg);
  /** Page seconds pass (real time × slow). */
  const hold = s => page.waitForTimeout(s * 1000 * slow);
  await hold(1.5);
  return { page, cdp, lab, hold, slow, dsf };
}

// Close-up layers (4× pixels and more) are kept lossless (PNG): a lossy picture smears the type's edges.
const extOf = ctx => ctx.dsf >= 4 ? 'png' : 'webp';
async function shot(cdp, rect, quality, format = 'webp', scale = 1) {
  const { data } = await cdp.send('Page.captureScreenshot', { format, ...(format === 'png' ? {} : { quality }), clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale }, captureBeyondViewport: false });
  return Buffer.from(data, 'base64');
}

async function still(ctx, name, rect, quality = 94) {
  const ext = extOf(ctx);
  writeFileSync(join(ASSETS, `${name}.${ext}`), await shot(ctx.cdp, rect, quality, ext, ctx.dsf));
  manifest[name] = { kind: 'still', w: rect.w * 2, h: rect.h * 2, dsf: ctx.dsf, ext };
  save(); console.log('still', name);
}

/** Films `seconds` of page time; `cues` are [page second, async action] pairs. */
async function clip(ctx, name, rect, seconds, cues = [], quality = 90) {
  const dir = join(ASSETS, name); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const frames = []; const todo = [...cues].sort((a, b) => a[0] - b[0]);
  const t0 = Date.now(), now = () => (Date.now() - t0) / 1000 / ctx.slow, ext = extOf(ctx);
  // Lossless frames are large: about 45 a second of page time is plenty for a 30 fps film.
  const every = ext === 'png' ? 1 / 45 : 0;
  while (now() < seconds) {
    while (every && now() < frames.length * every) await new Promise(r => setTimeout(r, 5));
    while (todo.length && todo[0][0] <= now()) await todo.shift()[1]();
    const before = now(); const img = await shot(ctx.cdp, rect, quality, ext, ctx.dsf); const t = (before + now()) / 2;
    const file = `${String(frames.length).padStart(4, '0')}.${ext}`;
    writeFileSync(join(dir, file), img); frames.push(+t.toFixed(4));
  }
  manifest[name] = { kind: 'clip', w: rect.w * 2, h: rect.h * 2, dsf: ctx.dsf, ext, seconds, times: frames };
  save(); console.log('clip', name, frames.length, 'frames', (frames.length / seconds).toFixed(1), 'fps');
}

const pinOpen = (ctx, page = 'agents') => ctx.lab(p => { window.__lab.emit({ type: 'pin', on: true }); window.__lab.emit({ type: 'page', page: p }); }, page);

const PATHS = LANG === 'en' ? ['presentation-draft.pdf', 'home-screen.png', 'budget-2027.xlsx'].map(n => `C:\\Demo\\Desktop\\${n}`) : ['sunum-taslagi.pdf', 'ana-ekran.png', 'butce-2027.xlsx'].map(n => `C:\\Örnek\\Masaüstü\\${n}`);
const SHOTS = {
  /** The small island and its turning strip: time, battery, weather, headphones, the next alarm. */
  async strip() {
    // At 6× pixels: the film shows it in a large close-up.
    const c = await open({ office: false, slow: 4, dsf: 6 });
    await clip(c, `strip${SFX}`, STRIP, 26);
    await c.page.close();
  },
  /** Agents: the island opens on the list; a question arrives; the status filters. */
  async agents() {
    const c = await open({ office: false, slow: 24, dsf: 4 });  // 4× pixels: the film shows the island in close-up.
    await clip(c, `agents-open${SFX}`, ISLAND, 2.4, [[0.25, () => pinOpen(c)]]);
    await still(c, `agents${SFX}`, ISLAND);
    await clip(c, `agents-ask${SFX}`, ISLAND, 2.6, [[0.3, () => c.lab(() => window.__lab.ask())]]);
    await still(c, `agents-asked${SFX}`, ISLAND);
    const chip = sel => async () => c.lab(s => window.__lab.click('island', s), sel);
    if (process.env.FILTER) await clip(c, 'agents-filter', ISLAND, 3.6, [[0.3, chip('.st-working')], [1.3, chip('.st-waiting')], [2.3, chip('.st-idle')], [3.3, chip('.st-idle')]]);
    await c.page.close();
  },
  /** The office, in one take: a question (a raised hand), the manager walks over and back, the answer
   *  in the balloon, the card closed, an idle agent goes for coffee (one clip, so the film never cuts). */
  async office() {
    // Slower clock: its 2× frames are large; at 16× a smooth 40-odd frames a second of the take.
    const c = await open({ slow: 16 });
    await still(c, `office${SFX}`, OFFICE);
    const click = s => async () => c.lab(x => window.__lab.click('office', x), s);
    // The balloon opens once the manager has arrived (it would hide the visit).
    await clip(c, `office-story${SFX}`, OFFICE, 17.5, [[0.3, () => c.lab(() => window.__lab.ask())], [6.0, () => c.lab(() => window.__lab.select('lumen-theme'))],
      [7.2, click('.ask-opt')], [8.0, click('.ask-send')], [9.2, click('.card-close')], [10.0, () => c.lab(() => window.__lab.idle('lumen-search'))]]);
    await c.page.close();
  },
  /** The window: the real sky by the sun's height and the island's weather reading (simulated codes). */
  async window() {
    const c = await open({ office: true, slow: 6, dsf: 4 });
    const states = [['win-day', 0, 'day'], ['win-dusk', 0, 'dusk'], ['win-night', 0, 'night'], ['win-cloudy', 2, 'day'], ['win-fog', 45, 'day'],
      ['win-rain', 61, 'day'], ['win-snow', 73, 'day'], ['win-storm', 95, 'night'], ['win-clear', 0, 'day']];
    for (const [name, code, sun] of states) {
      await c.lab(([k, s]) => window.__lab.sky(k, s), [code, sun]); await c.hold(1.2);
      await clip(c, name, WINDOW, 1.4);
    }
    // The whole room by day, for the way in.
    await c.lab(() => window.__lab.sky(0, 'day')); await c.hold(1.2); await still(c, 'office-day', OFFICE);
    await c.page.close();
  },
  /** One take through the pages, as a swipe does: notes, alarms, water (a glass is drunk), focus. */
  async tour() {
    const c = await open({ office: false, slow: 10, dsf: 4 });
    await pinOpen(c, 'notes'); await c.hold(1.4);
    const page = p => async () => c.lab(x => window.__lab.emit({ type: 'page', page: x }), p);
    await clip(c, `tour${SFX}`, ISLAND, 10, [[2.4, page('alarms')], [4.8, page('water')], [6.0, async () => c.lab(() => window.__lab.click('island', '.w-drink'))], [7.4, page('focus')]]);
    await pinOpen(c, 'media'); await c.hold(1.2); await clip(c, `media${SFX}`, ISLAND, 3.2);
    await c.page.close();
  },
  /** The open island turns to glass over a colourful wallpaper, holds, and goes back to black. */
  async glass() {
    const c = await open({ office: false, slow: 24, dsf: 4, backdrop: 'color' });
    await pinOpen(c); await c.hold(1.4);
    const look = l => async () => c.lab(x => window.__lab.theme(x), l);
    await clip(c, `glass${SFX}`, ISLAND, 4.2, [[0.6, look('glass')], [3.2, look('dark')]]);
    await c.page.close();
  },
  /** The closed island over a full screen: it settles into the thin line and breathes. */
  async line() {
    const c = await open({ office: false, slow: 4, dsf: 4 });
    await clip(c, `line${SFX}`, STRIP, 7, [[1.0, () => c.lab(() => window.__lab.dock('line'))]]);
    await c.page.close();
  },
  /** System signs on the closed island: volume, Caps Lock, the keyboard's language (the shell's own texts). */
  async signs() {
    const c = await open({ office: false, slow: 6, dsf: 4 });
    const sign = s => async () => c.lab(x => window.__lab.sign(x), s);
    await clip(c, `signs${SFX}`, STRIP, 6.4, [[0.5, sign({ kind: 'volume', text: 'Ses %60', value: 60, on: true })], [2.3, sign({ kind: 'caps', text: 'Caps Lock açık', value: null, on: true })],
      [4.1, sign({ kind: 'language', text: `Klavye: ${LANG === 'en' ? 'EN' : 'TR'}`, value: null, on: null })]]);
    await c.page.close();
  },
  /** The window through the year: spring, summer, autumn, winter (the office's own seasons), by day. */
  async seasons() {
    const c = await open({ office: true, slow: 6, dsf: 4 });
    await c.lab(() => window.__lab.sky(0, 'day')); await c.hold(1.2);
    for (const [name, mevsim] of [['win-spring', 'ilkbahar'], ['win-summer', 'yaz'], ['win-autumn', 'sonbahar'], ['win-winter', 'kis']]) {
      await c.lab(m => window.__lab.season(m), mevsim);
      await c.page.waitForFunction(m => window.__lab.seasonNow() === m, mevsim, { timeout: 60_000 });
      await c.hold(1.2);
      await clip(c, name, WINDOW, 1.4);
    }
    await c.page.close();
  },
  /** The other pages, one live moment each. */
  async pages(only = process.env.PAGES?.split(',')) {
    const c = await open({ office: false, slow: 10, dsf: 4 });
    const want = n => !only || only.includes(n);
    const go = async page => { await pinOpen(c, page); await c.hold(1.2); };
    const click = s => async () => c.lab(x => window.__lab.click('island', x), s);
    if (want('media')) { await go('media'); await clip(c, 'media', ISLAND, 2.4); }
    if (want('notes')) { await go('notes'); await clip(c, 'notes', ISLAND, 2.4, [[0.6, click('.todo-check')]]); }
    if (want('alarm')) {
      await go('alarms'); await clip(c, 'alarm', ISLAND, 2.6, [[0.3, () => c.lab(() => window.__lab.ring())]]);
      await c.lab(() => { const l = window.__lab; l.hub.reminders = l.hub.reminders.map(r => ({ ...r, ringing: false })); l.hub.emit('reminders', l.hub.reminders); });
    }
    if (want('water')) { await go('water'); await clip(c, 'water', ISLAND, 2.6, [[0.4, click('.w-drink')], [1.3, click('.w-drink')]]); }
    if (want('shelf')) { await go('shelf'); await clip(c, `shelf${SFX}`, ISLAND, 2.8, [[0.3, () => c.lab(() => window.__lab.notch().shelfOver(true))], [1.1, () => c.lab(p => { const n = window.__lab.notch(); n.shelfOver(false); n.shelfDrop(p); }, PATHS)]]); }
    if (want('limits')) {
      // The island hides limit bars in its demo mode; the panel is filmed with the demo's own (made-up) readings.
      await c.lab(() => { const h = window.__lab.hub; h.snapshot.mode = 'live'; h.publish(); });
      await go('agents'); await clip(c, 'limits', { ...ISLAND, w: 1140 }, 2.2, [[0.4, () => c.lab(() => window.__lab.notch().limits(true))]]);
    }
    await c.page.close();
  },
  /** The same island in every language the app speaks. */
  async languages() {
    for (const lang of ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt-BR', 'ru', 'ja', 'ko', 'zh-Hans']) {
      const c = await open({ lang, office: false, slow: 2 });
      await pinOpen(c); await c.hold(1.4);
      await still(c, `lang-${lang}`, ISLAND);
      await c.page.close();
    }
  },
  /** The mascot's approved sprite layers, as the app ships them. */
  async mascot() {
    for (const n of ['body', 'eyeL', 'eyeR', 'arm', 'under']) copyFileSync(`../app/public/mascot/layers/${n}-768.png`, join(ASSETS, `mascot-${n}.png`));
    copyFileSync('../app/public/mascot/layers/layers.json', join(ASSETS, 'mascot-layers.json'));
    manifest.mascot = { kind: 'mascot' }; save(); console.log('mascot');
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
rmSync(join(ASSETS, 'test-closed.webp'), { force: true }); rmSync(join(ASSETS, 'test-open.webp'), { force: true });
for (const name of wanted) { if (!SHOTS[name]) throw new Error(`no shot ${name}`); await SHOTS[name](); }
await browser.close();
