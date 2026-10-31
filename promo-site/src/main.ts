// The promo page: generated wallpapers, the live islands and office (each the app's own code in a
// frame, sharing one demo world), the scroll reveals and the section rail.
import type { SessionKey } from '@app/shared/contract';
import { requestId } from '@app/shared/contract';
import { applyStrings, lang, t, type Key } from './strings';
import { paint } from './wall';
import { getHub } from './demo/hub';
import { themeQuestion } from './demo/fixture';

document.documentElement.classList.add('js');
applyStrings();
document.title = t('meta.title');

const hub = getHub();
if (lang !== 'tr') hub.settings = { ...hub.settings, language: lang as never };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)];

// ——— toast ———
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(text: string) { const el = $('.toast'); el.textContent = text; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4200); }

// ——— wallpapers ———
const walls = $$<HTMLCanvasElement>('canvas.wall');
function paintWalls() { let changed = false; for (const c of walls) if (c.isConnected && c.clientWidth) changed = paint(c, c.dataset.wall!) || changed; if (changed) hub.emit('frame', { type: 'backdrop', frame: '*' }); }

// The picture behind a frame, for its island's glass: the frame's own box cut from its stage's wallpaper.
(window as unknown as { __aoBackdrop: (frame: Element) => Promise<{ blob: Blob; w: number; h: number } | null> }).__aoBackdrop = async frame => {
  const host = frame.closest('.stage-host'); const wall = host?.querySelector<HTMLCanvasElement>('canvas.wall');
  if (!wall || !wall.width) return null;
  const f = frame.getBoundingClientRect(), b = wall.getBoundingClientRect();
  const el = frame as HTMLIFrameElement, w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h || !b.width) return null;
  const kx = wall.width / b.width, ky = wall.height / b.height;
  // At most ~900px wide: the glass blurs it anyway.
  const k = Math.min(1, 900 / w), out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * k)); out.height = Math.max(1, Math.round(h * k));
  const g = out.getContext('2d')!; g.fillStyle = '#07080b'; g.fillRect(0, 0, out.width, out.height);
  g.drawImage(wall, (f.left - b.left) * kx, (f.top - b.top) * ky, f.width * kx, f.height * ky, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>(r => out.toBlob(r, 'image/jpeg', .9));
  return blob ? { blob, w, h } : null;
};

// ——— live islands ———
interface Island { wrap: HTMLElement; frame?: HTMLIFrameElement; id: string; w: number; h: number; fit: number; scale: number }
const islands: Island[] = $$('.island-wrap').map(wrap => ({ wrap, id: wrap.dataset.island!, w: Number(wrap.dataset.w), h: Number(wrap.dataset.h), fit: Number(wrap.dataset.fit || wrap.dataset.w), scale: 1 }));
const pageName = (id: string) => t((`page.${id === 'hero' ? 'agents' : id}`) as Key);

function layoutIsland(isl: Island) {
  const box = isl.wrap.parentElement!;
  const avail = isl.id === 'hero' ? document.documentElement.clientWidth - 16 : box.clientWidth - 16;
  isl.scale = Math.min(1, avail / isl.fit);
  isl.wrap.style.width = `${isl.w * isl.scale}px`; isl.wrap.style.height = `${isl.h * isl.scale}px`;
  // The hero keeps room for the island at its tallest (440px open, plus its spring's overshoot),
  // so the open island never covers the headline.
  if (isl.id === 'hero') { isl.wrap.style.marginLeft = `${-isl.w * isl.scale / 2}px`; box.style.setProperty('--island-open', `${Math.ceil(440 * 1.06 * isl.scale) + 28}px`); }
  else { const wall = box.querySelector<HTMLElement>('canvas.wall'); if (wall) wall.style.height = `${Math.round(Math.max(isl.h * isl.scale, 260))}px`; }
  if (isl.id !== 'hero' && !box.style.getPropertyValue('--stage-h')) box.style.setProperty('--stage-h', `${Math.round(isl.h * isl.scale * .8)}px`);
  if (isl.frame) { isl.frame.style.transform = isl.scale < 1 ? `scale(${isl.scale})` : ''; }
  let tag = box.querySelector<HTMLElement>('.scaled-tag');
  if (isl.id !== 'hero' && isl.scale < .9) { if (!tag) { tag = document.createElement('span'); tag.className = 'scaled-tag'; tag.textContent = t('scaled'); box.append(tag); } }
  else tag?.remove();
}

function mountIsland(isl: Island) {
  if (isl.frame) return;
  const f = document.createElement('iframe');
  const page = isl.wrap.dataset.page;
  const q = new URLSearchParams({ id: isl.id, ...(page ? { page, pin: '1' } : {}), ...(lang !== 'tr' ? { lang } : {}) });
  f.src = `./island.html?${q}`;
  f.title = t('island.frame', { page: pageName(isl.id) });
  f.width = String(isl.w); f.height = String(isl.h);
  f.style.width = `${isl.w}px`; f.style.height = `${isl.h}px`; f.style.transformOrigin = '0 0';
  f.setAttribute('allowtransparency', 'true');
  isl.frame = f; isl.wrap.append(f); layoutIsland(isl);
}

// Each island's frame is cut to the island's shape (plus room for its shadow), like the app's
// window region, so the page around it stays clickable.
hub.on('frame', m => {
  const msg = m as { type?: string; frame?: string; rects?: { x: number; y: number; w: number; h: number }[] };
  if (msg.type !== 'shape' || !msg.rects?.length) return;
  const isl = islands.find(i => i.id === msg.frame); if (!isl?.frame) return;
  const pad = 30;
  const x0 = Math.min(...msg.rects.map(r => r.x)) - pad, y0 = Math.min(...msg.rects.map(r => r.y)) - pad;
  const x1 = Math.max(...msg.rects.map(r => r.x + r.w)) + pad, y1 = Math.max(...msg.rects.map(r => r.y + r.h)) + pad;
  isl.frame.style.clipPath = `inset(${Math.max(0, y0)}px ${Math.max(0, isl.w - x1)}px ${Math.max(0, isl.h - y1)}px ${Math.max(0, x0)}px)`;
  // A stage is as tall as its island needs now (a short list, an open form), with room to breathe.
  if (isl.id !== 'hero') { const bottom = Math.min(isl.h, y1 - pad + 56 + (isl.scale < .9 ? 30 / isl.scale : 0)); isl.wrap.parentElement!.style.setProperty('--stage-h', `${Math.round(Math.max(260, bottom) * isl.scale)}px`); }
});

const near = new IntersectionObserver(entries => entries.forEach(e => { if (!e.isIntersecting) return; const isl = islands.find(i => i.wrap === e.target); if (isl) { mountIsland(isl); near.unobserve(e.target); } }), { rootMargin: '700px 0px' });
islands.forEach(isl => { layoutIsland(isl); near.observe(isl.wrap); });

// ——— office ———
const officeFit = $('.office-fit'), officeSlot = $('.office-slot');
let officeFrame: HTMLIFrameElement | undefined;
function layoutOffice() {
  const width = officeFit.clientWidth; if (!width) return;
  const natural = Math.max(820, Math.min(1180, width)), scale = width / natural, height = Math.round(natural * .6);
  officeSlot.style.width = `${natural}px`; officeSlot.style.height = `${height}px`; officeSlot.style.transform = scale < 1 ? `scale(${scale})` : '';
  officeFit.style.height = `${Math.round(height * scale)}px`;
}
function mountOffice() {
  if (officeFrame) return;
  officeFrame = document.createElement('iframe'); officeFrame.src = './office.html'; officeFrame.title = t('office.frame');
  officeSlot.append(officeFrame); layoutOffice();
}
const officeNear = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { mountOffice(); officeNear.disconnect(); } }, { rootMargin: '700px 0px' });
officeNear.observe(officeFit); layoutOffice();

let officeReady = false; const afterOffice: (() => void)[] = [];
hub.on('frame', m => { const msg = m as { type?: string; frame?: string }; if (msg.type === 'ready' && msg.frame === 'office') { officeReady = true; setTimeout(() => afterOffice.splice(0).forEach(fn => fn()), 400); } });
// "Ofiste yanıtla" in any island: the office comes into view and opens that agent with its question.
hub.on('open-office', k => {
  const key = k as SessionKey | null;
  mountOffice();
  $('.office-stage').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  const select = () => { if (key) hub.emit('frame', { type: 'select', frame: 'office', key }); };
  if (officeReady) setTimeout(select, reduced ? 50 : 700); else afterOffice.push(select);
});
hub.on('answered', a => {
  const { answer } = a as { answer: string };
  const text = t('office.answered', { answer });
  $$('#ofis .status, #ajanlar .status').forEach(el => { el.textContent = text; });
});
hub.on('open-settings', () => toast(t('toast.settings')));
hub.on('open-source', () => toast(t('toast.source')));
hub.on('frame', m => { if ((m as { type?: string }).type === 'shelf-pick') toast(t('toast.pick')); });

// ——— "a new question" ———
$('[data-action="ask"]').addEventListener('click', () => {
  const s = hub.snapshot, now = Date.now();
  const open = s.requests.find(r => r.status === 'pending');
  if (open) { hub.emit('frame', { type: 'page', frame: 'agents', page: 'agents' }); $('#ajanlar .status').textContent = t('agents.asked'); return; }
  const n = s.requests.length + 1, q = themeQuestion(now, n);
  s.requests = s.requests.filter(r => requestId(r.key) !== requestId(q.key)).concat(q);
  const who = s.sessions.find(x => x.key.sessionId === 'lumen-theme');
  if (who) { who.status = 'waiting'; who.summary = 'Sorusuna yanıt bekliyor'; who.lastActivity = now; }
  hub.publish();
  hub.emit('frame', { type: 'page', frame: 'agents', page: 'agents' });
  $('#ajanlar .status').textContent = t('agents.asked');
});

// ——— shelf samples ———
const SAMPLES = [
  { name: 'sunum-taslagi.pdf', tag: 'PDF', color: '#e5484d' },
  { name: 'ana-ekran.png', tag: 'PNG', color: '#3e8ef7' },
  { name: 'toplanti-notlari.txt', tag: 'TXT', color: '#6b7280' },
  { name: 'butce-2027.xlsx', tag: 'XLS', color: '#2f9e6b' },
];
const samples = $('.samples');
samples.innerHTML = SAMPLES.map(s => `<div class="sample" role="listitem" draggable="true" data-file="${s.name}"><span class="ficon" style="background:${s.color}" aria-hidden="true">${s.tag}</span><span class="fname">${s.name}</span><button type="button" data-put="${s.name}">${t('shelf.put')}</button></div>`).join('');
const pathOf = (name: string) => `C:\\Örnek\\Masaüstü\\${name}`;
samples.addEventListener('dragstart', e => {
  const el = (e.target as Element).closest<HTMLElement>('.sample'); if (!el || !e.dataTransfer) return;
  e.dataTransfer.setData('application/x-agentoffice-demo', pathOf(el.dataset.file!)); e.dataTransfer.setData('text/plain', el.dataset.file!);
  e.dataTransfer.effectAllowed = 'copy'; el.classList.add('dragging');
});
samples.addEventListener('dragend', e => (e.target as Element).closest('.sample')?.classList.remove('dragging'));
samples.addEventListener('click', e => { const b = (e.target as Element).closest<HTMLElement>('[data-put]'); if (b) hub.emit('frame', { type: 'drop', frame: 'shelf', paths: [pathOf(b.dataset.put!)] }); });

// ——— download placeholder ———
$$('[data-action="download"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); toast(t('cta.note')); }));

// ——— reveal, rail, bar ———
const reveal = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
$$('.reveal').forEach(el => reduced ? el.classList.add('in') : reveal.observe(el));

const sections = $$<HTMLElement>('.features > section');
$('.rail ol').innerHTML = sections.map(s => `<li><a href="#${s.id}"><span>${(s.querySelector('.kicker')?.textContent ?? '').replace(/^\d+\s*·\s*/, '')}</span></a></li>`).join('');
const railLinks = $$<HTMLAnchorElement>('.rail a');
const current = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) railLinks.forEach(a => a.setAttribute('aria-current', String(a.hash === `#${e.target.id}`))); }), { rootMargin: '-45% 0px -50% 0px' });
sections.forEach(s => current.observe(s));
const rail = $('.rail'), bar = $('.bar'), features = $('.features');
const onScroll = () => {
  bar.classList.toggle('scrolled', scrollY > 40);
  const f = features.getBoundingClientRect(); rail.classList.toggle('on', f.top < innerHeight * .5 && f.bottom > innerHeight * .5);
};
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// ——— sizes ———
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
const relayout = () => { islands.forEach(layoutIsland); layoutOffice(); paintWalls(); };
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(relayout, 120); });
paintWalls();
void document.fonts?.ready.then(relayout);

// A tap outside the hero island closes it again (on a touch screen it stays open after a tap).
addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') hub.emit('frame', { type: 'pin', frame: 'hero', on: false }); }, { passive: true });

// ——— the hero island says hello once: it opens by itself as for a new question, then closes ———
if (!reduced) {
  let touched = false; const heroWrap = $('.hero-island');
  heroWrap.addEventListener('pointerenter', () => { touched = true; }, { once: true });
  setTimeout(() => { if (!touched && scrollY < innerHeight * .5) hub.emit('frame', { type: 'reveal', frame: 'hero' }); }, 2600);
}
