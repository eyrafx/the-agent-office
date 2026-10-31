// The capture lab: the site's live island and office frames on a see-through page, driven by
// capture.mjs one state at a time so each can be filmed as its own layer (island with alpha).
import { paint, PALETTES } from '../../promo-site/src/wall';
import { getHub } from '../../promo-site/src/demo/hub';
import { themeQuestion } from '../../promo-site/src/demo/fixture';
import type { SessionKey } from '@app/shared/contract';
import { GLASS_WALL } from './palettes';

const hub = getHub();
const params = new URLSearchParams(location.search);
const lang = params.get('lang') || 'tr';
hub.settings = { ...hub.settings, language: lang as never, ...(params.get('theme') === 'dark' ? { islandTheme: 'dark' as const } : {}) };
hub.snapshot.requests = [];
const session = (id: string) => hub.snapshot.sessions.find(s => s.key.sessionId === id)!;
const theme = session('lumen-theme');
theme.status = 'working'; theme.summary = 'Renk paleti hazırlanıyor';

// The English film shows English made-up data too (the site's fixture is Turkish and read-only, so
// it is translated here, in the lab's own copy of the demo world).
const EN = lang === 'en';
const NAMES: Record<string, string> = { 'Yönetici': 'Lead', 'Ödeme sayfası': 'Checkout page', 'Karanlık tema': 'Dark theme', 'Arama dizini': 'Search index', 'Belge çevirisi': 'Docs translation', 'Hız ölçümü': 'Speed check', 'API sözleşmesi': 'API contract', 'Veri taşıma': 'Data migration' };
const LINES: Record<string, string> = {
  'Ekibin planı güncelleniyor': 'Updating the team plan', 'Sürüm notları hazır': 'Release notes ready', 'Form doğrulaması yazılıyor': 'Writing form validation',
  'Sorusuna yanıt bekliyor': 'Waiting for your answer', 'Testler koşuyor': 'Running tests', 'Yanıt tamamlandı': 'Reply finished', 'Kılavuzun üç bölümü çevrildi': 'Three guide chapters translated',
  'Boşta': 'Idle', 'Açılış 1,2 sn kısaldı': 'Startup 1.2 s faster', 'Uç noktalar gözden geçiriliyor': 'Reviewing endpoints', 'Taşıma betiği denendi': 'Migration script tested',
  'Renk paleti hazırlanıyor': 'Preparing the colour palette',
};
const OPTS: Record<string, [string, string]> = { 'Kehribar': ['Amber', 'Warm, matches the mascot'], 'Okyanus': ['Ocean', 'Cool and calm'], 'Nane': ['Mint', 'Fresh, high contrast'] };
const tr = (s?: string) => s && (LINES[s] ?? s.replace(/^Yanıt: (.+) · tema uygulanıyor$/, 'Answer: $1 · applying the theme'));
function english() {
  if (!EN) return;
  for (const s of hub.snapshot.sessions) {
    s.name = NAMES[s.name] ?? s.name; s.summary = tr(s.summary)!; s.reply = tr(s.reply);
    if (s.office === 'Pusula') { s.office = 'Compass'; s.project = 'Compass'; }
  }
  for (const r of hub.snapshot.requests) {
    const q = 'Which accent colour for the dark theme?';
    r.title = q; r.detail = q; r.options = r.options?.map(o => OPTS[o]?.[0] ?? o);
    r.questions = r.questions?.map(x => ({ ...x, question: q, header: 'Accent', options: x.options.map(o => OPTS[o.label] ? { label: OPTS[o.label][0], description: OPTS[o.label][1] } : o) }));
  }
  for (const c of hub.snapshot.connections) c.detail = 'Demo connection';
  for (const l of hub.snapshot.limits) l.plan = 'Demo plan';
  hub.worklog = hub.worklog.map(w => ({ ...w, chat: NAMES[w.chat] ?? w.chat, text: tr(w.text)!, office: w.office === 'Pusula' ? 'Compass' : w.office, project: w.project === 'Pusula' ? 'Compass' : w.project }));
}
if (EN) {
  english();
  // The pages' own made-up content: notes, the alarm, the song.
  const NOTES: Record<string, string> = { 'Sürüm notlarını gözden geçir': 'Review the release notes', 'Ekran görüntülerini yenile': 'Refresh the screenshots', 'Arama dizini için önbellek fikri: sorguları 5 dk tut.': 'Search index cache idea: keep queries for 5 min.' };
  const notes = hub.docs.notes as { items: { text: string }[] } | undefined;
  notes?.items.forEach(n => { n.text = NOTES[n.text] ?? n.text; });
  hub.reminders = hub.reminders.map(r => ({ ...r, title: r.title === 'Günaydın' ? 'Good morning' : r.title }));
  hub.media = hub.media.map(m => ({ ...m, app: 'Demo player', title: 'Night Shift', artist: 'Shoreline Wave', album: 'Quiet Hours' }));
  // Every change (the bridge's own answer line included) is translated before anyone sees it.
  const publish = hub.publish.bind(hub);
  hub.publish = () => { english(); publish(); };
  hub.emit('worklog', hub.worklog);
}

// The glass is drawn from a dark wallpaper (the film's backdrop), never shown itself.
PALETTES.film = { base: ['#0b0a12', '#050608'], blobs: [[.5, -.12, .42, '#ff9a3d', .42], [.14, .3, .5, '#5a23b8', .36], [.88, .38, .46, '#0f7f8a', .3], [.55, .85, .6, '#2b1250', .45]] };
const wall = document.querySelector<HTMLCanvasElement>('canvas.wall')!;
// The glass beat is filmed over a calm, colourful wallpaper (the film shows the same one).
if (params.get('backdrop') === 'color') PALETTES.film = GLASS_WALL;
paint(wall, 'film');
(window as unknown as { __aoBackdrop: (frame: Element) => Promise<{ blob: Blob; w: number; h: number } | null> }).__aoBackdrop = async frame => {
  const el = frame as HTMLIFrameElement, w = el.offsetWidth, h = el.offsetHeight;
  const out = document.createElement('canvas'); out.width = Math.round(w * .7); out.height = Math.round(h * .7);
  const g = out.getContext('2d')!;
  g.drawImage(wall, (1920 - w) / 2, 0, w, h, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>(r => out.toBlob(r, 'image/jpeg', .9));
  return blob ? { blob, w, h } : null;
};

const ready = new Set<string>();
hub.on('frame', m => { const msg = m as { type?: string; frame?: string }; if (msg.type === 'ready' && msg.frame) ready.add(msg.frame); });
const until = (fn: () => boolean) => new Promise<void>(resolve => { const t = setInterval(() => { if (fn()) { clearInterval(t); resolve(); } }, 50); });

const island = document.createElement('iframe'); island.id = 'island'; island.width = '1260'; island.height = '500';
island.src = `/promo/island.html?id=hero${lang !== 'tr' ? `&lang=${lang}` : ''}`;
document.body.append(island);
// The site's office page keeps Turkish in its in-memory storage (it would reload itself forever
// into another language), so other languages use the same page with that one word changed (vite.config.mjs).
const office = document.createElement('iframe'); office.id = 'office';
if (params.get('office') !== '0') { office.src = lang === 'tr' ? '/office.html' : `/promo/office.html?lang=${lang}`; document.body.append(office); }

type Notch = { open(): void; close(): void; page(id: string): void; limits(open: boolean): void; shelfDrop(p: string[]): void; shelfOver(on: boolean): void };
const notch = () => (island.contentWindow as unknown as { __notch: Notch }).__notch;
const doc = () => island.contentDocument!;
const rectOf = (frame: HTMLIFrameElement, sel: string[]) => {
  const f = frame.getBoundingClientRect();
  const rs = sel.map(s => frame.contentDocument!.querySelector(s)).filter((e): e is Element => !!e && !!e.getBoundingClientRect().width).map(e => e.getBoundingClientRect());
  const x0 = Math.min(...rs.map(r => r.left)), y0 = Math.min(...rs.map(r => r.top)), x1 = Math.max(...rs.map(r => r.right)), y1 = Math.max(...rs.map(r => r.bottom));
  return { x: f.left + x0, y: f.top + y0, w: x1 - x0, h: y1 - y0 };
};

const lab = {
  hub, island, office, notch,
  get ready() { return ready.has('hero') && (params.get('office') === '0' || ready.has('office')); },
  emit: (msg: Record<string, unknown>) => hub.emit('frame', { frame: 'hero', ...msg }),
  /** The island's outline on the page (plus the limits panel when it is out). */
  islandRect: () => rectOf(island, ['.island-shape', ...(doc().querySelector('#app')!.classList.contains('limits-open') ? ['.limits-shape'] : [])]),
  officeRect: (sel = 'body') => sel === 'body' ? { x: 0, y: 540, w: 1180, h: 708 } : rectOf(office, [sel]),
  ask() {
    const now = Date.now();
    hub.snapshot.requests = [themeQuestion(now, 1)];
    theme.status = 'waiting'; theme.summary = 'Sorusuna yanıt bekliyor'; theme.lastActivity = now;
    hub.publish();
  },
  select(id: string) { const key: SessionKey = session(id).key; hub.emit('frame', { type: 'select', frame: 'office', key }); },
  /** A working agent stops: in the office it gets up and walks to the coffee machine. */
  idle(id: string) { const s = session(id); s.status = 'idle'; s.summary = 'Boşta'; s.lastActivity = Date.now(); hub.publish(); },
  click(frame: 'island' | 'office', sel: string) { (frame === 'island' ? doc() : office.contentDocument!).querySelector<HTMLElement>(sel)?.click(); },
  /** The window's sky: a weather code as the island would read it (null: none), at a longitude where
   *  the sun now stands `sun` degrees high (the office draws day, dusk and night from the sun's height). */
  sky(code: number | null, sun: 'day' | 'dusk' | 'night') {
    const elev = (lon: number) => { const r = Math.PI / 180, d = Date.now() / 86400000 - 10957.5, g = (357.529 + 0.98560028 * d) * r, q = 280.459 + 0.98564736 * d, L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * r, e = (23.439 - 0.00000036 * d) * r, dek = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), h = ((280.46061837 + 360.98564736629 * d + lon) * r - ra); return Math.asin(Math.sin(41 * r) * Math.sin(dek) + Math.cos(41 * r) * Math.cos(dek) * Math.cos(h)) / r; };
    const score = (e: number) => sun === 'day' ? -e : sun === 'night' ? e : Math.abs(e - 1);
    let lon = 0; for (let x = -180; x <= 180; x += .5) if (score(elev(x)) < score(elev(lon))) lon = x;
    hub.settings = { ...hub.settings, statusWeather: code !== null, weatherPlace: { ...hub.settings.weatherPlace!, latitude: 41, longitude: lon } };
    hub.status = { ...hub.status, weather: code === null ? null : { temperature: 21, code, place: 'İzmir', at: Date.now() } } as typeof hub.status;
    hub.emit('settings', structuredClone(hub.settings)); hub.emit('status', structuredClone(hub.status));
  },
  /** The shell's system sign on the closed island (volume, Caps Lock, keyboard language). */
  sign(sign: { kind: string; text: string; value?: number | null; on?: boolean | null }) { hub.emit('frame', { type: 'sign', frame: 'hero', sign }); },
  /** How the closed island rests: 'capsule', or 'line' (the thin breathing line over a full screen). */
  dock(mode: 'capsule' | 'line') { hub.emit('frame', { type: 'dock', frame: 'hero', mode }); },
  /** The pointer comes over the island: it opens the way a hover does. */
  hover() { hub.emit('frame', { type: 'hover', frame: 'hero' }); },
  /** The office scene's season, forced the way the office allows ('ilkbahar' | 'yaz' | 'sonbahar' | 'kis'; null: by date). */
  season(mevsim: string | null) {
    const scene = office.contentDocument?.querySelector<HTMLIFrameElement>('iframe.office-frame');
    scene?.contentWindow?.postMessage({ type: 'ofis-mevsim', mevsim }, location.origin);
  },
  /** The season the office scene now draws (its html[data-mevsim]). */
  seasonNow() { return office.contentDocument?.querySelector<HTMLIFrameElement>('iframe.office-frame')?.contentDocument?.documentElement.dataset.mevsim ?? null; },
  /** The island's look: 'dark' (solid black) or 'glass' (frosted, drawn from the wallpaper). */
  theme(look: 'dark' | 'glass') { hub.settings = { ...hub.settings, islandTheme: look }; hub.emit('settings', structuredClone(hub.settings)); },
  ring() {
    hub.reminders = hub.reminders.map(r => ({ ...r, ringing: true, rung: Date.now() }));
    hub.emit('reminders', structuredClone(hub.reminders));
  },
  until,
};
(window as unknown as { __lab: typeof lab }).__lab = lab;
