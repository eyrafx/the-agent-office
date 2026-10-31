/**
 * The small island's slots never overlap: in a real browser (Edge, headless: nothing on the screen),
 * the island in the preview with every strip item shown in turn, with and without the mascot, with
 * and without something playing, both clock styles, every size, in Turkish, German, Japanese and
 * English, and long names. Every visible piece at the left end, in the middle and at the right end
 * keeps to its own box; the middle never shows "…"; the weather always has its temperature.
 * Skipped where Edge cannot be started.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { DEFAULT_SETTINGS } from '../src/shared/settings';

let server: ViteDevServer | undefined, browser: Browser | undefined, base = '';

beforeAll(async () => {
  try { browser = await chromium.launch({ channel: 'msedge', headless: true }); } catch { return; }
  // The app's own preview server (its folder is where the tests run), on a port of its own.
  server = await createServer({ logLevel: 'silent', server: { port: 1437, strictPort: false, host: '127.0.0.1' } });
  await server.listen();
  base = server.resolvedUrls!.local[0];
}, 60_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

const PLACES: Record<string, string> = { tr: 'İstanbul', de: 'Frankfurt am Main', ja: 'イスタンブール', en: 'San Francisco' };
const DEVICES: Record<string, string> = { tr: 'AirPods Pro (Stereo)', de: 'Sony WH-1000XM5 Hands-Free', ja: 'AirPods Max', en: 'Bose QuietComfort Ultra Earbuds' };

/** In the page: every visible leaf piece per slot, and what the middle says. */
const measure = () => {
  const shown = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false; }
    const r = el.getBoundingClientRect(); return r.width > 0.5 && r.height > 0.5;
  };
  const leaves = (root: Element | null) => root ? [...root.querySelectorAll('*')].filter(e => shown(e) && ![...e.children].some(shown)).map(e => { const r = e.getBoundingClientRect(); return { what: `${e.tagName.toLowerCase()}.${(e.getAttribute('class') ?? '').split(' ')[0]}`, l: r.left, r: r.right, t: r.top, b: r.bottom }; }) : [];
  const face = document.querySelector('.capsule-face')!.getBoundingClientRect(), strip = document.querySelector('.cap-strip')!;
  // Each end's own pieces (the mascot's place, the battery, what plays; the badge, a timer, the count).
  const pieces = (root: Element | null) => root ? [...root.children].filter(shown).map(e => { const r = e.getBoundingClientRect(); return { what: `${e.tagName.toLowerCase()}.${(e.getAttribute('class') ?? '').split(' ')[0]}`, l: r.left, r: r.right, t: r.top, b: r.bottom }; }) : [];
  const capFace = document.querySelector<HTMLElement>('.capsule-face')!, status = document.querySelector('.cap-status')!, extra = document.querySelector('.cap-extra')!.getBoundingClientRect();
  const count = { right: capFace.dataset.right, shown: shown(status) && Number(getComputedStyle(status).opacity) > 0.95, gone: !shown(status), middle: (extra.left + extra.right) / 2 - (face.left + face.right) / 2 };
  return { count, face: { l: face.left, r: face.right }, ends: [pieces(document.querySelector('.cap-left')), pieces(document.querySelector('.cap-right'))], left: leaves(document.querySelector('.cap-left')), middle: leaves(strip), right: leaves(document.querySelector('.cap-right')), text: (strip.classList.contains('on-extra') ? document.querySelector('.cap-extra')!.textContent : document.querySelector('.cap-clock')!.textContent) ?? '', item: strip.classList.contains('on-extra') ? (document.querySelector('.cap-extra') as HTMLElement).dataset.item : 'time' };
};
type Box = { what: string; l: number; r: number; t: number; b: number };
const meet = (a: Box, b: Box) => a.r > b.l + 0.5 && b.r > a.l + 0.5 && a.b > b.t + 0.5 && b.b > a.t + 0.5;

describe('the small island\'s slots', () => {
  it('never overlap, whatever is shown, in any language, size or state', async ({ skip }) => {
    if (!browser || !base) skip();
    const page = await browser!.newPage({ viewport: { width: 900, height: 300 } });
    const problems: string[] = [];
    let checked = 0;
    for (const language of ['tr', 'de', 'ja', 'en']) for (const playing of [false, true]) {
      // What the preview reads once at its start: the status, a reminder in an hour, what plays.
      await page.goto(`${base}?view=notch`);
      await page.evaluate(({ language, playing, place, device }) => {
        localStorage.clear();
        const due = Date.now() + 3600_000, at = new Date(due), pad = (n: number) => String(n).padStart(2, '0');
        localStorage.setItem('agentoffice-preview-status', JSON.stringify({ battery: { percent: 64, charging: true }, audio: { kind: 'headphones', name: device, bluetooth: true }, weather: { temperature: 15.8, code: 3, place, at: Date.now() } }));
        localStorage.setItem('agentoffice-preview-reminders', JSON.stringify([{ id: 'r1', title: 'Test', at: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`, repeat: 'once', enabled: true, kind: 'alarm', due }]));
        if (playing) localStorage.setItem('agentoffice-preview-media', JSON.stringify([{ id: 'm1', app: 'Spotify', title: 'Song', artist: 'Artist', album: '', status: 'playing', canPlay: true, canPause: true, canNext: true, canPrev: true, canSeek: false, readAt: Date.now(), rate: 1, current: true }]));
        localStorage.setItem('agentoffice-preview-settings-v1', JSON.stringify({ language, reducedMotion: true, statusBattery: true, statusAudio: true, statusWeather: true, statusAlarm: true }));
      }, { language, playing, place: PLACES[language], device: DEVICES[language] });
      await page.reload();
      // A language other than the page's own reloads it once, as the app does.
      await page.waitForTimeout(1500);
      await page.waitForFunction(() => !!(window as { __islandStrip?: unknown }).__islandStrip);
      for (const hideMascot of [false, true]) for (const clockStyle of ['time', 'date']) for (const scale of language === 'tr' ? [90, 100, 110] : [100]) {
        // The rest is changed live, as the app's settings window does.
        await page.evaluate(({ d, s }) => { const c = new BroadcastChannel('agentoffice-preview'); c.postMessage({ type: 'settings', settings: { ...d, ...JSON.parse(localStorage.getItem('agentoffice-preview-settings-v1') ?? '{}'), ...s } }); c.close(); }, { d: DEFAULT_SETTINGS, s: { hideMascot, clockStyle, scale } });
        await page.waitForTimeout(250);
        for (const item of [null, 'battery', 'weather', 'audio', 'alarm']) {
          const has = await page.evaluate(id => (window as unknown as { __islandStrip: { showItem(id: string | null): boolean } }).__islandStrip.showItem(id), item);
          if (!has) { if (!(item === 'battery' && hideMascot)) problems.push(`${language} playing=${playing} mascot=${!hideMascot}: no ${item} item`); continue; }
          await page.waitForTimeout(320);
          const m = await page.evaluate(measure);
          const where = `${language} playing=${playing} mascot=${!hideMascot} clock=${clockStyle} scale=${scale} ${m.item} "${m.text}"`;
          checked++;
          for (const a of m.middle) for (const b of [...m.left, ...m.right]) if (meet(a, b)) problems.push(`${where}: ${a.what} overlaps ${b.what}`);
          for (const a of m.left) for (const b of m.right) if (meet(a, b)) problems.push(`${where}: ${a.what} overlaps ${b.what}`);
          for (const end of m.ends) end.forEach((a, i) => end.slice(i + 1).forEach(b => { if (meet(a, b)) problems.push(`${where}: ${a.what} overlaps ${b.what}`); }));
          for (const a of [...m.left, ...m.middle, ...m.right]) if (a.l < m.face.l - 0.5 || a.r > m.face.r + 0.5) problems.push(`${where}: ${a.what} outside the island`);
          if (m.text.includes('…') || m.text !== m.text.trim()) problems.push(`${where}: cut or padded text`);
          if (m.item === 'weather' && !m.text.includes('°')) problems.push(`${where}: weather without its temperature`);
          // The working count shows with the time only; another item takes its place, in the middle.
          if (m.count.right === 'status' && m.item === 'time' && !m.count.shown) problems.push(`${where}: working count hidden with the time`);
          if (m.count.right === 'status' && m.item !== 'time' && !m.count.gone) problems.push(`${where}: working count shown beside ${m.item}`);
          // In the middle, unless only the free span off the middle holds its full name.
          const full = m.item === 'weather' ? PLACES[language] : m.item === 'audio' ? DEVICES[language].replace(/ \(.*\)$/, '') : null;
          if (m.count.right === 'status' && m.item !== 'time' && Math.abs(m.count.middle) > 2 && !(full && m.text.includes(full))) problems.push(`${where}: ${m.item} off the middle by ${m.count.middle.toFixed(1)} px`);
        }
      }
    }
    await page.close();
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(150);
  }, 300_000);
});
