// The film: a deterministic page. `seek(t)` draws the exact frame at t seconds (no clocks, no live
// animation), so render.mjs can photograph it frame by frame. Every picture of the product is a
// layer captured from the real island and office (capture.mjs → assets/); the other windows on the
// desktop (a browser, an editor, a presentation, a message) are generic, unbranded and made up.
//
// Direction: calm, product-first, the island is the hero. An intro on the island, an act of its
// features (opening, its pages, music, sitting over other apps, the thin breathing line over a full
// screen, system signs, the shelf), then the agents and the office, and the end card. Each shot has
// one slow eased camera move; cuts and dissolves sit on the music's beats (72 BPM, audio.mjs). One
// typeface, few words, short fades. No sound effects, no whips, no glows on the product.
// Query: ?lang=tr|en  &format=wide|tall (1920×1080 or 1080×1350)

import { paint, PALETTES } from '../../promo-site/src/wall';
import { GLASS_WALL, GLASS_ORIGIN } from './palettes';

type Clip = { kind: 'clip'; w: number; h: number; seconds: number; times: number[]; ext?: string };
type Still = { kind: 'still'; w: number; h: number; ext?: string };
const ASSETS: string = (window as unknown as { __ASSETS: string }).__ASSETS;
const M: Record<string, Clip | Still> = await fetch(`${ASSETS}manifest.json`, { cache: 'no-store' }).then(r => r.json());
const params = new URLSearchParams(location.search);
const LANG = params.get('lang') === 'en' ? 'en' : 'tr';
const TALL = params.get('format') === 'tall';
/** ?part=apps renders one section on its own (a preview for approval). */
const PART = params.get('part') || '';
const W = TALL ? 1080 : 1920, H = TALL ? 1350 : 1080, MID = W / 2;
const film = document.getElementById('film')!;
film.style.width = `${W}px`; film.style.height = `${H}px`; film.classList.toggle('tall', TALL);
document.body.style.width = `${W}px`; document.body.style.height = `${H}px`;
/** The island and office were filmed in each language (their UI and the made-up data). */
const A = (name: string) => [LANG === 'en' ? `${name}-en-dark` : '', `${name}-dark`, LANG === 'en' ? `${name}-en` : '', name].find(n => n && M[n])!;

// ——— words: the film's language only ———
/** The product's site, the same in every cut (no scheme, as people type it). */
const SITE = 'eyrafx.github.io/the-agent-office';
const TEXT = {
  tr: {
    top: 'Ajanların, ekranın tepesinde.',
    strip: 'Kapalıyken de: saat, pil, hava.',
    hover: 'Üstüne gel, ada açılır.',
    pages: ['Notlar', 'Alarmlar', 'Su', 'Odak'],
    media: 'Çalan müzik, kapağı ve ilerleyişiyle.',
    glass: 'İstersen cam: arkası buzlu görünür.',
    apps: 'Her uygulamanın üstünde.',
    line: 'Tam ekranda ince bir çizgi olur, nefes alır.',
    signs: 'Ses, Caps Lock, klavye dili.',
    shelf: 'Dosyayı rafa bırak, istediğin yere sürükle.',
    ask: 'Bir ajan sorunca, ada haber verir.',
    answer: 'Yanıtı ofisten ver.',
    window: 'Pencerede gün, hava ve mevsim.',
    title: 'AgentOffice', tagline: 'Claude Code ve Codex ajanların için.', platforms: 'Windows · macOS yakında',
    // The made-up windows on the desktop.
    browser: { tab: 'Proje planı', url: 'ornek.test/plan', h: 'Sürüm 2.4 planı', items: ['Arama dizini önbelleği', 'Karanlık tema', 'Ödeme formu doğrulaması', 'Belge çevirisi'] },
    editor: { title: 'notlar.md', lines: ['# Bu hafta', '- Sürüm notlarını gözden geçir', '- Ekran görüntülerini yenile', '- Önbellek: sorguları 5 dk tut'] },
    slide: { title: 'Çeyrek değerlendirmesi', sub: 'Ekip sunumu · Ekim', page: '4 / 12' },
    mail: { title: 'Yeni mesaj', to: 'Kime', toV: 'ekip@ornek.test', subj: 'Konu', subjV: 'Sunum taslağı', body: 'Merhaba, taslağı ekledim. Yarınki toplantıdan önce bakabilir misiniz?', file: 'sunum-taslagi.pdf' },
  },
  en: {
    top: 'Your agents, at the top of your screen.',
    strip: 'Even closed: time, battery, weather.',
    hover: 'Hover, and it opens.',
    pages: ['Notes', 'Alarms', 'Water', 'Focus'],
    media: 'What’s playing, with cover and progress.',
    glass: 'Or glass: frosted, see-through.',
    apps: 'On top of every app.',
    line: 'Full screen? It becomes a thin, breathing line.',
    signs: 'Volume, Caps Lock, keyboard language.',
    shelf: 'Drop files on the shelf, drag them anywhere.',
    ask: 'When an agent asks, the island lets you know.',
    answer: 'Answer right from the office.',
    window: 'A window with your day, weather and season.',
    title: 'AgentOffice', tagline: 'For your Claude Code and Codex agents.', platforms: 'Windows · macOS coming soon',
    browser: { tab: 'Project plan', url: 'example.test/plan', h: 'Release 2.4 plan', items: ['Search index cache', 'Dark theme', 'Checkout form validation', 'Docs translation'] },
    editor: { title: 'notes.md', lines: ['# This week', '- Review the release notes', '- Refresh the screenshots', '- Cache: keep queries for 5 min'] },
    slide: { title: 'Quarterly review', sub: 'Team presentation · October', page: '4 / 12' },
    mail: { title: 'New message', to: 'To', toV: 'team@example.test', subj: 'Subject', subjV: 'Presentation draft', body: 'Hi, the draft is attached. Could you take a look before tomorrow’s meeting?', file: 'presentation-draft.pdf' },
  },
}[LANG];

// ——— time: every cut sits on a beat of the music ———
export const BPM = 72;
const BEAT = 60 / BPM;
const B = (n: number) => n * BEAT;
const T = { hero: 0, hover: B(9), pages: B(13), media: B(22), glass: B(25), apps: B(28), line: B(38), signs: B(42), shelf: B(47), ask: B(52), office: B(56), window: B(61), end: B(65), out: B(72) };
let DURATION = T.out;
const DISSOLVE = .7;

// ——— motion ———
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const mix = (a: number, b: number, x: number) => a + (b - a) * x;
const sine = (x: number) => -(Math.cos(Math.PI * clamp(x)) - 1) / 2;
const out = (x: number) => 1 - (1 - clamp(x)) ** 3;

// ——— layers ———
const pending: Promise<unknown>[] = [];
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = '') => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; parent.append(e); return e; };
function setSrc(img: HTMLImageElement, src: string) {
  if (img.dataset.src === src) return;
  img.dataset.src = src; img.src = src; pending.push(img.decode().catch(() => {}));
}
function srcAt(name: string, t: number) {
  const a = M[name]; if (!a) throw new Error(`no asset ${name}`);
  const ext = a.ext ?? 'webp';
  if (a.kind !== 'clip') return `${ASSETS}${name}.${ext}`;
  const times = a.times; let lo = 0, hi = times.length - 1;
  if (t <= times[0]) return `${ASSETS}${name}/0000.${ext}`;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (times[m] <= t) lo = m; else hi = m - 1; }
  return `${ASSETS}${name}/${String(lo).padStart(4, '0')}.${ext}`;
}
const px = (n: number) => `${n.toFixed(2)}px`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A picture of the product at a place and scale (css size = asset pixels / 2). */
class Pic {
  img: HTMLImageElement;
  constructor(parent: HTMLElement, cls = '') { this.img = el('img', `pic ${cls}`, parent) as HTMLImageElement; }
  show(name: string, t: number, x: number, y: number, s: number, o = 1) {
    const a = M[name]; setSrc(this.img, srcAt(name, t));
    // Drawn at its final size straight from the full-resolution picture (never a small bitmap scaled up).
    Object.assign(this.img.style, { width: px(a.w / 2 * s), height: px(a.h / 2 * s), transform: `translate(${px(x)}, ${px(y)})`, opacity: String(clamp(o)) });
    return this;
  }
}

/** The camera of a shot: everything inside moves together, about one point, slowly. */
function camera(root: HTMLElement) {
  const cam = el('div', 'cam', root);
  return { cam, at(k: number, ox: number, oy: number) { cam.style.transformOrigin = `${px(ox)} ${px(oy)}`; cam.style.transform = `scale(${k.toFixed(5)})`; } };
}

// The desktop: a calm, dark generated wallpaper (the same light the island's glass was filmed over).
const wallpaper = (() => {
  const c = document.createElement('canvas'); Object.assign(c.style, { position: 'absolute', left: '-9999px', width: px(W), height: px(H) });
  document.body.append(c);
  PALETTES.film = { base: ['#0b0a12', '#050608'], blobs: TALL
    ? [[.5, -.08, .36, '#ff9a3d', .4], [.1, .35, .5, '#5a23b8', .34], [.92, .45, .44, '#0f7f8a', .28], [.55, .9, .6, '#2b1250', .45]]
    : [[.5, -.12, .42, '#ff9a3d', .42], [.14, .3, .5, '#5a23b8', .36], [.88, .38, .46, '#0f7f8a', .3], [.55, .85, .6, '#2b1250', .45]] };
  paint(c, 'film'); const url = c.toDataURL('image/png'); c.remove(); return url;
})();
function desk(parent: HTMLElement, dim = 0) {
  const d = el('div', 'desk', parent); d.style.backgroundImage = `url(${wallpaper})`;
  if (dim) { const s = el('div', 'shade', d); s.style.opacity = String(dim); }
  return d;
}

/** One line of type: a short fade with a small rise. */
class Caption {
  e: HTMLElement;
  constructor(parent: HTMLElement, text: string, size: number, cls = '') { this.e = el('div', `cap ${cls}`, parent, text); this.e.style.fontSize = px(size); }
  pos(y: number, align: 'center' | 'left' = 'center', x = 0, width = W - 2 * (TALL ? 90 : 160)) {
    Object.assign(this.e.style, { top: px(y), width: px(width), textAlign: align, left: px(align === 'center' ? MID - width / 2 : x) });
    return this;
  }
  show(t: number, a: number, b = Infinity) {
    const i = out(prog(t, a, a + .8)), o = b === Infinity ? 0 : sine(prog(t, b, b + .55));
    this.e.style.opacity = String(i * (1 - o));
    this.e.style.transform = `translateY(${px((1 - i) * 14)})`;
    return this;
  }
}
const CAP = TALL ? 52 : 58;

/** The pointer: a plain arrow (no system's own). */
function pointer(parent: HTMLElement) {
  const p = el('div', 'pointer', parent, '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2.5 L4 19.5 L8.6 15.4 L11.6 22 L14.4 20.8 L11.5 14.3 L17.6 14.3 Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>');
  return (x: number, y: number, o: number) => { p.style.transform = `translate(${px(x)}, ${px(y)})`; p.style.opacity = String(clamp(o)); };
}

/** A generic window: a quiet title bar (no system's controls), made-up content. */
function win(parent: HTMLElement, cls: string, title: string, body: string) {
  return el('div', `win ${cls}`, parent, `<div class="win-bar"><span>${esc(title)}</span></div><div class="win-body">${body}</div>`);
}
function place(e: HTMLElement, x: number, y: number, w: number, h: number) { Object.assign(e.style, { left: px(x), top: px(y), width: px(w), height: px(h) }); }

// ——— shots ———
interface Shot { a: number; b: number; root: HTMLElement; draw(t: number): void; fadeIn: boolean }
const shots: Shot[] = [];
/** A shot from a to b (film seconds); with `dissolve`, it fades in over the shot before it. */
function shot(a: number, b: number, dissolve: boolean, build: (root: HTMLElement, a: number) => (t: number, len: number) => void) {
  const root = el('div', 'shot', film);
  const draw = build(root, a);
  shots.push({ a, b, root, fadeIn: dissolve, draw: t => draw(t, b - a) });
}

// Where things are inside the pictures (css px). Island capture box 890×500: the island's centre
// is at x 435, its closed strip sits at x 290 of it (the strip box is 310×72). Office 1180×708.
const ISL = { cx: 435, stripX: 290, contentH: 396 };
const OFC = { w: 1180, h: 708, card: { x: 760, y: 340 } };

// The close-up rule: when the island shows something, it is large, whole and sharp (filmed at 4×
// pixels), hanging from the screen's top edge (a thin dark bezel above it), and the words are small
// and low, after the picture has been seen.
const BZ = TALL ? 64 : 56;
const NOTE = TALL ? 34 : 38, NOTE_Y = H - (TALL ? 170 : 132);
const note = (root: HTMLElement, text: string) => new Caption(root, text, NOTE, 'note').pos(NOTE_Y);
function bezel(root: HTMLElement, oy = 0) { const b = el('div', 'bezel', root); Object.assign(b.style, { height: px(BZ), top: px(oy) }); return b; }
/** The open island's close-up scale, the same in every open-island shot. */
const OPEN_S = TALL ? 1.75 : 1.98;
/** The pages are shorter than the agents list, so they are seen closer still. */
const PAGE_S = TALL ? 1.75 : 2.5;
const islX = (S: number) => MID - ISL.cx * S;
const stripX = (S: number) => MID - (ISL.cx - ISL.stripX) * S;
/** One slow push over the open-island shots (hover to music), so their dissolves never double the island. */
const actCam = (_g: number) => 1;
/** A desktop shot: the camera, the wallpaper below the bezel, the soft light, and the bezel on top. */
function stage(root: HTMLElement, dim = 0, oy = 0) {
  const c = camera(root), top = oy + BZ;
  const d = desk(c.cam, dim); d.style.top = px(top);
  el('div', 'spot', c.cam).style.top = px(top);
  if (oy) el('div', 'room', root).style.height = px(oy);
  bezel(root, oy);
  return { ...c, top, at: (k: number) => c.at(k, MID, top) };
}

// The closed strip's own turns (its clip times): each turn is shown, the still time between skipped.
// Its faces turn every 5 s: time, battery (at 3.25), time (8.25), weather (13.25), time (18.25).
const STRIP_HOLD = 1.4, STRIP_RUN: [number, number][] = [[2.6, 2.0], [7.9, 1.0], [12.9, 2.0], [17.9, 1.1]];

// 1. The hero: the small island in close-up at the top of a quiet screen; the camera eases in while
//    its strip turns (the time and working agents, battery, weather), back to the time.
shot(T.hero, T.hover, false, root => {
  const { cam, at, top } = stage(root, 0, TALL ? 400 : 260);
  const isl = new Pic(cam, 'island');
  const S = TALL ? 4.4 : 5.4;
  const title = new Caption(root, TEXT.title, TALL ? 60 : 64, 'title').pos(NOTE_Y - (TALL ? 84 : 86));
  const tag = note(root, TEXT.top), strip = note(root, TEXT.strip);
  return (t, len) => {
    at(1);
    let ct = .4 + Math.min(t, STRIP_HOLD) * (STRIP_RUN[0][0] - .4) / STRIP_HOLD;
    if (t > STRIP_HOLD) {
      let left = t - STRIP_HOLD; ct = STRIP_RUN[0][0];
      for (const [c0, d] of STRIP_RUN) { if (left <= d) { ct = c0 + left; break; } left -= d; ct = c0 + d; }
    }
    isl.show(A('strip'), ct, stripX(S), top, S);
    title.show(t, 1.6, 4.4); tag.show(t, 2.0, 4.4); strip.show(t, 5.2, len - .6);
  };
});

// 2. Hover: the pointer comes up to the island and it opens on the agents.
shot(T.hover, T.pages, false, (root, a) => {
  const { cam, at, top } = stage(root, 0, TALL ? 170 : 30);
  const isl = new Pic(cam, 'island');
  const move = pointer(cam);
  const line = note(root, TEXT.hover);
  return (t, len) => {
    at(actCam(a + t));
    const OPEN_AT = 1.1;
    isl.show(A('agents-open'), t < OPEN_AT ? 0 : t - OPEN_AT + .2, islX(OPEN_S), top, OPEN_S);
    const p = sine(prog(t, .1, 1.0));
    move(mix(MID + (TALL ? 300 : 560), MID + 60, p), mix(H * .75, top + 40, p), prog(t, .1, .4) * (1 - prog(t, 1.6, 2.1)));
    line.show(t, 1.8, len - .4);
  };
});

// 3. A swipe through its pages: notes, alarms, water (a glass is drunk), focus.
shot(T.pages, T.media, false, (root, a) => {
  const { cam, at, top } = stage(root, 0, TALL ? 260 : 150);
  const isl = new Pic(cam, 'island');
  const row = el('div', 'cap note pages', root, TEXT.pages.map(p => `<span>${esc(p)}</span>`).join('<i>·</i>'));
  Object.assign(row.style, { fontSize: px(NOTE), top: px(NOTE_Y), width: px(W), left: '0px', textAlign: 'center' });
  const words = [...row.querySelectorAll('span')] as HTMLElement[];
  // The take's own page times: alarms at 2.4, water at 4.8, focus at 7.4.
  const AT = [0, 2.4, 4.8, 7.4];
  return (t, len) => {
    at(actCam(a + t));
    // The app's own swipes are quick; each plays at a third of its speed, so no page jumps past.
    const u = .7 + t * ((9.4 + 1.8 - .7) / len);
    let ct = u, lag = 0;
    for (const x of AT.slice(1)) { const over = clamp(u - (x - .02 + lag), 0, .9); ct -= over * 2 / 3; lag += .6; }
    isl.show(A('tour'), ct, islX(PAGE_S), top, PAGE_S);
    const cur = AT.filter(x => ct >= x + .05).length - 1;
    words.forEach((w, i) => { w.style.opacity = String(i === cur ? 1 : .32); });
    row.style.opacity = String(out(prog(t, .9, 1.7)) * (1 - sine(prog(t, len - .4, len))));
  };
});

// 4. Music: what plays, its cover and progress.
shot(T.media, T.apps, true, (root, a) => {
  const { cam, at, top } = stage(root, 0, TALL ? 260 : 150);
  const isl = new Pic(cam, 'island');
  const line = note(root, TEXT.media);
  return (t, len) => {
    at(actCam(a + t));
    isl.show(A('media'), .2 + t * .9, islX(PAGE_S), top, PAGE_S);
    line.show(t, 1.2, len - .4);
  };
});

// 4b. The glass look, once: the open island turns to frosted glass over a colourful wallpaper (the one
//     its glass was drawn from, placed exactly behind it), holds, and goes back to black. A still frame.
const glassWall = (() => {
  const cv = document.createElement('canvas'); Object.assign(cv.style, { position: 'absolute', left: '-9999px', width: '1920px', height: '1080px' });
  document.body.append(cv); PALETTES.glassbeat = GLASS_WALL; paint(cv, 'glassbeat'); const url = cv.toDataURL('image/png'); cv.remove(); return url;
})();
shot(T.glass, T.apps, false, root => {
  const { cam, top } = stage(root, 0, TALL ? 170 : 30);
  const S = OPEN_S, x = islX(S);
  const wall = el('div', 'desk', cam); Object.assign(wall.style, { backgroundImage: `url(${glassWall})`, inset: 'auto', left: px(x - GLASS_ORIGIN.x * S), top: px(top - GLASS_ORIGIN.y * S), width: px(1920 * S), height: px(1080 * S) });
  const under = new Pic(cam, 'island'), isl = new Pic(cam, 'island');
  const line = note(root, TEXT.glass);
  // The look changes at once in the app (black → glass at 0.6, back at 3.2 of the take); here each
  // change dissolves over half a second, so nothing jumps.
  const CHANGES = [.6, 3.2], EASE = .5;
  return (t, len) => {
    const ct = .35 + t * (3.2 / len), e = CHANGES.find(e => ct >= e && ct < e + EASE);
    under.show(A('glass'), e === undefined ? ct : e - .02, x, top, S, e === undefined ? 0 : 1);
    isl.show(A('glass'), ct, x, top, S, e === undefined ? 1 : sine((ct - e) / EASE));
    line.show(t, .6, len - .3);
  };
});

// 5. (see "over apps and a browser" below: the approved section, drawn at its final size)

// 6. Full screen: a presentation fills the screen; the island settles into the thin line and breathes.
shot(T.line, T.signs, false, root => {
  const { cam, at, top } = stage(root, 0, TALL ? 330 : 150);
  const s = TEXT.slide;
  const slide = el('div', 'slide', cam, `<div class="slide-in"><small>${esc(s.sub)}</small><h2>${esc(s.title)}</h2><div class="chart">${[38, 52, 47, 66, 74, 88].map(h => `<i style="height:${h}%"></i>`).join('')}</div><span class="num">${esc(s.page)}</span></div>`);
  slide.style.top = px(top);
  const isl = new Pic(cam, 'island');
  const S = 2.0, Z = TALL ? 2.0 : 2.3;
  const shade = el('div', 'foot center', root);
  const line = note(root, TEXT.line);
  return (t, len) => {
    at(Z);
    isl.show(A('line'), .3 + t, stripX(S), top, S);
    shade.style.opacity = String(out(prog(t, 1.0, 1.8)));
    line.show(t, 1.6, len - .4);
  };
});

// 7. System signs on the closed island, in close-up: volume, Caps Lock, keyboard language.
shot(T.signs, T.shelf, false, root => {
  const { cam, at, top } = stage(root, 0, TALL ? 400 : 260);
  const isl = new Pic(cam, 'island');
  const S = TALL ? 3.3 : 4.0;
  const line = note(root, TEXT.signs);
  return (t, len) => {
    at(1);
    isl.show(A('signs'), .3 + t * (5.9 / len), stripX(S), top, S);
    line.show(t, 1.4, len - .4);
  };
});

// 8. The shelf: files dropped on the island; one is dragged out into a message (generic, made up).
shot(T.shelf, T.ask, false, root => {
  const { cam, at, top } = stage(root, .1, TALL ? 170 : 40);
  const m = TEXT.mail;
  const mail = win(cam, 'mail', m.title, `<div class="f"><b>${esc(m.to)}</b>${esc(m.toV)}</div><div class="f"><b>${esc(m.subj)}</b>${esc(m.subjV)}</div><p>${esc(m.body)}</p><div class="att"><i></i>${esc(m.file)}</div>`);
  const S = TALL ? 1.75 : 1.9;
  const box = TALL ? { x: 140, y: 820, w: 800, h: 330 } : { x: 1180, y: 640, w: 680, h: 340 };
  place(mail, box.x, box.y, box.w, box.h);
  const att = mail.querySelector<HTMLElement>('.att')!;
  const isl = new Pic(cam, 'island');
  const ghost = el('div', 'ghost', cam, `<i></i>${esc(m.file)}`);
  const move = pointer(cam);
  const line = TALL ? note(root, TEXT.shelf) : new Caption(root, TEXT.shelf, NOTE, 'note').pos(NOTE_Y, 'left', 120, 900);
  return (t, len) => {
    at(1);
    isl.show(A('shelf'), Math.min(2.75, .45 + t), islX(S), top, S);
    const p = sine(prog(t, 2.5, 3.9));
    const x0 = MID - 60, y0 = top + 215 * S, x1 = box.x + 40, y1 = box.y + box.h - 70;
    const gx = mix(x0, x1, p), gy = mix(y0, y1, p);
    ghost.style.transform = `translate(${px(gx)}, ${px(gy)})`; ghost.style.opacity = String(prog(t, 2.3, 2.6) * (1 - prog(t, 3.9, 4.1)));
    move(gx + 40, gy + 20, prog(t, 2.1, 2.5) * (1 - prog(t, 4.2, 4.6)));
    att.style.opacity = String(out(prog(t, 3.9, 4.3)));
    line.show(t, 1.3, len - .4);
  };
});

// 9. An agent asks: the island shows its question.
shot(T.ask, T.office, false, root => {
  const { cam, at, top } = stage(root, 0, TALL ? 170 : 30);
  const isl = new Pic(cam, 'island');
  const line = note(root, TEXT.ask);
  return (t, len) => {
    at(1);
    const ct = t - .2;
    isl.show(ct < 2.55 ? A('agents-ask') : A('agents-asked'), ct < 2.55 ? Math.max(0, ct) : 0, islX(OPEN_S), top, OPEN_S);
    line.show(t, 1.4, len - .4);
  };
});

// 10. The office: the manager has walked over; one slow push-in to the card; the answer is sent.
// The take's own times: the manager arrives at about 4.6, the card opens at 6.0, an option at 7.2,
// sent at 8.0. The card's instant changes are eased in, so the close-up never jumps.
const TAKE = 3.9;
shot(T.office, T.window, true, root => {
  const { cam } = camera(root);
  desk(cam, .45);
  const frame = el('div', 'office', cam); const under = new Pic(frame), pic = new Pic(frame);
  const CHANGES = LANG === 'en' ? [6.0, 8.01] : [6.0, 7.98], EASE = .35;
  const a = TALL ? { S: 1.32, x: MID - 700 * 1.32, y: 96 } : { S: 1.2, x: MID - OFC.w / 2 * 1.2, y: 64 };
  const bS = TALL ? 1.62 : 1.72;
  const b = TALL ? { S: bS, x: MID - 765 * bS, y: 40 } : { S: bS, x: MID - (OFC.w - W / bS / 2) * bS, y: 0 };
  const foot = el('div', 'foot', root);
  const line = TALL ? new Caption(root, TEXT.answer, NOTE, 'note').pos(b.y + OFC.h * b.S + 60) : new Caption(root, TEXT.answer, NOTE, 'note').pos(NOTE_Y, 'left', 120, 760);
  if (TALL) { frame.classList.add('bleed'); foot.style.display = 'none'; }
  return (t, len) => {
    const p = t < B(2) ? 0 : 1;
    const S = mix(a.S, b.S, p), x = mix(a.x, b.x, p), y = mix(a.y, b.y, p);
    Object.assign(frame.style, { transform: `translate(${px(x)}, ${px(y)})`, width: px(OFC.w * S), height: px(OFC.h * S), borderRadius: px(mix(TALL ? 0 : 22, 0, p)) });
    const ct = TAKE + t, e = CHANGES.find(e => ct >= e && ct < e + EASE);
    under.show(A('office-story'), e === undefined ? ct : e - .01, 0, 0, S, e === undefined ? 0 : 1);
    pic.show(A('office-story'), ct, 0, 0, S, e === undefined ? 1 : sine((ct - e) / EASE));
    line.show(t, 1.9, len - .4);
    foot.style.opacity = String(sine(prog(t, 1.5, 2.3)) * (1 - sine(prog(t, len - .4, len))));
  };
});

// 11. The office window, one quiet moment. With the season shots (win-spring … win-winter) it moves
//     through the year in calm dissolves; until they exist, day into night.
const SEASONS = ['win-spring', 'win-summer', 'win-autumn', 'win-winter'];
const SKIES = SEASONS.every(n => M[n]) ? SEASONS : ['win-day', 'win-night'];
shot(T.window, T.end, true, root => {
  const { cam, at } = camera(root);
  desk(cam, .5);
  const frame = el('div', 'sky', cam);
  const pics = SKIES.map(() => new Pic(frame));
  const S = TALL ? 2.0 : 2.9;
  const w = 498 * S, h = 186 * S, x = MID - w / 2, y = TALL ? 400 : 150;
  const line = new Caption(root, TEXT.window, NOTE, 'note').pos(y + h + (TALL ? 90 : 80));
  return (t, len) => {
    at(1, MID, y + h / 2);
    Object.assign(frame.style, { transform: `translate(${px(x)}, ${px(y)})`, width: px(w), height: px(h) });
    // Each sky dissolves into the next over half a second; the one before stays underneath.
    const step = (len - .2) / SKIES.length, X = .5;
    SKIES.forEach((name, i) => {
      const a = i * step - (i ? X / 2 : 0), lt = t - a, c = M[name] as Clip;
      pics[i].show(name, .1 + Math.max(0, lt) * Math.min(1, c.seconds / (step + X + .2)), 0, 0, S, i === 0 ? 1 : sine(prog(lt, 0, X)));
    });
    line.show(t, .4, len - .4);
  };
});
// 12. End card: the mascot (its approved layers, still, one blink), the name, one line, the platforms
// and the site's address.
shot(T.end, T.out, true, root => {
  const { cam, at } = camera(root);
  desk(cam, .35);
  const size = TALL ? 360 : 300, mh = size * 861 / 1065;
  const top = TALL ? 250 : 150;
  const box = el('div', 'mascot', cam); Object.assign(box.style, { width: px(size), height: px(mh), left: px(MID - size / 2), top: px(top) });
  const layer = (n: string) => { const i = el('img', 'pic', box) as HTMLImageElement; setSrc(i, `${ASSETS}mascot-${n}.png`); Object.assign(i.style, { width: px(size), height: px(mh) }); return i; };
  const L = Object.fromEntries(['under', 'arm', 'body', 'eyeL', 'eyeR'].map(n => [n, layer(n)])) as Record<string, HTMLImageElement>;
  L.eyeL.style.transformOrigin = '46.573% 34.002%'; L.eyeR.style.transformOrigin = '63.568% 29.833%';
  const ty = top + mh + (TALL ? 70 : 50);
  const title = new Caption(root, TEXT.title, TALL ? 104 : 112, 'title').pos(ty);
  const tag = new Caption(root, TEXT.tagline, 44, 'soft').pos(ty + 150);
  const plat = new Caption(root, TEXT.platforms, 30, 'dim').pos(ty + (TALL ? 290 : 228));
  const site = new Caption(root, SITE, TALL ? 34 : 34, 'site').pos(ty + (TALL ? 350 : 290));
  return (t, len) => {
    at(1, MID, top + mh / 2);
    box.style.opacity = String(out(prog(t, .2, 1.2)));
    const bl = prog(t, 3.0, 3.27), close = bl < .34 ? sine(bl / .34) : bl < .5 ? 1 : 1 - sine((bl - .5) / .5);
    for (const e of [L.eyeL, L.eyeR]) e.style.transform = `scale(${mix(1, 1.05, close).toFixed(3)}, ${mix(1, .17, close).toFixed(3)})`;
    title.show(t, .4); tag.show(t, .8); plat.show(t, 1.1);
    site.show(t, 1.3);
  };
});

// ——— over apps and a browser: the island over a full-screen app, then hidden in a browser ———
// (?part=apps renders this section on its own, as it was approved.)
// Everything here is drawn at its final size (no camera scaling): the made-up app and browser are
// laid out in screen pixels × Z, the island is the black theme filmed at 4–6×. A static frame.
{
  if (PART === 'apps') shots.length = 0;
  const Z = TALL ? 1.6 : 1.8, OYA = TALL ? 200 : 120, TOPA = OYA + BZ;
  const z = (n: number) => `${(n * Z).toFixed(2)}px`;
  const P = LANG === 'en' ? {
    app: 'Lumen — Sprint 24', views: ['Board', 'List', 'Calendar'], cols: [['To do', 4], ['In progress', 3], ['Done', 6]] as [string, number][],
    cards: [[['Search index cache', 'Backend', 'a'], ['Docs: three guide chapters', 'Docs', 'c']], [['Checkout form validation', 'Web', 'b'], ['Dark theme accent colour', 'Design', 'd']], [['Startup 1.2 s faster', 'Perf', 'a'], ['Release notes', 'Docs', 'c']]],
    tabs: ['Release notes — Lumen', 'Docs'], url: 'lumen.test/release-notes', h: 'Release 2.4', p: 'A calmer start: the dashboard opens 1.2 seconds faster, search remembers your last query for five minutes, and the dark theme gets a warm amber accent.',
    apps: 'On top of every app.', hide: 'In a browser it stays hidden. Touch the top edge and it opens.',
  } : {
    app: 'Lumen — Sprint 24', views: ['Pano', 'Liste', 'Takvim'], cols: [['Yapılacak', 4], ['Sürüyor', 3], ['Bitti', 6]] as [string, number][],
    cards: [[['Arama dizini önbelleği', 'Sunucu', 'a'], ['Kılavuz: üç bölüm', 'Belge', 'c']], [['Ödeme formu doğrulaması', 'Web', 'b'], ['Karanlık tema vurgu rengi', 'Tasarım', 'd']], [['Açılış 1,2 sn kısaldı', 'Hız', 'a'], ['Sürüm notları', 'Belge', 'c']]],
    tabs: ['Sürüm notları — Lumen', 'Belgeler'], url: 'lumen.test/surum-notlari', h: 'Sürüm 2.4', p: 'Daha sakin bir başlangıç: pano 1,2 saniye daha hızlı açılıyor, arama son sorgunu beş dakika hatırlıyor ve karanlık temaya sıcak bir kehribar vurgu geldi.',
    apps: 'Her uygulamanın üstünde.', hide: 'Tarayıcıda gizli kalır. Üst kenara gel, açılır.',
  };
  const screen = (root: HTMLElement) => {
    const s = el('div', 'scr', root); Object.assign(s.style, { top: px(TOPA), '--z': String(Z) } as Record<string, string>);
    el('div', 'room', root).style.height = px(OYA); bezel(root, OYA);
    return s;
  };
  const appHtml = () => `<div class="pa-bar"><span>${esc(P.app)}</span></div>
    <div class="pa-tools"><div class="seg">${P.views.map((v, i) => `<b class="${i ? '' : 'on'}">${esc(v)}</b>`).join('')}</div></div>
    <div class="pa-board">${P.cols.map(([n, k], i) => `<div class="col"><div class="col-h"><i class="d${i}"></i>${esc(n)}<em>${k}</em></div>${P.cards[i].map(([t, tag, who]) => `<div class="card"><div class="t">${esc(t)}</div><div class="m"><span class="tag t${i}">${esc(tag)}</span><span class="av av-${who}">${who.toUpperCase()}</span></div></div>`).join('')}</div>`).join('')}</div>`;
  const browserHtml = () => `<div class="pb-tabs">${P.tabs.map((t, i) => `<div class="tab${i ? '' : ' on'}">${esc(t)}</div>`).join('')}</div>
    <div class="pb-bar"><div class="url">${esc(P.url)}</div></div>
    <div class="pb-page"><small>Lumen</small><h1>${esc(P.h)}</h1><p>${esc(P.p)}</p><div class="hero"></div></div>`;
  const LEN = PART === 'apps' ? B(9.6) : T.line - T.apps, SW = B(4), AT0 = PART === 'apps' ? 0 : T.apps;
  shot(AT0, AT0 + LEN, false, root => {
    const scr = screen(root);
    const app = el('div', 'pa', scr, appHtml()), web = el('div', 'pb', scr, browserHtml());
    const isl = new Pic(root, 'island'), open = new Pic(root, 'island');
    const move = pointer(root);
    const one = note(root, P.apps), two = note(root, P.hide);
    return t => {
      // The switch to the browser: the windows change; the island leaves with the app (the browser hides it).
      const sw = sine(prog(t, SW - .3, SW + .3));
      web.style.opacity = String(sw); app.style.opacity = String(1 - sw);
      isl.show(A('strip-dark'), .4 + Math.min(t, SW) * .3, stripX(Z), TOPA, Z, 1 - sine(prog(t, SW - .3, SW + .1)));
      // The pointer goes up to the top edge where the island lives, and it opens there.
      const REVEAL = SW + 2.1, p = sine(prog(t, SW + 1.0, REVEAL));
      move(mix(MID + (TALL ? 260 : 520), MID + 10, p), mix(H * .72, TOPA + 4, p), prog(t, SW + .9, SW + 1.2));
      const ct = t - REVEAL + .33;
      open.show(A('agents-open-dark'), Math.max(.33, ct), islX(Z), TOPA, Z, t >= REVEAL ? 1 : 0);
      one.show(t, 1.0, SW - .5); two.show(t, SW + .7);
    };
  });
  if (PART === 'apps') DURATION = LEN;
}

// The shots in time order (a dissolve looks at the shot after it).
shots.sort((p, q) => p.a - q.a);

// ——— the grade: a gentle vignette over everything; black at the very start and end ———
el('div', 'grade vignette', film);
const fade = el('div', 'grade fade', film);

async function seek(t: number) {
  shots.forEach((s, i) => {
    const next = shots[i + 1];
    // A shot stays on under the next one while that one dissolves in.
    const until = next?.fadeIn ? s.b + DISSOLVE / 2 : s.b;
    const from = s.fadeIn ? s.a - DISSOLVE / 2 : s.a;
    const on = t >= from && t < until;
    s.root.style.display = on ? 'block' : 'none';
    s.root.style.zIndex = String(i + 1);
    if (!on) return;
    s.root.style.opacity = String(s.fadeIn ? sine(prog(t, from, s.a + DISSOLVE / 2)) : 1);
    s.draw(t - s.a);
  });
  fade.style.opacity = String(Math.max(1 - sine(prog(t, 0, 1.0)), sine(prog(t, DURATION - (PART ? .7 : 1.6), DURATION - .1))));
  await Promise.all(pending.splice(0));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

await Promise.all(['500', '600', '700'].map(w => document.fonts.load(`${w} 64px Manrope`, 'AgentOffice ğüşİıçö’')));
await document.fonts.ready;
(window as unknown as { __film: unknown }).__film = { seek, duration: DURATION, cues: [], music: { bpm: BPM, lift: 24, home: 64, cuts: Object.values(T).map(x => +(x / BEAT).toFixed(2)) }, W, H, ready: true };
