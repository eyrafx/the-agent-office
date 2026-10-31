// One live island: the app's own notch (app/src/notch/view.ts) mounted with the demo bridge.
// Query: ?id=<frame> &page=<page to show> &pin=1 (open and held open) &glass=0 (no live glass).
import type { PageId } from '@app/shared/contract';
import { createDemoBridge } from './demo/bridge';
import { getHub } from './demo/hub';

const params = new URLSearchParams(location.search);
const id = params.get('id') || 'island';
const page = params.get('page') as PageId | null;
const pin = params.get('pin') === '1';
const root = document.querySelector<HTMLElement>('#app')!;
type Host = { __aoBackdrop?: (frame: Element) => Promise<{ blob: Blob; w: number; h: number } | null> };
type NotchHooks = { page(id: string): void; open(): void; close(): void; shelfDrop(paths: string[]): void; shelfOver(on: boolean): void };

/**
 * The app draws its smoked glass from a picture of what lies behind the island (the desktop).
 * Here the host page hands over the picture behind this frame (its wallpaper), through the same
 * request the app makes to its shell, so the island's own glass shader runs unchanged.
 */
function liveGlass(): boolean {
  if (params.get('glass') === '0') return false;
  let host: Host;
  try { host = window.parent as unknown as Host; if (!host.__aoBackdrop || !window.frameElement) return false; } catch { return false; }
  const hub = getHub();
  let seq = 0, waiting: (() => void) | null = null;
  // A new picture when the host says the wallpaper behind this frame changed.
  hub.on('frame', m => { const msg = m as { type?: string; frame?: string }; if (msg.type === 'backdrop' && (msg.frame === id || msg.frame === '*')) { seq++; const w = waiting; waiting = null; w?.(); } });
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('http://backdrop.localhost/frame')) return real(input, init);
    const after = Number(new URL(url).searchParams.get('after')) || 0;
    if (after >= seq + 1) await new Promise<void>(resolve => { waiting = resolve; });
    const shot = await host.__aoBackdrop!(window.frameElement!);
    if (!shot) return new Response(null, { status: 204, headers: { 'X-Idle': '1' } });
    const dpr = window.devicePixelRatio || 1;
    return new Response(shot.blob, { status: 200, headers: { 'X-Seq': String(seq + 1), 'X-Rect': `0,0,${Math.round(shot.w * dpr)},${Math.round(shot.h * dpr)}` } });
  };
  // view.ts turns the glass on only inside the app; this frame plays that part for it.
  (window as unknown as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ = {};
  return true;
}

async function boot() {
  const glass = liveGlass();
  const { bridge, hooks } = createDemoBridge(id);
  const hub = getHub();
  const { mountNotch } = await import('@app/notch/view');
  mountNotch(root, bridge);
  const notch = (window as unknown as { __notch: NotchHooks }).__notch;
  // The island's outline for the host page (it cuts this frame to it, as the app's window region
  // does). Followed through every size change, including while this frame was off screen.
  const island = root.querySelector<HTMLElement>('.island-shape')!, panel = root.querySelector<HTMLElement>('.limits-shape')!;
  const sendShape = () => {
    const rects = [island.getBoundingClientRect()];
    if (root.classList.contains('limits-open')) rects.push(panel.getBoundingClientRect());
    hub.emit('frame', { type: 'shape', frame: id, rects: rects.map(r => ({ x: r.x, y: r.y, w: r.width, h: r.height })) });
  };
  // The glass is redrawn by the island's own animation loop, which the browser pauses for a frame
  // that is off screen; once its size settles, a fresh backdrop makes it draw again.
  let settle: ReturnType<typeof setTimeout> | undefined;
  const settled = () => { clearTimeout(settle); settle = setTimeout(() => hub.emit('frame', { type: 'backdrop', frame: id }), 140); };
  new ResizeObserver(() => { sendShape(); settled(); }).observe(island); new ResizeObserver(sendShape).observe(panel);
  new MutationObserver(sendShape).observe(root, { attributes: true, attributeFilter: ['class'] });
  document.documentElement.classList.toggle('demo-glass', glass);
  if (page) notch.page(page);
  if (pin) setTimeout(() => hooks.pin(true), 60);
  // A finger has no hover: a tap opens the hero island and keeps it open until a tap elsewhere.
  // The tap that opens it is not also a press on whatever grows under the finger (the page dots).
  if (!pin) {
    let swallow = false;
    root.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse' && !root.classList.contains('expanded')) swallow = true; }, true);
    root.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') hooks.pin(true); });
    root.addEventListener('click', e => { if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); } }, true);
    root.addEventListener('pointercancel', () => { swallow = false; });
  }
  // The host page drives this island the way the app's shell would: a page, a reveal, a dropped file.
  hub.on('frame', m => {
    const msg = m as { type?: string; frame?: string; page?: PageId; paths?: string[]; on?: boolean };
    if (msg.frame !== id && msg.frame !== '*') return;
    if (msg.type === 'page' && msg.page) notch.page(msg.page);
    else if (msg.type === 'reveal') hooks.reveal({ holdMs: 6000, inside: false, alert: false, page: msg.page ?? null });
    else if (msg.type === 'pin') { hooks.pin(!!msg.on); if (!msg.on) notch.close(); }
    else if (msg.type === 'drop' && msg.paths) { notch.page('shelf'); hooks.pin(true); notch.shelfDrop(msg.paths); }
  });
  // Files dragged onto the island from the page (the demo's sample files) or from the computer
  // (only the name is used, in memory): it opens on the shelf and takes them, as in the app.
  let overTimer: ReturnType<typeof setTimeout> | undefined;
  const over = (on: boolean) => { clearTimeout(overTimer); notch.shelfOver(on); };
  addEventListener('dragenter', event => { event.preventDefault(); });
  addEventListener('dragover', event => {
    event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    if (!document.documentElement.classList.contains('drag-in')) { document.documentElement.classList.add('drag-in'); notch.page('shelf'); hooks.pin(true); }
    over(true); overTimer = setTimeout(() => { document.documentElement.classList.remove('drag-in'); notch.shelfOver(false); }, 400);
  });
  addEventListener('drop', event => {
    event.preventDefault(); document.documentElement.classList.remove('drag-in'); over(false);
    const dt = event.dataTransfer; if (!dt) return;
    const sample = dt.getData('application/x-agentoffice-demo');
    const names = sample ? sample.split('\n') : [...dt.files].map(f => f.name);
    if (names.length) notch.shelfDrop(names.map(n => /[\\/]/.test(n) ? n : `C:\\Örnek\\Masaüstü\\${n}`));
  });
  hub.emit('frame', { type: 'ready', frame: id });
}
boot().catch(error => { root.textContent = 'Ada açılamadı: ' + String(error); console.error(error); });
