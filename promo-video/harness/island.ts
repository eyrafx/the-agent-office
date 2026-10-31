// The lab's live island: the same as the site's (promo-site/src/island.ts, read-only), the app's own
// notch with the demo bridge, plus the two things the demo bridge never sends: the shell's system
// signs (volume, Caps Lock, keyboard language) and its resting look (the thin line over a full
// screen). capture.mjs sends them through the shared demo world, as the app's shell would.
import type { PageId, RestLook, Sign } from '@app/shared/contract';
import { createDemoBridge } from '../../promo-site/src/demo/bridge';
import { getHub } from '../../promo-site/src/demo/hub';

const params = new URLSearchParams(location.search);
const id = params.get('id') || 'island';
const root = document.querySelector<HTMLElement>('#app')!;
type Host = { __aoBackdrop?: (frame: Element) => Promise<{ blob: Blob; w: number; h: number } | null> };
type NotchHooks = { page(id: string): void; open(): void; close(): void; shelfDrop(paths: string[]): void; shelfOver(on: boolean): void };

/** The island's glass, drawn from the host page's wallpaper (as on the site). */
function liveGlass(): boolean {
  let host: Host;
  try { host = window.parent as unknown as Host; if (!host.__aoBackdrop || !window.frameElement) return false; } catch { return false; }
  const hub = getHub();
  let seq = 0, waiting: (() => void) | null = null;
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
  (window as unknown as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ = {};
  return true;
}

async function boot() {
  const glass = liveGlass();
  const { bridge: demo, hooks } = createDemoBridge(id);
  const hub = getHub();
  const signs = new Set<(s: Sign) => void>(), docks = new Set<(m: RestLook) => void>();
  const bridge = new Proxy(demo, {
    get(target, name, receiver) {
      if (name === 'onSign') return async (cb: (s: Sign) => void) => { signs.add(cb); return () => { signs.delete(cb); }; };
      if (name === 'onNotchDock') return async (cb: (m: RestLook) => void) => { docks.add(cb); return () => { docks.delete(cb); }; };
      if (name === 'indicatorsSupported') return async () => ['volume', 'caps', 'language'];
      return Reflect.get(target, name, receiver);
    },
  });
  const { mountNotch } = await import('@app/notch/view');
  mountNotch(root, bridge);
  // The film shows the island as it is used: no "demo data" note in its footer.
  const quiet = document.createElement('style'); quiet.textContent = '.foot-note.demo { visibility: hidden; }'; document.head.append(quiet);
  const notch = (window as unknown as { __notch: NotchHooks }).__notch;
  const island = root.querySelector<HTMLElement>('.island-shape')!;
  let settle: ReturnType<typeof setTimeout> | undefined;
  new ResizeObserver(() => { clearTimeout(settle); settle = setTimeout(() => hub.emit('frame', { type: 'backdrop', frame: id }), 140); }).observe(island);
  document.documentElement.classList.toggle('demo-glass', glass);
  hub.on('frame', m => {
    const msg = m as { type?: string; frame?: string; page?: PageId; paths?: string[]; on?: boolean; sign?: Sign; mode?: RestLook };
    if (msg.frame !== id && msg.frame !== '*') return;
    if (msg.type === 'page' && msg.page) notch.page(msg.page);
    else if (msg.type === 'pin') { hooks.pin(!!msg.on); if (!msg.on) notch.close(); }
    else if (msg.type === 'hover') notch.open();
    else if (msg.type === 'sign' && msg.sign) signs.forEach(cb => cb(msg.sign!));
    else if (msg.type === 'dock' && msg.mode) docks.forEach(cb => cb(msg.mode!));
  });
  hub.emit('frame', { type: 'ready', frame: id });
}
boot().catch(error => { root.textContent = 'Ada açılamadı: ' + String(error); console.error(error); });
