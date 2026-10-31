import type { OfficeFeed } from './feed';

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * One office: the user's own office (public/ofis, generated from their
 * drawing) in a frame, fed with AgentOffice's data. A click on someone comes
 * back with where they are on screen and which part was clicked (balloon,
 * body or the right button), so the window can do what that part means.
 */
export type Part = 'balon' | 'govde' | 'menu';
export interface Ambient { kod: number | null; enlem: number | null; boylam: number | null; sakin: boolean; etiket: string }
export function createOfficeScene(host: HTMLElement, events: { select(id: string | undefined, rect?: Rect, part?: Part): void; escape(): void; day?(day: string | null): void; source?(sessionId: string): void; managerDesk?(rect?: Rect): void; makeManager?(sessionId: string): void }) {
  const frame = document.createElement('iframe');
  frame.className = 'office-frame'; frame.title = 'Ofis'; frame.src = '/ofis/index.html';
  host.append(frame);
  let ready = false, last: unknown, paused = false, around: unknown;
  const post = (message: unknown) => frame.contentWindow?.postMessage(message, location.origin);
  const onScreen = (r: Rect): Rect => { const box = frame.getBoundingClientRect(); return { x: box.left + r.x, y: box.top + r.y, w: r.w, h: r.h }; };
  const waiting = new Map<string, (rect?: Rect) => void>();
  const listen = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin || !event.data) return;
    const m = event.data as { type: string; id?: string | null; rect?: Rect | null; gun?: string | null; oturum?: string; part?: Part | null };
    if (m.type === 'ofis-ready') { ready = true; if (last) post(last); if (around) post(around); if (paused) post({ type: 'ofis-pause', on: true }); }
    else if (m.type === 'ofis-select') events.select(m.id || undefined, m.rect ? onScreen(m.rect) : undefined, m.part === 'balon' || m.part === 'govde' || m.part === 'menu' ? m.part : undefined);
    else if (m.type === 'ofis-escape') events.escape();
    // The wall board: another day asked for (null: today), or a line's chat to open in its app.
    else if (m.type === 'ofis-pano-gun') events.day?.(typeof m.gun === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.gun) ? m.gun : null);
    else if (m.type === 'ofis-pano-kaynak' && typeof m.oturum === 'string') events.source?.(m.oturum);
    // The big desk clicked (its manager picker), or a chat dropped on it (that chat becomes the manager).
    else if (m.type === 'ofis-yonetici-masa') events.managerDesk?.(m.rect ? onScreen(m.rect) : undefined);
    else if (m.type === 'ofis-yonetici' && typeof m.id === 'string') events.makeManager?.(m.id);
    else if (m.type === 'ofis-where' && m.id) { waiting.get(m.id)?.(m.rect ? onScreen(m.rect) : undefined); waiting.delete(m.id); }
  };
  window.addEventListener('message', listen);
  return {
    /** `settle`: the office is shown again after another one, so it opens as it is now instead of replaying the walks it missed. */
    update(data: OfficeFeed, chosen?: string, settle = false) { last = { type: 'ofis', data, chosen, settle }; if (ready) post(last); },
    /** The window's weather and daylight: the weather code (null: none known, then day and night only),
     *  the place's latitude and longitude (null: the time zone's), reduced motion, and the window's label. */
    ambient(a: Ambient) { around = { type: 'ofis-ortam', ...a }; if (ready) post(around); },
    /** The office window is hidden (nothing is drawn) or shown again. */
    pause(on: boolean) { paused = on; if (ready) post({ type: 'ofis-pause', on }); },
    /** Where someone is now (desk or coffee corner), in window coordinates. */
    where(id: string): Promise<Rect | undefined> {
      return new Promise(resolve => {
        if (!ready) { resolve(undefined); return; }
        waiting.set(id, resolve); post({ type: 'ofis-where', id });
        setTimeout(() => { if (waiting.delete(id)) resolve(undefined); }, 600);
      });
    },
    dispose() { window.removeEventListener('message', listen); waiting.forEach(resolve => resolve(undefined)); frame.remove(); },
  };
}
