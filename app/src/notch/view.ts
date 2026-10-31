import { dropdownOpen } from '../ui/dropdown';
import { batteryRing, createStrip, nextRing, setRing, stripItems } from './strip';
import type { IslandStatus, Reminder } from '../shared/contract';
import { ago, fromApp, language, locale as localeTag, number, resolveLanguage, setLanguage, t, unitShort } from '../i18n';
import type { Bridge, Snapshot, PendingRequest } from '../shared/contract';
import { mascotState, requestId, sessionId } from '../shared/contract';
import { createMascot } from '../mascot/renderer';
import { finishedAgents, workingNow } from '../mascot/still';
import { createNotchController } from './controller';
import { escapeHtml as e, watchSnapshot } from '../ui/state';
import { icon, mark } from '../ui/icons';
import { readPreferences } from '../ui/preferences';
import { renderLimits } from './limits';
import { counts, managerOf, officeKey, officeName, people, scopeHeadline, shortName, verifiedProviders, type Person } from '../shared/people';
import { createGlass, type GlassShape } from './glass';
import type { PageId, RestLook, Settings } from '../shared/contract';
import { savePreferences } from '../ui/preferences';
import { createPager } from './pager';
import { createFocusPage } from './focus';
import { createMediaPage } from './media';
import { createNotesPage } from './notes';
import { createAlarmsPage } from './alarms';
import { createWaterPage } from './water';
import { createShelfPage } from './shelf';
import type { Sign } from '../shared/contract';
import { PAGE_IDS } from '../shared/settings';

/** After the island narrows (a wide page to a narrower one) a pointer left outside it has this
 *  long to come back before the island closes. */
const NARROW_GRACE_MS = 650;
/** A press that never sees its release (let go outside the notch) stops holding redraws after this. */
const PRESS_LIMIT_MS = 1500;
const FILTERS_KEY = 'agentoffice-notch-filters';
/** The page last used, so the island opens on it again. */
const PAGE_KEY = 'agentoffice-island-page';
/** Each page's size when open (CSS px; the island grows to it). The agents page is the large one
 *  and scrolls inside; the others are as small as their content needs (a page may ask for less
 *  height while it has little to show). */
// Heights include the 54 px header (the mascot's ~56 px face reads there); the agents page keeps 440
// (the island area is 476 px high, geometry.rs) and its list scrolls a line earlier.
const PAGE_SIZE: Record<PageId, { w: number; h: number }> = { agents: { w: 620, h: 440 }, media: { w: 520, h: 210 }, notes: { w: 520, h: 430 }, focus: { w: 540, h: 248 }, alarms: { w: 520, h: 430 }, water: { w: 520, h: 350 }, shelf: { w: 540, h: 430 } };
import '../ui/styles.css';
import './notch.css';
import './pages.css';

/**
 * The notch is a small glass capsule that grows into the island on hover.
 * Only empty "shape" elements change size; content layers only fade and move,
 * and the mascot keeps one canvas size and is scaled, so a transition never
 * re-lays-out content or resizes WebGL. Each animation frame the shapes are
 * reported to the shell, which makes exactly them visible and clickable.
 */
export function mountNotch(root: HTMLElement, bridge: Bridge): { dispose(): void } {
  document.body.classList.add('notch-body'); const prefs = readPreferences(); setLanguage(resolveLanguage(prefs.language)); const l = t;
  const locale = localeTag();
  root.classList.toggle('reduce-motion', prefs.reducedMotion);
  // Open: the headline with the source switch beside it, the card for what matters now, the
  // state filter, the people, and the actions at the bottom.
  const pageTitle = (id: PageId) => ({ agents: l('island.agents'), media: l('island.media'), notes: l('island.notes'), focus: l('island.focus_and_timer'), alarms: l('island.alarms'), water: l('island.water'), shelf: l('island.file_shelf') })[id];
  root.innerHTML = `<canvas class="glass-backdrop" hidden></canvas><div class="notch-stage"><div class="island-area"><div class="island-shape"><i class="shoulder l"></i><i class="shoulder r"></i><div class="island-clip"><section id="island-face" class="island-face" aria-label="AgentOffice" inert><header class="island-head"><button class="move-grip" data-noswipe aria-label="${l('island.move_the_island_along_the')}" title="${l('island.drag_move_along_the_top')}">${icon('grip', 14)}</button><span class="notch-label"><span class="notch-light"></span><span class="notch-text">AgentOffice</span></span><nav class="page-nav" aria-label="${l('island.pages')}"><button class="page-arrow prev" aria-label="${l('island.previous_page')}">${icon('chevL', 14)}</button><span class="page-dots"></span><button class="page-arrow next" aria-label="${l('island.next_page')}">${icon('chevR', 14)}</button></nav><span class="head-clock" aria-hidden="true"><span class="clock-date"></span><b class="clock-time"></b></span><span class="head-actions"><button class="nav-alert" hidden></button><button class="notch-settings icon-button" aria-label="${l('island.settings')}" title="${l('island.settings')}">${icon('gear',15)}</button><button class="notch-pin icon-button" aria-label="${l('island.pin_the_detail_panel')}" title="${l('island.pin_the_detail_panel')}" aria-pressed="false">${icon('pin',15)}</button></span></header><div class="pages" aria-roledescription="carousel" aria-label="${l('island.island_pages')}"><div class="track"><div class="page" data-page="agents" role="group" aria-roledescription="${l('island.page')}" aria-label="${pageTitle('agents')}"><div class="focus-card" style="--i:0"></div><div class="filters list-head" style="--i:1"><span class="seg-src" role="group" aria-label="${l('island.source')}"></span><span class="st-group" role="group" aria-label="${l('island.state')}"></span></div><div class="notch-scroll"></div><footer class="island-foot"><button class="foot-btn notch-office">${icon('expand',14)}<span>${l('island.open_office')}</span></button><button class="foot-btn notch-limits" aria-pressed="false" aria-controls="limits-panel">${icon('gauge',14)}<span>${l('island.limits')}</span></button><span class="foot-note"></span></footer></div></div></div><div class="notch-feedback" role="status" hidden></div></section></div></div><div class="island-mascot"></div><button class="capsule-face" data-left="mascot" data-right="status" aria-expanded="false" aria-controls="island-face"><span class="cap-side cap-left"><span class="capsule-spacer" aria-hidden="true"></span><span class="cap-battery" role="img" hidden></span><span class="capsule-media"></span></span><span class="cap-strip"><b class="cap-clock"></b><span class="cap-extra" role="img"></span></span><span class="cap-side cap-right"><span class="capsule-badge" hidden></span><span class="capsule-ring">${icon('bell', 14)}</span><span class="capsule-focus"><svg class="mini-ring" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,.18)"/><circle class="mini-value" cx="10" cy="10" r="8" pathLength="100" stroke-dasharray="100" stroke-linecap="round"/></svg><b class="cf-time"></b></span><span class="cap-status"><span class="notch-light"></span><em class="cap-count"></em></span></span><span class="capsule-text sr">AgentOffice</span><span class="sign-toast" aria-live="polite"></span></button></div><div class="limits-slot"><div class="limits-shape"></div><aside id="limits-panel" class="limits-panel" aria-label="${l('island.limits')}" inert></aside></div></div>`;
  const q = <T extends Element = HTMLElement>(selector:string) => root.querySelector<T>(selector)!;
  let workingBefore = new Set<string>(), mascotSeen: Snapshot | undefined;
  let snapshot: Snapshot | undefined, disposed = false; const requests = new Map<string,PendingRequest>(), sending = new Set<string>();
  const mascot = createMascot(q('.island-mascot'), { compact: true, reducedMotion: prefs.reducedMotion });

  // Live glass: the shell streams the desktop behind the notch window and the
  // GPU turns it into dark smoked glass inside the shapes (glass.ts).
  // Each request waits for the next frame, so there is no busy polling.
  const backdrop = q<HTMLCanvasElement>('.glass-backdrop');
  let glass: ReturnType<typeof createGlass> = null;
  try { glass = createGlass(backdrop); } catch { glass = null; }
  let backdropSeq = 0;
  // Without a live frame (notch allowed in screenshots, or hidden) the glass
  // draws over a flat dark frame: same shape, edge and motion, no backdrop.
  let darkLook = false, pulling = false;
  const flat = document.createElement('canvas'); flat.width = flat.height = 4;
  { const g = flat.getContext('2d')!; g.fillStyle = '#2c2e31'; g.fillRect(0, 0, 4, 4); }
  const useFlat = () => { if (!glass || darkLook) return; glass.setFrame(flat, { x: 0, y: 0, w: innerWidth, h: innerHeight }); backdrop.hidden = false; root.classList.add('live-glass'); drawGlass(); };
  const panelAlpha = () => Number(getComputedStyle(q('.limits-shape')).opacity) || 0;
  // The shoulders' size as drawn now (they grow and shrink with the island).
  const shoulder = () => q('.shoulder.l').getBoundingClientRect().height;
  const glassShapes = (): GlassShape[] => {
    const list: GlassShape[] = [];
    const resting = root.classList.contains('dock-line') && !root.classList.contains('expanded');
    const island = q('.island-shape').getBoundingClientRect();
    if (!resting) list.push({ x: island.left, y: island.top, w: island.width, h: island.height, r: parseFloat(getComputedStyle(q('.island-shape')).borderBottomLeftRadius) || 0, flush: true, s: shoulder() });
    const panel = q('.limits-shape').getBoundingClientRect();
    const alpha = panelAlpha();
    if (alpha > .01) list.push({ x: panel.left, y: panel.top, w: panel.width, h: panel.height, r: 22, flush: false, alpha });
    return list;
  };
  const drawGlass = () => {
    if (!glass || darkLook || !root.classList.contains('live-glass')) return;
    glass.draw(glassShapes());
  };
  // The plain dark look needs no picture of the desktop: the pulls stop, and start again with glass.
  const pullBackdrop = async () => {
    if (disposed || darkLook) { pulling = false; return; }
    pulling = true;
    try {
      const res = await fetch(`http://backdrop.localhost/frame?after=${backdropSeq}`);
      // The look turned dark while this frame was on its way: it is not used.
      if (darkLook) { pulling = false; return; }
      if (res.status === 200 && glass) {
        backdropSeq = Number(res.headers.get('X-Seq')) || backdropSeq;
        const [x, y, w, h] = (res.headers.get('X-Rect') || '0,0,0,0').split(',').map(Number);
        const bitmap = await createImageBitmap(await res.blob());
        const dpr = window.devicePixelRatio || 1;
        glass.setFrame(bitmap, { x: x / dpr, y: y / dpr, w: w / dpr, h: h / dpr }); bitmap.close();
        backdrop.hidden = false; root.classList.add('live-glass');
        drawGlass();
      } else if (res.status === 204 && res.headers.get('X-Idle') === '1') {
        backdropSeq = 0; if (glass) useFlat(); else { backdrop.hidden = true; root.classList.remove('live-glass'); }
      }
    } catch { backdrop.hidden = true; root.classList.remove('live-glass'); await new Promise(r => setTimeout(r, 500)); }
    if (!disposed) setTimeout(pullBackdrop, 0); else pulling = false;
  };
  const setLook = (dark: boolean) => {
    darkLook = dark; root.classList.toggle('theme-dark', dark);
    if (dark) { backdrop.hidden = true; root.classList.remove('live-glass'); }
    else if ('__TAURI_INTERNALS__' in window) { useFlat(); if (!pulling) void pullBackdrop(); }
  };
  if ('__TAURI_INTERNALS__' in window) { useFlat(); void pullBackdrop(); }
  // A message about something that went wrong: it says it in full, closes by itself after a few
  // seconds (or with its ×), and a new one, or another page, takes its place.
  // The island grows by the message's height while it shows, so it covers nothing on the page.
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined, feedbackH = 0;
  const fitFeedback = () => { const f = q<HTMLElement>('.notch-feedback'); feedbackH = f.hidden ? 0 : f.offsetHeight + 8; root.style.setProperty('--feedback-h', `${feedbackH}px`); try { if (pager.current) applySize(pager.current as PageId); } catch { /* not built yet */ } };
  const hideFeedback = () => { clearTimeout(feedbackTimer); if (q<HTMLElement>('.notch-feedback').hidden) return; q<HTMLElement>('.notch-feedback').hidden = true; fitFeedback(); };
  const report = (message:string) => { if (disposed) return; const f = q<HTMLElement>('.notch-feedback'); f.innerHTML = `<span>${e(fromApp(message))}</span><button type="button" class="feedback-close" aria-label="${e(l('island.close'))}" title="${e(l('island.close'))}">${icon('close', 12)}</button>`; f.hidden = false; fitFeedback(); clearTimeout(feedbackTimer); feedbackTimer = setTimeout(hideFeedback, 6000); };
  // Where a click on a waiting request (or its notification) leads: the office (the agent shown and
  // its question opened there, where it is answered), or the chat itself.
  let notifyClick: Settings['notifyClick'] = 'office';
  const goToAsk = (key: import('../shared/contract').SessionKey) => {
    if (notifyClick === 'source') { void bridge.openInSource(key.sessionId).then(ok => { if (!ok) void bridge.openOffice(key); }).catch(err => report(String(err))); return; }
    void bridge.openOffice(key).catch(err => report(String(err)));
  };

  // Shape reporting, exactly as drawn (the native side cuts the window region a little outside
  // it, so the soft edge is never cut into steps). While something animates the shapes only feed
  // the pointer test and the region stays the whole window; when it settles the region is cut
  // once. Cutting the region on every frame made opening stutter.
  let lastShape = '', animateUntil = 0, pumping = false, sentMoving = false, prevKey = '', still = 0, shapeSends = 0;
  const radius = (el: Element) => parseFloat(getComputedStyle(el).borderBottomLeftRadius) || 0;
  const measureShapes = () => {
    const rects: { x:number; y:number; w:number; h:number; r:number; flush:boolean; s?:number }[] = [];
    const shape = q('.island-shape').getBoundingClientRect();
    rects.push({ x: shape.left, y: shape.top, w: shape.width, h: shape.height, r: radius(q('.island-shape')), flush: true, s: shoulder() });
    const panel = q('.limits-shape').getBoundingClientRect();
    if (panelAlpha() > .01) rects.push({ x: panel.left, y: panel.top, w: panel.width, h: panel.height, r: 22, flush: false });
    return { rects, key: JSON.stringify(rects.map(r => [r.x, r.y, r.w, r.h, r.r, r.s ?? 0].map(v => Math.round(v * 4)))) };
  };
  // "Moving" only while the outline really changes from frame to frame (a loop kept running by
  // something else never leaves the region the whole window).
  const sendShape = (pumpingNow: boolean) => {
    const { rects, key } = measureShapes();
    if (key !== prevKey) { prevKey = key; still = 0; } else still++;
    const moving = pumpingNow && still < 2;
    if (key !== lastShape || moving !== sentMoving) {
      lastShape = key; sentMoving = moving; shapeSends++;
      // While moving, the region is the island's own area (and the limits panel's, when shown).
      let area;
      // The area is set once for the whole move, so it holds the panel's whole room (its slot where
      // it would stand without the pull towards the island, which it never goes past), not the
      // panel's rectangle of that moment: an opening panel is drawn shrunk and shifted for a few
      // frames, and a region cut to it kept the panel's right strip off until the move settled.
      if (moving) {
        const a = q('.island-area').getBoundingClientRect(), slot = q('.limits-slot').getBoundingClientRect();
        const withPanel = root.classList.contains('limits-open') || panelAlpha() > .01, left = q('.notch-stage').classList.contains('panel-left');
        const room = slot.width + (parseFloat(getComputedStyle(q('.notch-stage')).columnGap) || 0) * (parseFloat(getComputedStyle(q('.notch-stage')).zoom) || 1);
        const x0 = withPanel && left ? a.left - room : a.left, x1 = withPanel && !left ? a.right + room : a.right;
        area = { x: x0, y: 0, w: x1 - x0, h: withPanel ? Math.max(a.bottom, slot.bottom) : a.bottom, r: 0, flush: true };
      }
      void bridge.notchShape(rects, moving, area).catch(() => {});
    }
  };
  const pump = () => {
    const more = !disposed && performance.now() < animateUntil;
    sendShape(more); drawGlass();
    if (more) requestAnimationFrame(pump); else pumping = false;
  };
  // Animations run at the user's speed; the shapes are followed for as long.
  let motion = 1;
  const animate = (ms = 620) => { animateUntil = Math.max(animateUntil, performance.now() + ms * Math.max(1, motion)); if (!pumping) { pumping = true; requestAnimationFrame(pump); } };

  // How the closed island rests where it is now (the user's choice for the desktop, an app, a
  // browser or a full screen; the shell judges the place). "Hidden" draws as the small island
  // while it closes; the window then leaves the screen.
  let dockMode: RestLook = 'capsule';
  const settleDock = () => {
    root.classList.toggle('dock-line', dockMode === 'line');
    root.classList.toggle('dock-hidden', dockMode === 'hidden');
    animate();
  };
  let enterTimer: ReturnType<typeof setTimeout> | undefined;
  // The last pointer and open/close events with their times, for checking the real app.
  const events: [number, string][] = [];
  const trace = (what: string) => { events.push([Math.round(performance.now()), what]); if (events.length > 300) events.shift(); };
  const resize = (expanded:boolean) => {
    trace(expanded ? 'open' : 'close');
    if (!expanded) { clearTyped(); holding = false; frozen = null; lookedAt = ''; opened.clear(); unpressNow(); queueMicrotask(render); }
    if (expanded) askQuiet();
    if (expanded && !root.classList.contains('expanded')) { root.classList.add('entering'); clearTimeout(enterTimer); enterTimer = setTimeout(() => root.classList.remove('entering'), 700); }
    if (expanded !== root.classList.contains('expanded')) mascot.setOpen?.(expanded);
    root.classList.toggle('expanded', expanded); q('.island-face').toggleAttribute('inert', !expanded);
    q('.capsule-face').setAttribute('aria-expanded', String(expanded)); settleDock();
    void bridge.resizeNotch(expanded).catch(err => report(String(err)));
  };
  const controller = createNotchController(resize);
  // Pages: the user's order and choice (agents always), the one shown, the one last used.
  const built: PageId[] = ['agents', 'media', 'notes', 'focus', 'alarms', 'water', 'shelf'];
  const pageEl = (id: PageId) => { const el = document.createElement('div'); el.className = 'page'; el.dataset.page = id; el.setAttribute('role', 'group'); el.setAttribute('aria-roledescription', l('island.page')); el.setAttribute('aria-label', pageTitle(id)); q('.track').append(el); return el; };
  // Pages may report a new height while they are built, before the pager exists: that first report is left out (the pager sizes the page itself).
  let pagerReady = false;
  const resized = () => { if (pagerReady && pager.current) applySize(pager.current as PageId); };
  const media = createMediaPage(pageEl('media'), bridge, { l, changed: () => renderCapsule(), report, resized });
  const notes = createNotesPage(pageEl('notes'), bridge, { l, locale, report, resized });
  const focus = createFocusPage(pageEl('focus'), bridge, { l, changed: () => renderCapsule(), report, newAlarm: () => { pager.show('alarms'); alarms.newAlarm(); } });
  const alarms = createAlarmsPage(pageEl('alarms'), bridge, { l, locale, report, changed: () => renderCapsule(), resized, openFocus: () => pager.show('focus') });
  const water = createWaterPage(pageEl('water'), bridge, { l, report, changed: () => {}, resized });
  const shelf = createShelfPage(pageEl('shelf'), bridge, { l, report, resized });
  let pageSettings: Settings['pages'] = PAGE_IDS.map(id => ({ id, on: true })), startPage: Settings['startPage'] = 'last';
  const savedPage = (): PageId | null => { try { const v = localStorage.getItem(PAGE_KEY) as PageId | null; return v && PAGE_IDS.includes(v) ? v : null; } catch { return null; } };
  const visiblePages = (): PageId[] => pageSettings.filter(p => (p.on || p.id === 'agents') && built.includes(p.id)).map(p => p.id);
  let pagingTimer: ReturnType<typeof setTimeout> | undefined, graceUntil = 0;
  // The page's own wish for less height (a short list, an empty state), within its size.
  const pageHeight = (page: PageId) => Math.min(PAGE_SIZE[page].h, Math.max(150, ({ notes: notes.height(), alarms: alarms.height(), water: water.height(), shelf: shelf.height() } as Partial<Record<PageId, number | null>>)[page] ?? PAGE_SIZE[page].h));
  let sizeKey = '';
  const applySize = (page: PageId) => {
    // The media page widens for its lyrics column.
    const w = page === 'media' && media.wide() ? 780 : PAGE_SIZE[page].w, h = (page === 'media' && media.wide() ? 246 : pageHeight(page)) + feedbackH, key = `${w}x${h}`;
    if (key === sizeKey) return;
    const before = sizeKey.split('x').map(Number); sizeKey = key;
    // Narrower or lower than before: a pointer the island leaves behind gets a moment to return.
    if (controller.expanded && (w < (before[0] || 0) || h < (before[1] || 0))) graceUntil = performance.now() + NARROW_GRACE_MS * Math.max(1, motion);
    root.style.setProperty('--page-w', `${w}px`); root.style.setProperty('--page-h', `${h}px`); root.classList.toggle('narrow-page', w < 560);
    animate(520);
  };
  const pageChanged = (id: string, remember: boolean) => {
    const page = id as PageId; hideFeedback();
    if (remember) { try { localStorage.setItem(PAGE_KEY, page); } catch { /* A convenience only. */ } }
    root.classList.add('paging'); clearTimeout(pagingTimer); pagingTimer = setTimeout(() => root.classList.remove('paging'), 420 * Math.max(1, motion));
    applySize(page); root.dataset.page = page;
    if (page === 'shelf' && controller.expanded) void shelf.refresh();
    root.querySelectorAll<HTMLElement>('.page').forEach(el => el.toggleAttribute('inert', el.dataset.page !== page));
    renderNav(); renderTitle(); animate(520); queueMicrotask(render);
  };
  const pager = createPager({ viewport: q('.pages'), track: q('.track'), changed: pageChanged, moving: dragging => { if (dragging) animate(2000); } });
  pagerReady = true;
  function renderNav() {
    const list = pager.pages, at = list.indexOf(pager.current);
    root.classList.toggle('single-page', list.length < 2);
    const dots = list.map(id => `<button data-page-dot="${id}" aria-label="${e(pageTitle(id as PageId))}" title="${e(pageTitle(id as PageId))}" aria-current="${id === pager.current}"></button>`).join('');
    const nav = q('.page-dots'); if (nav.innerHTML !== dots) nav.innerHTML = dots;
    const name = (by: number) => pageTitle(list[(at + by + list.length) % list.length] as PageId);
    if (list.length > 1) { q('.page-arrow.prev').title = `${l('island.previous')}: ${name(-1)}`; q('.page-arrow.next').title = `${l('island.next')}: ${name(1)}`; }
  }
  let headline = 'AgentOffice', collapsedChoice: Settings['collapsed'] = 'auto', waitingCount = 0, workingCount = 0;
  // Closed: the agents (mascot, headline, count), the focus countdown or the playing media, as
  // chosen; "auto" shows what waits for the user first, then a running timer, then playing media.
  // Whatever it shows, a waiting request keeps its count and colour.
  function renderCapsule() {
    const f = focus.compact(), m = pageSettings.find(p => p.id === 'media')?.on === false ? null : media.compact();
    // Left: what plays (picture and bars), else the mascot. Right: what waits for the user first
    // (it is never hidden), then a running timer, then how many work. The clock stays in the middle.
    const left = m && (collapsedChoice === 'media' || (collapsedChoice !== 'agents' && m.playing)) ? 'media' : 'mascot';
    // A ringing alarm comes next after a waiting request: a shaking bell until snoozed or dismissed.
    const right = waitingCount ? 'badge' : alarms.ringing ? 'ring' : f &&collapsedChoice !== 'agents' && collapsedChoice !== 'media' ? 'focus' : f && collapsedChoice === 'media' ? 'focus' : 'status';
    const face = q('.capsule-face');
    if (face.dataset.left !== left || face.dataset.right !== right) { face.dataset.left = left; face.dataset.right = right; root.classList.toggle('capsule-other', left !== 'mascot'); placeMascot(); face.dispatchEvent(new Event('left-change')); }
    if (f) {
      q('.cf-time').textContent = f.text;
      const v = q<HTMLElement>('.mini-value'); v.style.stroke = f.mode === 'focus' ? '#9b85ff' : f.mode === 'short' ? '#4fcf8a' : f.mode === 'countdown' ? '#ffc04d' : '#5ab4ff'; v.style.strokeDashoffset = String(100 * (1 - f.share));
      q('.capsule-focus').title = f.running ? ({ focus: l('island.focus'), short: l('island.short_break'), long: l('island.long_break'), countdown: l('island.countdown') } as Record<string, string>)[f.mode] : l('island.paused');
    }
    if (m) {
      const html = `${m.art ? `<img class="cm-art${m.site ? ' site-icon' : ''}" src="${e(m.art)}" alt="">` : `<span class="cm-art none">${icon('music', 12)}</span>`}<span class="cm-bars${m.playing ? ' on' : ''}" aria-label="${e(m.playing ? l('island.playing') : l('island.paused'))}"><i></i><i></i><i></i></span>`;
      const box = q('.capsule-media'); if (box.dataset.html !== html) { box.dataset.html = html; box.innerHTML = html; }
      box.title = m.title;
    }
    const badge = q<HTMLElement>('.capsule-badge'); badge.hidden = !waitingCount; badge.textContent = String(waitingCount);
    const count = q('.cap-count'); const n = workingCount ? String(workingCount) : ''; if (count.textContent !== n) count.textContent = n;
    face.title = headline;
  }
  function renderTitle() {
    const text = pager.current === 'agents' || !pager.current ? headline : pageTitle(pager.current as PageId);
    const el = q('.notch-text'); if (el.textContent !== text) el.textContent = text;
  }
  const applyPages = () => {
    const list = visiblePages(); const before = pager.current;
    // The page elements in the user's order, hidden ones out of the track.
    for (const id of PAGE_IDS) { const el = root.querySelector<HTMLElement>(`.page[data-page="${id}"]`); if (el) el.hidden = !list.includes(id); }
    list.forEach(id => { const el = root.querySelector<HTMLElement>(`.page[data-page="${id}"]`); if (el) q('.track').append(el); });
    pager.setPages(list);
    if (!before) { const first = startPage === 'last' ? savedPage() : startPage; pager.show(first && list.includes(first) ? first : list[0], { remember: false, instant: true }); }
    pageChanged(pager.current, false);
  };
  applyPages();
  // The date and time in the header, kept to the minute.
  const clockFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }), timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  // Turkish as the system's own clock reads it ("Paz 25 Eki", the weekday first); every other
  // language in its own order and words ("Wed, Oct 28", "10月28日(水)").
  const dateText = (now: Date) => { if (!locale.startsWith('tr')) return clockFormat.format(now); const part = (t: string) => clockFormat.formatToParts(now).find(x => x.type === t)?.value ?? ''; return `${part('weekday')} ${part('day')} ${part('month')}`; };
  const weekdayText = (now: Date) => clockFormat.formatToParts(now).find(x => x.type === 'weekday')?.value ?? '';
  let clockStyle: Settings['clockStyle'] = 'time';
  const tick = () => { const now = new Date(), time = timeFormat.format(now); q('.clock-date').textContent = dateText(now); q('.clock-time').textContent = time; q('.cap-clock').textContent = clockStyle === 'date' ? `${weekdayText(now)} ${time}` : time; };
  // The status strip in the small island's middle (and the battery at its left end without the mascot).
  let islandStatus: IslandStatus = {}, ringList: Reminder[] = [];
  let stripChoice: Pick<Settings, 'statusBattery' | 'statusAudio' | 'statusWeather' | 'statusAlarm' | 'hideMascot'> = { statusBattery: true, statusAudio: false, statusWeather: false, statusAlarm: false, hideMascot: false };
  // A status item's span: from what shows at the left end to what shows at the right, a little apart.
  // The working count shows only with the time: on another item it fades and the item takes its place,
  // kept in the island's middle (a waiting request, a timer or a ringing alarm stays at the right end).
  const stripRoom = () => {
    const face = q('.capsule-face'), s = q('.cap-strip').getBoundingClientRect(), scale = s.width / (q('.cap-strip').offsetWidth || s.width) || 1;
    const stepped = face.classList.contains('strip-extra');
    const shown = (side: Element) => [...side.children].filter(c => c.getBoundingClientRect().width > 0 && getComputedStyle(c).visibility !== 'hidden' && !(stepped && c.matches('.cap-status')));
    const leftEnd = Math.max(s.left, ...shown(q('.cap-left')).map(c => c.getBoundingClientRect().right)), rightStart = Math.min(s.right, ...shown(q('.cap-right')).map(c => c.getBoundingClientRect().left));
    const width = (rightStart - leftEnd) / scale - 10, free = { left: (leftEnd - s.left) / scale + 5, width };
    if (stepped && face.dataset.right === 'status') { const mid = (s.left + s.right) / 2, half = Math.min(mid - leftEnd, rightStart - mid), w = 2 * half / scale - 10; if (w > 24) return { left: (mid - half - s.left) / scale + 5, width: w, wide: free }; }
    return face && width > 24 ? free : null;
  };
  const strip = createStrip(q('.cap-strip'), q('.cap-clock'), q('.cap-extra'), () => controller.expanded || q('.capsule-face').matches(':hover') || root.classList.contains('signing'), stripRoom, onExtra => q('.capsule-face').classList.toggle('strip-extra', onExtra));
  const refreshStrip = () => {
    // The left end is the battery's only while nothing plays there; else the battery turns in the strip.
    const leftFree = q('.capsule-face').dataset.left !== 'media', choice = { ...stripChoice, hideMascot: stripChoice.hideMascot && leftFree };
    strip.set(stripItems(islandStatus, choice, nextRing(ringList, Date.now()), l));
    const b = islandStatus.battery, cell = q<HTMLElement>('.cap-battery'), shown = !!b && choice.statusBattery && choice.hideMascot;
    cell.hidden = !shown;
    if (b && shown) { if (!cell.querySelector('span')) cell.append(document.createElement('span')); setRing(cell, b.percent, b.charging, 17); cell.querySelector('span')!.textContent = number(b.percent / 100, { style: 'percent', maximumFractionDigits: 0 }); cell.setAttribute('aria-label', l(b.charging ? 'strip.battery_charging' : 'strip.battery', { percent: number(b.percent / 100, { style: 'percent', maximumFractionDigits: 0 }) })); }
    root.classList.toggle('cap-has-battery', shown);
    strip.relayout();
  };
  q('.capsule-face').addEventListener('left-change', refreshStrip);
  // Tests photographing or measuring the island show one strip item at a time.
  (window as { __islandStrip?: typeof strip }).__islandStrip = strip;
  void bridge.status().then(s => { islandStatus = s; refreshStrip(); }).catch(() => {});
  const stopStatus = bridge.onStatus(s => { islandStatus = s; refreshStrip(); });
  void bridge.reminders().then(r => { ringList = r; refreshStrip(); }).catch(() => {});
  const stopRings = bridge.onReminders(r => { ringList = r; refreshStrip(); });
  tick(); const clock = setInterval(() => { tick(); refreshStrip(); }, 15_000);
  // The playing bars at the left end: a gentle wave, each bar a third apart, moved about six times a
  // second only while they are there and something plays (nothing to do otherwise).
  const bars = setInterval(() => {
    if (controller.expanded || root.classList.contains('reduce-motion')) return;
    const list = root.querySelectorAll<HTMLElement>('.capsule-face[data-left=media] .cm-bars.on i'); if (!list.length) return;
    const t = performance.now() / 900;
    list.forEach((bar, i) => { bar.style.transform = `scaleY(${(0.25 + 0.75 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t + i / 3)))).toFixed(2)})`; });
  }, 160);
  // The mascot sits at the capsule's left end and the message in its middle: the mascot
  // canvas follows the capsule's spacer, re-measured after text changes and once fonts have loaded.
  // With media or a countdown at the left end the spacer is hidden (no box, left 0): the mascot
  // then fades at the capsule's left end, never outside the island.
  const placeMascot = () => {
    const spacer = q<HTMLElement>('.capsule-spacer'), area = q<HTMLElement>('.island-area');
    const at = spacer.offsetParent ? spacer : q<HTMLElement>('.cap-left');
    const zoom = parseFloat(getComputedStyle(q('.notch-stage')).zoom) || 1;
    q<HTMLElement>('.island-mascot').style.setProperty('--mascot-x', `${Math.round((at.getBoundingClientRect().left - area.getBoundingClientRect().left) / zoom)}px`);
  };
  void document.fonts?.ready.then(() => { if (!disposed) placeMascot(); });
  // The card shows, in order: an open question or permission, from any office whatever
  // the filters say (several: a counter and steps; one outside the filter says so); else
  // the main chat whose real work is the latest (its helpers' work counts for it and they
  // are counted under it); else that nobody works, with the last real reply apart. It
  // holds while looked at or pressed (a small mark tells of something newer), returns to
  // the latest once let go, and never jumps on every event. Rows update in place and keep
  // their place under the pointer. Colour stays in small dots, thin edges and the chosen
  // option's light ground, always beside words.
  const statusText = (state: Person['state']) => ({ working: l('island.working'), waiting: l('island.waiting_for_you'), idle: l('island.idle'), unverified: l('island.current_state_unknown'), history: l('island.past'), ended: l('island.closed') })[state];
  const dotOf = (state: Person['state']) => `st-${state === 'ended' ? 'history' : state}`;
  const tile = (provider: string, size = 16) => `<span class="tile tile-${provider === 'claude' || provider === 'codex' ? provider : 'other'}">${provider === 'claude' ? mark('claude', size) : provider === 'codex' ? mark('openai', size) : icon('office', size)}</span>`;
  const providerName = (provider: string) => provider === 'claude' ? 'Claude' : provider === 'codex' ? 'Codex' : provider;
  const agoShort = (at: number) => { const m = Math.max(0, Math.round((Date.now() - at) / 60000)); return m < 1 ? l('island.now') : m < 60 ? unitShort(m, 'minute') : m < 2880 ? unitShort(Math.round(m / 60), 'hour') : unitShort(Math.round(m / 1440), 'day'); };
  const agoText = (at: number) => Date.now() - at < 60_000 ? l('island.just_now') : ago(at);
  const names = () => snapshot?.officeNames;
  const place = (p: Person) => officeName(p.session, names());
  const asks = (r?: PendingRequest) => r?.kind === 'question' ? l('island.has_a_question') : l('island.asks_permission');
  // A chat whose current state is unknown says when it was last seen (it is not counted working, idle or closed).
  const brief = (p: Person) => p.state === 'unverified' ? `${statusText(p.state)} · ${l('island.last_seen')} ${agoText(p.session.lastActivity)} · ${place(p)}` : `${p.state === 'working' ? p.activity : p.state === 'waiting' ? asks(p.request) : statusText(p.state)} · ${place(p)}`;
  // When a chat (or one of its helpers) last really worked.
  const lastWork = (p: Person) => Math.max(p.session.lastActivity, ...p.helpers.map(h => h.lastActivity));
  // Three states, all on view: a chat whose current state is unknown rests with the idle ones
  // (its row says it is unknown); a past chat (quiet for days) is in the office, not here.
  type Status = 'working' | 'waiting' | 'idle';
  type Source = 'all' | 'claude' | 'codex';
  const inTab = (p: Person, id: Status) => p.state === id || (id === 'idle' && p.state === 'unverified');
  // The filters are the user's and come back after a restart; nothing changes them silently.
  const saved = (() => { try { return JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}'); } catch { return {}; } })();
  let source: Source = ['all', 'claude', 'codex'].includes(saved.source) ? saved.source : 'all';
  // The former "More" states (past, unknown) saved as the choice open on the idle chats.
  let status: Status = ['working', 'waiting', 'idle'].includes(saved.status) ? saved.status : ['history', 'unverified'].includes(saved.status) ? 'idle' : 'working';
  const keepFilters = () => { try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ source, status })); } catch { /* A preference only. */ } };
  let cardKind = '', cardHtml = '', freshTimer: ReturnType<typeof setTimeout> | undefined;
  // Texts opened in the card (by request or chat and field), with where each was scrolled to;
  // kept across live updates until the island closes.
  const opened = new Map<string, number>();
  // Only a text that is cut off offers to show all of it; an opened one comes back open, scrolled where it was.
  const fitTexts = () => root.querySelectorAll<HTMLElement>('.focus-card [data-more]').forEach(el => {
    const key = el.dataset.more!, open = opened.has(key);
    el.classList.toggle('open', open);
    const cut = open || el.scrollHeight > el.clientHeight + 1;
    el.classList.toggle('more', cut);
    if (cut) { el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-expanded', String(open)); el.title = open ? l('island.show_less') : l('island.show_all'); }
    else { el.removeAttribute('role'); el.removeAttribute('tabindex'); el.removeAttribute('aria-expanded'); el.removeAttribute('title'); }
    if (open) el.scrollTop = opened.get(key) ?? 0;
  });
  const toggleText = (el: HTMLElement) => {
    const key = el.dataset.more!;
    if (opened.has(key)) opened.delete(key); else opened.set(key, 0);
    fitTexts();
  };
  let holding = false, pressing = false, dirty = false, lookedAt = '', frozen: string[] | null = null, pressTimer: ReturnType<typeof setTimeout> | undefined;
  // When each open request was first seen here, so a new one can be the one shown.
  const firstSeen = new Map<string, number>(); let alertAt = 0;
  // Why notifications are quiet now (full screen, do-not-disturb), asked when a request waits.
  let quiet: 'fullscreen' | 'dnd' | null = null;
  // While something waits, whether notifications are quiet now (then the light and the count
  // stay and nothing opens or sounds): asked every few seconds and whenever the island opens.
  const askQuiet = () => { if (!root.classList.contains('has-waiting')) return; void bridge.notifyPrefs().then(p => { const next = p?.quiet ?? null; if (next !== quiet) { quiet = next; renderFoot(); } }).catch(() => {}); };
  const quietTimer = setInterval(askQuiet, 3000);
  // The time left before a question that waits in AgentOffice passes to Claude's own window.
  const holdText = (until: number) => { const s = Math.max(0, Math.ceil((until - Date.now()) / 1000)); return l('island.passes_to_claude_in', { floor: Math.floor(s / 60), padStart: String(s % 60).padStart(2, '0') }); };
  const askTimer = setInterval(() => { if (!root.classList.contains('has-waiting')) return; root.querySelectorAll<HTMLElement>('.focus-card [data-hold]').forEach(el => { const t = holdText(Number(el.dataset.hold)); if (el.textContent !== t) el.textContent = t; }); }, 1000);
  // The person on the card and since when, so it does not jump on every event.
  let shown: { id: string; at: number } | null = null;
  // Every tool the island hears of (Claude and Codex always; others once their chats or connection appear).
  const toolsOf = (s: Snapshot) => [...new Set(['claude', 'codex', ...s.connections.map(c => c.provider), ...s.sessions.map(x => x.key.provider)])];
  const ofSource = (p: Person, src: Source = source) => src === 'all' || p.session.key.provider === src;
  // Every open question or permission with the chat it belongs to (a helper's goes to its chat);
  // two from one chat are two.
  const openAsks = (list: Person[]) => {
    const byId = new Map(list.map(p => [sessionId(p.session.key), p]));
    return (snapshot?.requests ?? []).filter(r => r.status === 'pending' || r.status === 'answering').flatMap(r => {
      const s = snapshot!.sessions.find(x => sessionId(x.key) === sessionId(r.key.sessionKey));
      const owner = byId.get(sessionId(s?.parentKey ?? r.key.sessionKey));
      return owner ? [{ p: owner, r }] : [];
    });
  };
  function renderFilters(list: Person[]) {
    const sources: [Source, string][] = [['all', l('island.all')], ['claude', 'Claude'], ['codex', 'Codex']];
    const states: [Status, string][] = [['working', l('island.working')], ['waiting', l('island.waiting_for_you')], ['idle', l('island.idle')]];
    // The source is a narrow switch (its counts in the tooltip); each state's count is within the chosen source.
    const srcHtml = sources.map(([id, label]) => { const n = list.filter(p => ofSource(p, id) && inTab(p, status)).length; return `<button class="${source === id ? 'on' : ''}" data-filter="${id}" aria-pressed="${source === id}" title="${e(`${l('island.source')}: ${label} · ${statusText(status)}: ${n}`)}">${id === 'all' ? e(label) : `${tile(id, 9)}<span class="sr">${e(label)}</span>`}</button>`; }).join('');
    const stHtml = states.map(([id, label]) => { const n = list.filter(p => ofSource(p) && inTab(p, id)).length; return `<button class="st-${id}${status === id ? ' on' : ''}" data-status="${id}" aria-pressed="${status === id}" title="${e(`${l('island.state')}: ${statusText(id)} · ${n}`)}"><i class="d"></i>${e(label)}<em>${n}</em></button>`; }).join('');
    const a = q('.seg-src'), b = q('.st-group');
    if (a.innerHTML !== srcHtml) a.innerHTML = srcHtml;
    if (b.innerHTML !== stHtml) b.innerHTML = stHtml;
  }
  function renderList(list: Person[]) {
    if (!snapshot) return;
    let rowsOf = list.filter(p => ofSource(p) && inTab(p, status)).sort((a, b) => b.session.lastActivity - a.session.lastActivity);
    // While the pointer is over the panel nobody changes place: rows keep their order,
    // newcomers join at the end and anyone who left this state stays until the pointer goes.
    if (holding && frozen) {
      const byId = new Map(list.map(p => [sessionId(p.session.key), p]));
      const kept = frozen.map(id => byId.get(id)).filter((p): p is Person => !!p);
      rowsOf = [...kept, ...rowsOf.filter(p => !frozen!.includes(sessionId(p.session.key)))];
    }
    frozen = rowsOf.map(p => sessionId(p.session.key));
    const named = new Map<string, number>(); rowsOf.forEach(p => named.set(p.session.name, (named.get(p.session.name) ?? 0) + 1));
    const placed = new Map<string, number>(); rowsOf.forEach(p => { const k = `${p.session.name}|${place(p)}`; placed.set(k, (placed.get(k) ?? 0) + 1); });
    const begun = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    // Chats of one name ("Yan sohbet") told apart by what is known of each: its own title when it
    // differs, its office, else when it began; the row's time says when it was last active.
    const titled = (p: Person) => p.session.title && p.session.title !== p.session.name ? p.session.title : '';
    const apart = (p: Person) => (named.get(p.session.name) ?? 0) < 2 ? '' : titled(p) ? titled(p) : (placed.get(`${p.session.name}|${place(p)}`) ?? 0) < 2 ? place(p) : l('island.began', { format: begun.format(new Date(p.session.startedAt ?? p.session.lastActivity)) });
    const box = q<HTMLElement>('.notch-scroll');
    let rows = box.querySelector<HTMLElement>('.notch-session-list');
    if (!rows) { box.innerHTML = '<div class="notch-session-list"></div>'; rows = box.querySelector<HTMLElement>('.notch-session-list')!; }
    // Rows are updated in place, keyed by chat, so a row under the pointer is never replaced.
    const existing = new Map([...rows.querySelectorAll<HTMLElement>('.row')].map(el => [el.dataset.session!, el]));
    rowsOf.forEach((p, i) => {
      const id = sessionId(p.session.key);
      let row = existing.get(id); existing.delete(id);
      if (!row) { row = document.createElement('button'); row.className = 'row'; row.dataset.session = id; row.style.setProperty('--i', String(i + 2)); }
      const extra = apart(p);
      const html = `${tile(p.session.key.provider)}<span class="row-text"><b>${e(p.session.name)}${extra ? `<span class="apart"> · ${e(extra)}</span>` : ''}</b><small><i class="dot ${dotOf(p.state)}"></i>${e(brief(p))}</small></span><span class="badge">${e(agoShort(p.session.lastActivity))}</span>`;
      if (row.dataset.html !== html) { row.innerHTML = html; row.dataset.html = html; row.title = `${p.session.name}${titled(p) ? ` · ${titled(p)}` : ''} · ${place(p)} · ${l('island.last_activity')} ${agoText(p.session.lastActivity)}`; }
      if (rows!.children[i] !== row) rows!.insertBefore(row, rows!.children[i] ?? null);
    });
    existing.forEach(el => el.remove());
    rows.querySelector('.list-empty')?.remove();
    if (!rowsOf.length) {
      // An empty result says what is empty; the filters stay, and nothing was reset.
      const where = source === 'all' ? '' : `${providerName(source)} · `;
      rows.insertAdjacentHTML('beforeend', `<p class="list-empty">${e(`${where}${l('island.nobody_is', { statusText: statusText(status) })}`)}</p>`);
    }
  }
  function renderCard(list: Person[]) {
    if (!snapshot) return;
    requests.clear();
    const card = q('.focus-card');
    const mine = list.filter(p => ofSource(p));
    // Requests come first from every office: a filter never hides one.
    const waiting = openAsks(list).sort((a, b) => (firstSeen.get(requestId(a.r.key)) ?? 0) - (firstSeen.get(requestId(b.r.key)) ?? 0) || a.r.expiresAt - b.r.expiresAt);
    const scope = source === 'all' ? '' : `${l('island.scope')}: ${providerName(source)} · `;
    // The name and avatar, the row below and the round button all show the chat in its office
    // (its floor, its desk lit for a moment); opening it in its own app is a separate, named button.
    const go = (id?: string) => `<button class="go" ${id ? `data-session="${e(id)}"` : 'data-office-open'} aria-label="${l('island.show_in_office')}" title="${l('island.show_in_office')}">${icon('upright', 15)}</button>`;
    const who = (s: Person['session'], extra = '', label = s.name) => `<button class="chip who${extra}" data-session="${e(sessionId(s.key))}" title="${e(`${s.name} · ${l('island.show_in_office_2')}`)}">${tile(s.key.provider, 12)}<span>${e(label)}</span></button>`;
    // How the chat opens, as its provider says (`open`): the chat itself, or only its tool's window; none: no button.
    const inSource = (s: Person['session']) => !s.open ? '' : `<button class="pill-button src" data-source="${e(s.key.sessionId)}" title="${e(s.open === 'app' ? l('island.shows_the_tool_window', { tool: providerName(s.key.provider) }) : s.key.provider === 'codex' ? l('island.opens_the_chat_in_the') : l('island.opens_the_chat_in_the_2'))}">${tile(s.key.provider, 9)}${e(s.open === 'app' ? l('island.show_tool_window', { tool: providerName(s.key.provider) }) : s.key.provider === 'codex' ? l('island.open_in_codex') : s.key.provider === 'claude' ? l('island.open_in_claude') : l('island.open_in_tool', { tool: providerName(s.key.provider) }))}</button>`;
    // A long text opens in the card (and scrolls there); its key keeps it open across updates.
    const text = (key: string, value: string, cls = 'focus-text') => `<p class="${cls}" data-more="${e(key)}">${e(value)}</p>`;
    const managerTag = (p: Person) => managerOf(snapshot!, { key: officeKey(p.session), people: list.filter(x => officeKey(x.session) === officeKey(p.session)) }) === p ? ` · ${l('island.manager')}` : '';
    let kind: string, html: string;
    if (waiting.length) {
      // The one being looked at stays while the pointer is over the panel.
      let at = waiting.findIndex(x => requestId(x.r.key) === lookedAt); if (at < 0) at = 0;
      const { p, r } = waiting[at], id = requestId(r.key), s = p.session, inClaude = s.key.provider === 'claude';
      lookedAt = id; waiting.forEach(x => requests.set(requestId(x.r.key), x.r));
      kind = `r${id}`;
      const outside = !ofSource(p) ? ` · ${l('island.outside_the_filter')}` : '';
      const nav = waiting.length > 1 ? `<span class="req-nav"><button data-step="-1" aria-label="${l('island.previous_request')}">‹</button>${at + 1}/${waiting.length}<button data-step="1" aria-label="${l('island.next_request')}">›</button></span>` : '';
      // Here only a short summary and the way to it: the question is answered in the office (on
      // the asking agent's balloon) or in the chat itself, as the user chose; never in the notch.
      // A chat with no link to open (a terminal chat) is shown in the office, whatever the choice.
      const inOffice = notifyClick === 'office' || !inSource(s);
      const more = r.questions && r.questions.length > 1 ? ` · ${l('island.questions', { length: r.questions.length })}` : '';
      const hold = r.canAnswer && r.holdUntil ? `<small class="answer-hint" data-hold="${r.holdUntil}">${e(holdText(r.holdUntil))}</small>` : `<small class="answer-hint">${e(inClaude ? l('island.answered_in_claude') : l('island.answered_in_codex'))}</small>`;
      const target = inOffice ? `<button class="pill-button src ask-go" data-ask-go="${e(sessionId(s.key))}" title="${e(l('island.shows_the_agent_in_the'))}">${icon('office', 13)}${e(r.canAnswer && r.questions?.length ? l('island.answer_in_the_office') : l('island.show_in_the_office'))}</button>` : inSource(s);
      html = `<div class="focus-top" data-ask-target>${who(s, r.kind === 'question' ? ' ask' : ' warn')}<span class="focus-hint">${e(`${asks(r)}${more} · ${place(p)}${managerTag(p)}${outside}`)}</span>${nav}</div>`
        + `<div class="ask-summary" data-ask-go="${e(sessionId(s.key))}" role="button" tabindex="0" title="${e(inOffice ? l('island.open_in_the_office') : l('island.open_the_chat'))}">${text(`${kind}|t`, fromApp(r.title) || asks(r))}</div>`
        + `<div class="focus-bottom">${hold}${target}${go(sessionId(s.key))}</div>`;
    } else {
      const working = mine.filter(p => p.state === 'working').sort((a, b) => lastWork(b) - lastWork(a));
      // The card keeps its person a while; while looked at or pressed it keeps them outright.
      const kept = shown && working.find(p => sessionId(p.session.key) === shown!.id);
      const latest = working[0];
      let p = kept ?? latest;
      // Once the user lets go it moves on to anything newer; otherwise only after a while and a clear lead.
      const reading = [...opened.keys()].some(k => kept && k.startsWith(`p${sessionId(kept.session.key)}|`));
      if (kept && latest && kept !== latest && !holding && !pressing && !reading && (shown!.at === 0 || (Date.now() - shown!.at > 8000 && lastWork(latest) - lastWork(kept) > 10_000))) p = latest;
      if (p && (!shown || sessionId(p.session.key) !== shown.id)) shown = { id: sessionId(p.session.key), at: Date.now() };
      const newer = p && latest && p !== latest && lastWork(latest) > lastWork(p) ? `<span class="news" title="${e(l('island.something_newer_happened_the_card'))}"><i></i>${l('island.new')}</span>` : '';
      if (p) {
        const s = p.session; kind = `p${sessionId(s.key)}`;
        const helpers = p.helpers.filter(h => h.status === 'working' && h.verified !== false).length;
        const more = [working.length > 1 ? l('island.more_working', { v: working.length - 1 }) : '', helpers ? l('island.helper_count', { n: helpers }) : ''].filter(Boolean).join(' · ');
        html = `<div class="focus-top">${who(s)}<span class="focus-hint">${e(`${scope}${place(p)}${managerTag(p)}`)}</span>${newer}</div>`
          + text(`${kind}|t`, p.activity)
          + `<div class="focus-bottom"><span class="state-pill ${dotOf(p.state)}"><i class="dot"></i>${e(statusText(p.state))}</span>${more ? `<small class="answer-hint">${e(more)}</small>` : ''}${inSource(s)}${go(sessionId(s.key))}</div>`;
      } else {
        shown = null;
        // Nobody works (in this scope): said plainly, per source; the last real reply apart, with its own time.
        const verified = verifiedProviders(snapshot), inScope = source === 'all' ? toolsOf(snapshot) : [source];
        const unheard = inScope.filter(x => !verified.has(x)), c = counts(mine);
        const last = mine.filter(x => x.session.repliedAt).sort((a, b) => b.session.repliedAt! - a.session.repliedAt!)[0];
        kind = `quiet${last ? sessionId(last.session.key) : ''}`;
        const notes = [unheard.length && unheard.length < inScope.length ? l('island.not_verified', { join: unheard.map(providerName).join(', ') }) : '', c.unverified ? l('island.with_unknown_current_state', { unverified: c.unverified }) : ''].filter(Boolean).join(' · ');
        // The headline already says nobody works; the card tells the last real reply (its own
        // moment and sentence), or what is missing.
        if (last) {
          const s = last.session;
          html = `<div class="focus-top">${who(s, '', shortName(s))}<span class="focus-hint">${e(`${scope}${l('island.last_reply')} · ${place(last)} · ${agoText(s.repliedAt!)}`)}</span></div>`
            + text(`${kind}|t`, s.reply || l('island.replied'))
            + `<div class="focus-bottom"><span class="state-pill ${dotOf(last.state)}"><i class="dot"></i>${e(statusText(last.state))}</span>${notes ? `<small class="answer-hint">${e(notes)}</small>` : ''}${inSource(s)}${go(sessionId(s.key))}</div>`;
        } else {
          const head = unheard.length === inScope.length ? l('island.no_events_yet_they_show') : l('island.no_reply_seen_yet');
          html = `<div class="focus-top"><span class="chip">${tile(source === 'all' ? 'other' : source, 12)}${e(source === 'all' ? l('island.all_offices') : providerName(source))}</span><span class="focus-hint">${e(notes)}</span></div>`
            + `<p class="focus-text">${e(head)}</p>`
            + `<div class="focus-bottom">${go(undefined)}</div>`;
        }
      }
    }
    if (html !== cardHtml) { cardHtml = html; card.innerHTML = html; fitTexts(); }
    if (kind !== cardKind) { cardKind = kind; card.classList.remove('fresh'); void card.offsetWidth; card.classList.add('fresh'); clearTimeout(freshTimer); freshTimer = setTimeout(() => card.classList.remove('fresh'), 500); }
  }
  function render() {
    if (!snapshot || disposed) return;
    // A click in progress (pointer down) is never cut short by a redraw.
    if (pressing) { dirty = true; return; }
    const list = people(snapshot, l).filter(p => p.state !== 'ended'), c = counts(list), line = scopeHeadline(c, l, verifiedProviders(snapshot), toolsOf(snapshot));
    // Open requests: when each was first seen, and which kinds wait (the light's colour).
    const open = openAsks(list).map(x => x.r);
    const ids = new Set(open.map(r => requestId(r.key)));
    for (const id of [...firstSeen.keys()]) if (!ids.has(id)) firstSeen.delete(id);
    // A request that arrives with its notification is the one the card opens on.
    open.forEach(r => { const id = requestId(r.key); if (!firstSeen.has(id)) { firstSeen.set(id, Date.now()); if (Date.now() - alertAt < 3000 && !holding) lookedAt = id; } });
    const permission = open.some(r => r.kind !== 'question'), question = open.some(r => r.kind === 'question');
    root.classList.toggle('has-waiting', open.length > 0); root.classList.toggle('has-permission', permission); root.classList.toggle('has-question', question && !permission);
    // The open island's title counts what the source switch shows (as its state counts do); the
    // small island always counts every source.
    const scoped = source === 'all' ? line : `${source === 'claude' ? 'Claude' : 'Codex'} · ${scopeHeadline(counts(list.filter(p => ofSource(p))), l, verifiedProviders(snapshot), [source])}`;
    headline = scoped; workingCount = c.working; renderTitle(); q('.capsule-text').textContent = line;
    const badge = q<HTMLElement>('.capsule-badge'); badge.hidden = !open.length; badge.textContent = String(open.length);
    // What waits for the user shows on every page; a click goes to it on the agents page.
    const alertButton = q<HTMLButtonElement>('.nav-alert'); alertButton.hidden = !open.length || pager.current === 'agents';
    const alertText = `<i></i>${question && !permission ? l('island.alert_questions', { n: open.length }) : l('island.alert_waiting', { n: open.length })}`;
    if (alertButton.innerHTML !== alertText) alertButton.innerHTML = alertText;
    alertButton.title = l('island.requests_waiting_for_you_open');
    placeMascot();
    if (!open.length && quiet) { quiet = null; }
    waitingCount = open.length; renderCapsule();
    renderFoot();
    // An agent whose reply just ended (it was working in the last snapshot) makes the mascot happy for a moment.
    if (snapshot !== mascotSeen) { const done = finishedAgents(workingBefore, snapshot); workingBefore = workingNow(snapshot); mascotSeen = snapshot; const base = mascotState(snapshot); mascot.setState(done && base === 'idle' ? 'replyEnded' : base); }
    if (limitsOpen) fillLimits(false);
    renderCard(list); renderFilters(list); renderList(list);
  }
  function renderFoot() {
    const note = quiet && root.classList.contains('has-waiting') ? (quiet === 'fullscreen' ? l('island.full_screen_notifications_quiet') : l('island.do_not_disturb_notifications_quiet')) : snapshot?.mode === 'demo' ? l('island.demo_data') : '';
    const foot = q('.foot-note'); if (foot.textContent !== note) foot.textContent = note;
    foot.classList.toggle('demo', snapshot?.mode === 'demo' && !quiet);
  }

  // Limits panel: a plain popover transition in CSS. It fades in, grows a
  // little from the island's side and sharpens; closing reverses it faster.
  // The glass and the window region follow the shape's on-screen box and
  // opacity on every frame while it moves.
  const measurePanel = () => {
    const content = q<HTMLElement>('.limits-panel'); content.style.height = 'auto';
    const h = Math.max(150, Math.min(424, Math.ceil(content.scrollHeight)));
    content.style.height = `${h}px`; root.style.setProperty('--limits-h', `${h}px`);
  };
  const runPanel = (open: boolean) => { if (open) measurePanel(); animate(460); };
  // The panel's contents rise in once when it opens; later they change in place, only when
  // something in them really changed (a new reading, a minute passing), never replaying the
  // rise or losing the scroll, so the open panel stays still.
  let limitsHtml = '', settleTimer: ReturnType<typeof setTimeout> | undefined;
  const fillLimits = (opening: boolean) => {
    if (!snapshot) return;
    const panel = q<HTMLElement>('.limits-panel'), html = renderLimits(snapshot, l, locale);
    if (opening) { limitsHtml = ''; panel.classList.remove('settled'); clearTimeout(settleTimer); settleTimer = setTimeout(() => panel.classList.add('settled'), 700); }
    if (html === limitsHtml) return;
    const scroll = panel.querySelector<HTMLElement>('.limits-body')?.scrollTop ?? 0, height = root.style.getPropertyValue('--limits-h');
    limitsHtml = html; panel.innerHTML = html;
    const body = panel.querySelector<HTMLElement>('.limits-body'); if (body) body.scrollTop = scroll;
    if (!opening) { measurePanel(); if (root.style.getPropertyValue('--limits-h') !== height) animate(120); }
  };

  // Hover: the page sees the pointer only over the visible shapes; the shell
  // also reports inside/outside, which covers a pointer that has not moved.
  let inside = false, hold: ReturnType<typeof setTimeout> | undefined, limitsOpen = false;
  const enter = () => { inside = true; controller.enter(); };
  // Likewise the page's own "pointer entered" while the island changes shape is the shape passing
  // under a still pointer (a closing island would open again); the native side reports real entry.
  const domEnter = () => { trace(pumping ? 'dom-enter-skipped' : 'dom-enter'); if (pumping) return; enter(); };
  // The island stays while the user is busy in it: text typed into a field (an empty field only
  // keeps it while the pointer is over it), a list whose menu may be open, the page or the island
  // being dragged. Once that ends with the pointer away, it closes.
  let moving = false;
  // Held only by what the user really typed (a field marked on its own input event, not a value the
  // page put there, such as a form's suggested time), still in a field that has the focus and lies
  // on the page in view. An empty or untouched field, or one on a page out of view, holds nothing.
  const filled = () => {
    const a = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (!a || !root.contains(a) || a.dataset.typed !== '1' || a.value.trim() === '') return false;
    const page = a.closest<HTMLElement>('.page');
    return !page || (page.dataset.page === pager.current && !page.hidden);
  };
  const busy = () => filled() || shelf.picking || moving || pager.dragging || dropdownOpen();
  const markTyped = (event: Event) => { const t = event.target as HTMLElement; if (t.matches?.('input,textarea')) t.dataset.typed = '1'; };
  const clearTyped = () => root.querySelectorAll<HTMLElement>('[data-typed]').forEach(x => { delete x.dataset.typed; });
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const leave = () => {
    inside = false; clearTimeout(graceTimer);
    const wait = graceUntil - performance.now();
    if (wait > 0) { graceTimer = setTimeout(() => { if (!inside) leave(); }, wait); return; }
    if (!limitsOpen && !busy()) controller.leave();
  };
  // The page's own "pointer left" while the island changes shape under a still pointer is not a
  // leave (the native side reports real leaving, which needs the pointer to move).
  // A leave set aside here is not lost: when the island settles the native side reports again.
  const domLeave = () => { trace(pumping ? 'dom-leave-skipped' : 'dom-leave'); if (pumping) return; leave(); };
  const showLimits = (open: boolean) => {
    limitsOpen = open; root.classList.toggle('limits-open', open);
    q('.limits-panel').toggleAttribute('inert', !open); q('.notch-limits').setAttribute('aria-pressed', String(open));
    if (open) { controller.open(); fillLimits(true); }
    else if (!inside) controller.leave();
    runPanel(open);
  };
  // Files dragged over the island: it opens on the shelf (when the shelf is shown) and takes them.
  let stopDrop: (() => void) | undefined;
  if ('__TAURI_INTERNALS__' in window) void import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent(event => {
    if (!pager.pages.includes('shelf')) return;
    const p = event.payload;
    if (p.type === 'enter' || p.type === 'over') { if (pager.current !== 'shelf') pager.show('shelf', { remember: false }); if (!controller.expanded) controller.open(); shelf.dragOver(true); }
    else if (p.type === 'drop') { shelf.dragOver(false); shelf.add(p.paths); }
    else shelf.dragOver(false);
  })).then(off => { if (disposed) off(); else stopDrop = off; }).catch(() => {});
  // A system sign (volume, Caps Lock, …): briefly on the closed island; it never opens it, never
  // takes the focus and never covers what waits (the count stays).
  let signTimer: ReturnType<typeof setTimeout> | undefined;
  const showSign = (sign: Sign) => {
    if (controller.expanded || dockMode === 'hidden') return;
    const box = q('.sign-toast');
    // The battery's note: a ring that sweeps up to the level; the volume keeps its bar.
    const ring = sign.kind === 'battery' && typeof sign.value === 'number';
    const bar = sign.value !== null && sign.value !== undefined && sign.kind === 'volume' ? `<i class="sign-bar"><i style="width:${Math.max(0, Math.min(100, sign.value))}%"></i></i>` : '';
    box.innerHTML = `<span class="sign-icon">${ring ? batteryRing(sign.value as number, !!sign.on, 22) : icon(({ volume: 'volume', caps: 'caps', language: 'keyboard', battery: 'battery', wifi: 'wifi', audio: 'headphones' } as Record<string, string>)[sign.kind] ?? 'bell', 15)}</span><span class="sign-text">${e(fromApp(sign.text))}</span>${bar}`;
    if (ring) { const host = box.querySelector('.sign-icon')!, level = sign.value as number; host.querySelector('.arc')?.setAttribute('stroke-dashoffset', '100'); requestAnimationFrame(() => requestAnimationFrame(() => setRing(host, level, !!sign.on, 22))); }
    root.classList.add('signing'); animate(500); clearTimeout(signTimer);
    signTimer = setTimeout(() => { root.classList.remove('signing'); animate(500); }, 1900);
  };
  const stopSigns = bridge.onSign(showSign);
  // The shell decides the rest look from what is under the island and the user's choice there.
  let dockKnown = false;
  const onDock = bridge.onNotchDock(mode => { if (dockKnown && mode === dockMode) return; dockKnown = true; dockMode = mode; settleDock(); });
  const layout = bridge.onNotchLayout(({ side }) => { q('.notch-stage').classList.toggle('panel-left', side === 'left'); animate(); });
  const limitsState = bridge.onLimitsPanel(({ open }) => { if (open !== limitsOpen) showLimits(open); });
  // A reveal opens the island and, unless the pointer is over it, lets it close again after
  // `holdMs` (a new request: about 10 s, on that request). Over it, pinned or with the limits
  // open it stays; seeing it answers nothing.
  const reveal = bridge.onNotchReveal(({ holdMs, inside: under, alert, page }) => {
    clearTimeout(hold); inside = under;
    if (alert) { alertAt = Date.now(); const newest = [...firstSeen.entries()].sort((a, b) => b[1] - a[1])[0]; if (newest && Date.now() - newest[1] < 3000) lookedAt = newest[0]; if (!controller.expanded && pager.current !== 'agents') pager.show('agents', { remember: false, instant: true }); if (snapshot) render(); }
    if (page && !controller.expanded && !busy() && pager.pages.includes(page)) pager.show(page, { remember: false, instant: true });
    controller.open(); if (!under) hold = setTimeout(() => { if (!inside) leave(); }, Math.max(450, holdMs));
  });
  // "Out" when the page already counts the pointer out changes nothing (and keeps a reveal's hold).
  const pointer = bridge.onNotchPointer(under => { trace(under ? 'native-in' : 'native-out'); if (!under && !inside) return; clearTimeout(hold); if (under) enter(); else { if (holding) releaseStill(); leave(); } });
  const pinned = bridge.onNotchPinned(value => { controller.pin(value); q('.notch-pin').setAttribute('aria-pressed', String(value)); if (!value && !inside) controller.leave(); });
  const key = (event:KeyboardEvent) => { clearTimeout(hold); if((event.key==='ArrowLeft'||event.key==='ArrowRight')&&!(event.target as Element).closest('input,textarea,select,[contenteditable]')){event.preventDefault();pager.step(event.key==='ArrowLeft'?-1:1);return;} const t=(event.target as Element).closest?.<HTMLElement>('.focus-card [data-more].more'); if (t && (event.key==='Enter'||event.key===' ')) { event.preventDefault(); toggleText(t); return; } if (event.key==='Escape' && limitsOpen) { showLimits(false); void bridge.setLimitsPanel(false); return; } if (event.key==='Escape') controller.close(); };
  const click = (event:MouseEvent) => {
    // A waiting question (its summary, its button, its person): to the office, where it is answered, or to the chat.
    const askGo=(event.target as Element).closest<HTMLElement>('[data-ask-go]');
    if(askGo&&!(event.target as Element).closest('.req-nav')){const s=snapshot?.sessions.find(x=>sessionId(x.key)===askGo.dataset.askGo);if(s){goToAsk(s.key);return;}}
    const toSource=(event.target as Element).closest('[data-ask-target] [data-session], .focus-bottom [data-session]')&&notifyClick==='source'&&root.classList.contains('has-waiting')&&cardKind.startsWith('r');
    if(toSource){const b=(event.target as Element).closest<HTMLElement>('[data-session]')!;const s=snapshot?.sessions.find(x=>sessionId(x.key)===b.dataset.session);if(s){void bridge.openInSource(s.key.sessionId).then(ok=>{if(!ok)void bridge.openOffice(s.key);}).catch(err=>report(String(err)));return;}}
    const more=(event.target as Element).closest<HTMLElement>('.focus-card [data-more].more');if(more){toggleText(more);return;}
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button)return;
    if(button.matches('.move-grip'))return;
    if(button.matches('.page-arrow')){pager.step(button.matches('.prev')?-1:1);return;}
    if(button.dataset.pageDot){pager.show(button.dataset.pageDot);return;}
    if(button.matches('.nav-alert')){const first=openAsks(people(snapshot!,l).filter(p=>p.state!=='ended'))[0];if(first)lookedAt=requestId(first.r.key);pager.show('agents');render();return;}
    if(button.dataset.filter){source=button.dataset.filter as Source;frozen=null;keepFilters();render();}
    else if(button.dataset.status){status=button.dataset.status as Status;frozen=null;keepFilters();render();}
    else if(button.dataset.step){const ids=[...requests.keys()];const at=Math.max(0,ids.indexOf(lookedAt));lookedAt=ids[(at+Number(button.dataset.step)+ids.length)%ids.length]||'';render();}
    else if(button.dataset.source){const id=button.dataset.source;void bridge.openInSource(id).then(opened=>{if(!opened)report(l('island.this_chat_has_no_known'));}).catch(err=>report(String(err)));}
    else if(button.matches('.capsule-face'))controller.open();
    else if(button.matches('.notch-limits')||button.matches('.limits-close')){const open=button.matches('.notch-limits')?!limitsOpen:false;showLimits(open);void bridge.setLimitsPanel(open).catch(err=>report(String(err)));}
    else if(button.matches('.notch-pin'))void bridge.pinNotch(!controller.pinned).catch(err=>report(String(err)));
    else if(button.matches('.notch-settings'))void bridge.openSettings().catch(err=>report(String(err)));
    else if(button.matches('.notch-office') || button.dataset.session || button.hasAttribute('data-office-open')){const s=snapshot?.sessions.find(s=>sessionId(s.key)===button.dataset.session);if(button.dataset.session&&!s){report(l('island.this_chat_is_no_longer'));return;}void bridge.openOffice(s?.key).catch(err=>report(String(err)));}
    else if(button.hasAttribute('data-start-demo'))void bridge.setDemo(true).catch(err=>report(String(err)));
    else if(button.dataset.request){const id=button.dataset.request;const r=requests.get(id);if(!r||!r.canAnswer||r.version!==Number(button.dataset.version)||sending.has(id)||r.expiresAt<=Date.now())return;const answer=button.dataset.answer!;sending.add(id);render();void bridge.answer(r.key,r.version,{[r.title]:answer}).then(result=>report(result==='delivered'?(snapshot?.mode==='demo'?l('island.demo_reply_applied_not_sent'):l('island.reply_delivered')):l('island.not_delivered', { result }))).catch(err=>report(String(err))).finally(()=>{sending.delete(id);render();});}
  };
  // Over the panel: rows keep their place and the card what is looked at; updates go on.
  // A press holds redraws until its click is handled (or, released outside, for a moment).
  const face=q('.island-face');const holdStill=()=>{holding=true;};
  function releaseStill(){holding=false;frozen=null;lookedAt='';shown=shown&&{...shown,at:0};unpressNow();render();}
  function unpressNow(){clearTimeout(pressTimer);if(!pressing)return;pressing=false;if(dirty){dirty=false;queueMicrotask(render);}}
  const press=()=>{pressing=true;clearTimeout(pressTimer);pressTimer=setTimeout(unpressNow,PRESS_LIMIT_MS);};const unpress=()=>{setTimeout(unpressNow,0);};
  face.addEventListener('pointerenter',holdStill);face.addEventListener('pointerleave',releaseStill);face.addEventListener('pointerdown',press);window.addEventListener('pointerup',unpress);window.addEventListener('pointercancel',unpress);
  // Moving the island: pressed on the handle, the shell follows the pointer until it is let go.
  const grip=q('.move-grip');
  const gripDown=(event:PointerEvent)=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();moving=true;root.classList.add('moving-island');grip.setPointerCapture(event.pointerId);void bridge.notchMove('start').catch(err=>report(String(err)));};
  const gripUp=(event:PointerEvent)=>{if(!moving)return;moving=false;root.classList.remove('moving-island');try{grip.releasePointerCapture(event.pointerId);}catch{/* already released */}void bridge.notchMove('end').catch(err=>report(String(err)));if(!inside)leave();};
  const gripCenter=()=>{void bridge.notchMove('center').catch(err=>report(String(err)));};
  grip.addEventListener('pointerdown',gripDown);grip.addEventListener('pointerup',gripUp);grip.addEventListener('pointercancel',gripUp);grip.addEventListener('dblclick',gripCenter);
  // A list being opened (its menu may lie outside the island); a field or list let go with the pointer away closes the island.
  const blurred=()=>{setTimeout(()=>{if(!inside&&controller.expanded)leave();},0);};
  root.addEventListener('focusout',blurred);root.addEventListener('input',markTyped);
  const scrolled=(event:Event)=>{const el=event.target as HTMLElement;const k=el.dataset?.more;if(k&&opened.has(k))opened.set(k,el.scrollTop);};
  q('.notch-feedback').addEventListener('click',hideFeedback);root.addEventListener('pointerenter',domEnter);root.addEventListener('pointerleave',domLeave);root.addEventListener('keydown',key);root.addEventListener('click',click);root.addEventListener('scroll',scrolled,true);
  const stop=watchSnapshot(bridge,incoming=>{snapshot=incoming;render();},report);
  // The user's settings, applied at once whenever they change (in the office or here).
  const applySettings = (s: Settings) => {
    if (disposed) return;
    if (s.language !== prefs.language) { savePreferences({ ...prefs, language: s.language, reducedMotion: s.reducedMotion }); prefs.language = s.language; if (resolveLanguage(s.language) !== language()) { location.reload(); return; } }
    prefs.reducedMotion = s.reducedMotion; root.classList.toggle('reduce-motion', s.reducedMotion); mascot.setReducedMotion(s.reducedMotion || !s.idleMotion);
    root.classList.toggle('no-mascot', s.hideMascot);
    stripChoice = { statusBattery: s.statusBattery, statusAudio: s.statusAudio, statusWeather: s.statusWeather, statusAlarm: s.statusAlarm, hideMascot: s.hideMascot }; refreshStrip();
    clockStyle = s.clockStyle; root.classList.toggle('clock-date', s.clockStyle === 'date'); tick();
    for (const c of ['amber', 'blue', 'green', 'pink', 'white']) root.classList.toggle(`line-${c}`, s.lineColor === c);
    for (const c of ['warm', 'cool', 'contrast']) root.classList.toggle(`alerts-${c}`, s.alertColors === c);
    motion = s.reducedMotion ? 1 : 100 / s.animationSpeed;
    root.style.setProperty('--motion', String(motion));
    root.style.setProperty('--breath', String(100 / s.breathSpeed));
    root.style.setProperty('--light-level', String(s.lightBrightness / 100));
    root.style.setProperty('--zoom', String(s.scale / 100));
    root.classList.toggle('no-rest-light', !s.restLight);
    glass?.setDarkness(s.glassDarkness);
    if ((s.islandTheme === 'dark') !== darkLook) setLook(s.islandTheme === 'dark');
    pageSettings = s.pages; startPage = s.startPage; applyPages();
    collapsedChoice = s.collapsed; focus.applySettings(s); renderCapsule(); notifyClick = s.notifyClick;
    controller.configure({ openDelay: s.hoverDelay, closeDelay: s.closeDelay });
    // The rest choices never pin the detail panel (that is the pin button's, and passing).
    placeMascot(); animate(200);
  };
  void bridge.getSettings().then(applySettings).catch(() => {});
  const stopSettings = bridge.onSettings(applySettings);
  animate(200);
  // Measurement hook for the native frame-rate check; it only drives the same
  // controller the pointer does.
  (window as unknown as { __notch?: object }).__notch = { stats: () => ({ shapeSends }), events: () => events.slice(), open: () => controller.open(), close: () => { inside = false; controller.close(); }, limits: (open: boolean) => { showLimits(open); void bridge.setLimitsPanel(open); }, page: (id: string) => pager.show(id), get current() { return pager.current; }, shelfDrop: (paths: string[]) => shelf.add(paths), shelfOver: (on: boolean) => shelf.dragOver(on) };
  return { dispose(){disposed=true;stop();strip.dispose();clearInterval(bars);void stopStatus.then(f=>f());void stopRings.then(f=>f());clearInterval(quietTimer);clearInterval(clock);clearTimeout(pagingTimer);clearTimeout(feedbackTimer);pager.dispose();focus.dispose();media.dispose();notes.dispose();alarms.dispose();clearTimeout(settleTimer);clearTimeout(hold);clearTimeout(pressTimer);[reveal,pinned,pointer,limitsState,layout,onDock,stopSettings,stopSigns].forEach(off=>void off.then(fn=>fn()));controller.dispose();mascot.dispose();clearTimeout(enterTimer);clearTimeout(freshTimer);face.removeEventListener('pointerenter',holdStill);face.removeEventListener('pointerleave',releaseStill);face.removeEventListener('pointerdown',press);window.removeEventListener('pointerup',unpress);window.removeEventListener('pointercancel',unpress);root.removeEventListener('pointerenter',domEnter);root.removeEventListener('pointerleave',domLeave);root.removeEventListener('keydown',key);root.removeEventListener('click',click);root.removeEventListener('scroll',scrolled,true);clearInterval(askTimer);root.removeEventListener('input',markTyped);root.removeEventListener('focusout',blurred);grip.removeEventListener('pointerdown',gripDown);grip.removeEventListener('pointerup',gripUp);grip.removeEventListener('pointercancel',gripUp);grip.removeEventListener('dblclick',gripCenter);clearTimeout(graceTimer);clearTimeout(signTimer);stopDrop?.();water.dispose();shelf.dispose();root.replaceChildren();document.body.classList.remove('notch-body');} };
}
