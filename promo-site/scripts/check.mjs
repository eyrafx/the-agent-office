// Checks the built site in headless Chrome and saves screenshots: every section at desktop width,
// each live demo used once (question → office balloon, note, alarm, water, shelf, media, focus),
// and the page at phone width. Fails on console errors, page exceptions or sideways scrolling.
//
//   npm run build && npm run preview      (in site/, serves http://127.0.0.1:5181)
//   node scripts/check.mjs <out-dir>      (default: ../output/site-check)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const URL_ = process.env.SITE_URL || 'http://127.0.0.1:5181/';
const OUT = resolve(process.argv[2] || new URL('../../output/site-check', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
mkdirSync(OUT, { recursive: true });
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(p => p && existsSync(p));
const port = 9333 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'ao-site-check-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, nextId = 1; const waiting = new Map(), problems = [], log = [];
async function connect() {
  for (let i = 0; i < 50; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const page = list.find(t => t.type === 'page'); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; }); break; } } catch { /* not up yet */ }
    await sleep(200);
  }
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { const { ok, no } = waiting.get(m.id); waiting.delete(m.id); m.error ? no(new Error(m.error.message)) : ok(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') problems.push(`exception: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) problems.push(`console.${m.params.type}: ${m.params.args.map(a => a.value ?? a.description).join(' ')}`);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push(`log: ${m.params.entry.text} ${m.params.entry.url || ''}`);
  };
}
const send = (method, params = {}) => new Promise((ok, no) => { const id = nextId++; waiting.set(id, { ok, no }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(`${expr.slice(0, 80)}: ${r.exceptionDetails.exception?.description}`); return r.result.value; };
async function shot(name, clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: !!clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64')); log.push(`saved ${name}.png`);
}
async function viewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
}
async function load() { await send('Page.navigate', { url: URL_ }); await sleep(2500); }
async function scrollTo(selector, offset = 0) { await evaluate(`window.scrollTo({top: document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top + scrollY - ${offset}, behavior: 'instant'})`); await sleep(1800); }
async function sectionShot(name, selector) {
  const r = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: 0, y: b.top + scrollY, width: document.documentElement.clientWidth, height: Math.ceil(b.height) }; })()`);
  await shot(name, r);
}
// The centre of an element inside a live island (or the office), in page coordinates.
const point = (frame, selector, text = '') => evaluate(`(() => {
  const f = ${frame === 'office' ? `document.querySelector('.office-slot iframe')` : `document.querySelector('[data-island=${frame}] iframe')`};
  const els = [...f.contentDocument.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.getClientRects().length && (!${JSON.stringify(text)} || e.textContent.includes(${JSON.stringify(text)})));
  const el = els[0]; if (!el) return null;
  const r = el.getBoundingClientRect(), b = f.getBoundingClientRect(), s = b.width / f.offsetWidth;
  return { x: b.left + (r.left + r.width / 2) * s, y: b.top + (r.top + r.height / 2) * s };
})()`);
async function click(frame, selector, text) {
  const p = await point(frame, selector, text); if (!p) throw new Error(`not found in ${frame}: ${selector} ${text || ''}`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(500);
}
async function hover(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); }
// The open hero island must end above the headline.
const heroGap = () => evaluate(`(() => { const f = document.querySelector('[data-island=hero] iframe'), r = f.contentDocument.querySelector('.island-shape').getBoundingClientRect(), b = f.getBoundingClientRect(), s = b.width / f.offsetWidth; return Math.round(document.querySelector('#hero-title').getBoundingClientRect().top - (b.top + r.bottom * s)); })()`);
const terminalLine = () => evaluate(`document.querySelector('.office-slot iframe').contentDocument.body.textContent.includes('terminalde çalışıyor')`);
const overflow = () => evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);

async function main() {
  await connect();
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  // ——— with motion: the hero island opens by itself once, as for a new question ———
  await viewport(1440, 900); await load(); await sleep(1600);
  await shot('00-hero-kendiliginden-acilir');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); // steady frames for the pictures
  // ——— desktop ———
  await load();
  await shot('01-hero-kapali');
  await hover(720, 14); await sleep(1600); await shot('02-hero-acik');
  { const gap = await heroGap(); if (gap < 0) problems.push(`desktop: open hero island covers the headline by ${-gap}px`); else log.push(`desktop: open island ends ${gap}px above the headline`); }
  await hover(200, 600); await sleep(1200);
  for (const [name, sel] of [['03-ajanlar', '#ajanlar'], ['05-medya', '#medya'], ['06-notlar', '#notlar'], ['07-odak', '#odak'], ['08-alarmlar', '#alarmlar'], ['09-su', '#su'], ['10-raf', '#raf']]) { await scrollTo(sel, 40); await sectionShot(name, sel); }
  await scrollTo('#ofis', 40); await sleep(1500); await sectionShot('04-ofis', '#ofis');
  await scrollTo('.windows', 40); await sectionShot('11-windows', '.windows');
  await scrollTo('#indir', 80); await sectionShot('12-cta-footer', 'body > footer'); await sectionShot('12-cta', '#indir');
  if (await overflow() > 0) problems.push(`desktop: sideways scroll ${await overflow()}px`);

  // ——— the demos, used once each ———
  await scrollTo('#ajanlar', 40);
  await click('agents', 'button', 'Ofiste yanıtla'); await sleep(2500);
  if (await terminalLine()) problems.push('office card says the chat runs in a terminal'); else log.push('office card: no terminal line');
  await click('office', '.ask-opt', 'Kehribar'); await shot('20-ofis-balon-soru', await evaluate(`(() => { const b = document.querySelector('.office-window').getBoundingClientRect(); return { x: b.left, y: b.top + scrollY, width: b.width, height: b.height }; })()`));
  await click('office', 'button', 'Gönder'); await sleep(1200);
  const answered = await evaluate(`document.querySelector('#ofis .status').textContent`);
  if (!answered.includes('Kehribar')) problems.push('office answer did not reach the page'); else log.push(`answer: ${answered}`);
  await shot('21-ofis-balon-yanitlandi', await evaluate(`(() => { const b = document.querySelector('.office-stage').getBoundingClientRect(); return { x: 0, y: b.top + scrollY - 80, width: document.documentElement.clientWidth, height: b.height + 80 }; })()`));
  await scrollTo('#ajanlar', 40); await sectionShot('22-ajanlar-yanit-sonrasi', '#ajanlar');

  await scrollTo('#notlar', 40);
  if (!(await point('notes', '.compose-text'))) await click('notes', '.pg-primary');
  await click('notes', '.compose-text');
  await send('Input.insertText', { text: 'Demo videosunu kaydet' });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(800);
  const notes = await evaluate(`JSON.stringify(window.__aoHub.docs.notes)`);
  if (!notes.includes('Demo videosunu kaydet')) problems.push('note was not added'); else log.push('note added');
  await sectionShot('23-not-eklendi', '#notlar');

  await scrollTo('#alarmlar', 40);
  await click('alarms', '[data-new="alarm"]'); await sleep(600);
  await sectionShot('24-alarm-formu', '#alarmlar');
  await scrollTo('#alarmlar', 40); await click('alarms', '.ae-save'); await sleep(800);
  log.push('alarm feedback: ' + await evaluate(`(document.querySelector('[data-island=alarms] iframe').contentDocument.querySelector('.notch-feedback')?.textContent || '-')`));
  const alarms = await evaluate(`window.__aoHub.reminders.length`);
  if (alarms < 2) problems.push('alarm was not saved'); else log.push(`alarms: ${alarms}`);
  await sectionShot('25-alarm-kuruldu', '#alarmlar');

  await scrollTo('#su', 40);
  await click('water', '.w-drink'); await sleep(900);
  const water = await evaluate(`window.__aoHub.docs.water.log.length`);
  if (water < 3) problems.push('water drink was not logged'); else log.push(`water log: ${water}`);
  await sectionShot('26-su-icildi', '#su');

  await scrollTo('#raf', 40);
  await evaluate(`document.querySelector('[data-put="sunum-taslagi.pdf"]').click(), document.querySelector('[data-put="ana-ekran.png"]').click()`); await sleep(1200);
  const shelf = await evaluate(`window.__aoHub.docs.shelf.items.length`);
  if (shelf < 2) problems.push('shelf did not take the files'); else log.push(`shelf: ${shelf}`);
  // A sample file dropped on the island (headless Chrome cannot start a real drag, so the drop
  // events are sent with the same data a drag from the page carries).
  await evaluate(`(() => { const w = document.querySelector('[data-island=shelf] iframe').contentWindow, dt = new w.DataTransfer();
    dt.setData('application/x-agentoffice-demo', 'C:' + String.fromCharCode(92) + 'Örnek' + String.fromCharCode(92) + 'toplanti-notlari.txt');
    for (const t of ['dragenter', 'dragover', 'drop']) w.document.querySelector('.island-shape').dispatchEvent(new w.DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true })); })()`);
  await sleep(900);
  const dropped = await evaluate(`window.__aoHub.docs.shelf.items.map(i => i.path.slice(i.path.lastIndexOf(String.fromCharCode(92)) + 1)).join(', ')`);
  if (!dropped.includes('toplanti-notlari.txt')) problems.push(`drag and drop onto the shelf: ${dropped}`); else log.push(`shelf after drop: ${dropped}`);
  await sectionShot('27-raf-dosyalar', '#raf');

  await scrollTo('#medya', 40);
  await click('media', '[data-c="toggle"]'); await sleep(500);
  const paused = await evaluate(`window.__aoHub.media[0].status`);
  await click('media', '[data-c="next"]'); await sleep(700);
  const track = await evaluate(`window.__aoHub.media[0].title`);
  if (paused !== 'paused' || track !== 'Kahve ve Kod') problems.push(`media controls: ${paused} / ${track}`); else log.push(`media: ${paused}, next → ${track}`);
  await sectionShot('28-medya-sonraki', '#medya');

  await scrollTo('#odak', 40);
  await click('focus', '.focus-play'); await sleep(1200);
  const focus = await evaluate(`JSON.stringify(window.__aoHub.docs.focus || null)`);
  log.push(`focus: ${focus.slice(0, 120)}`);
  await sectionShot('29-odak-basladi', '#odak');

  await scrollTo('#ajanlar', 40);
  await evaluate(`document.querySelector('[data-action="ask"]').click()`); await sleep(1200);
  const pending = await evaluate(`window.__aoHub.snapshot.requests.filter(r => r.status === 'pending').length`);
  if (!pending) problems.push('new question did not arrive'); else log.push(`new question pending: ${pending}`);
  await sectionShot('30-yeni-soru', '#ajanlar');

  // ——— phone ———
  await viewport(375, 812, true); await load();
  await shot('40-mobil-hero');
  // A tap opens the hero island and it stays open; a tap elsewhere closes it.
  const tap = async (x, y) => { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(60); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const heroOpen = () => evaluate(`document.querySelector('[data-island=hero] iframe').contentDocument.querySelector('#app').classList.contains('expanded')`);
  const cap = await evaluate(`(() => { const f = document.querySelector('[data-island=hero] iframe'), r = f.contentDocument.querySelector('.capsule-face').getBoundingClientRect(), b = f.getBoundingClientRect(), s = b.width / f.offsetWidth; return { x: b.left + (r.left + r.width / 2) * s, y: b.top + (r.top + r.height / 2) * s }; })()`);
  await tap(cap.x, cap.y); await sleep(1500);
  const opened = await heroOpen(); await shot('40b-mobil-hero-acik');
  { const gap = await heroGap(); if (gap < 0) problems.push(`phone: open hero island covers the headline by ${-gap}px`); else log.push(`phone: open island ends ${gap}px above the headline`); }
  await tap(180, 700); await sleep(1200);
  const closed = !(await heroOpen());
  if (!opened || !closed) problems.push(`phone hero tap: opened ${opened}, closed after outside tap ${closed}`); else log.push('phone hero: tap opens, tap outside closes');
  if (await overflow() > 0) problems.push(`phone: sideways scroll ${await overflow()}px`);
  for (const [name, sel] of [['41-mobil-ajanlar', '#ajanlar'], ['42-mobil-ofis', '#ofis'], ['43-mobil-medya', '#medya'], ['44-mobil-notlar', '#notlar'], ['45-mobil-raf', '#raf'], ['46-mobil-windows', '.windows'], ['47-mobil-cta', '#indir']]) { await scrollTo(sel, 20); await sectionShot(name, sel); }
  if (await overflow() > 0) problems.push(`phone (after all frames): sideways scroll ${await overflow()}px`);
  const gutter = await evaluate(`(() => { const r = document.querySelector('#ajanlar .copy').getBoundingClientRect(); return [Math.round(r.left), Math.round(document.documentElement.clientWidth - r.right)]; })()`);
  log.push(`phone gutters: ${gutter.join(' / ')} px`);

  // ——— tablet ———
  await viewport(820, 1180, true); await load();
  await shot('50-tablet-hero');
  await hover(410, 14); await sleep(1600);
  { const gap = await heroGap(); if (gap < 0) problems.push(`tablet: open hero island covers the headline by ${-gap}px`); else log.push(`tablet: open island ends ${gap}px above the headline`); }
  await shot('51-tablet-hero-acik');
  if (await overflow() > 0) problems.push(`tablet: sideways scroll ${await overflow()}px`);
}

main().then(() => {
  writeFileSync(join(OUT, 'kontrol.txt'), [...log, '', problems.length ? 'SORUNLAR:' : 'Sorun yok: konsol hatası, sayfa istisnası ya da yana kaydırma görülmedi.', ...problems].join('\n'));
  console.log(log.join('\n')); console.log(problems.length ? `\nPROBLEMS:\n${problems.join('\n')}` : '\nno problems');
}).catch(e => { console.error(e); problems.push(String(e)); process.exitCode = 1; }).finally(() => { try { ws?.close(); } catch { /* closed */ } chrome.kill(); if (problems.length) process.exitCode = 1; });
