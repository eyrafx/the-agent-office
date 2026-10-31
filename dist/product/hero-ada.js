(() => {
 'use strict';
 // Ada inside the hero island's open panel: a wave when the island opens, idle with blinks and an
 // occasional hop while it stays open; her eyes follow the cursor over the panel (gaze stills), she
 // looks up at you with big eyes (plead) when the cursor lands on her, the shy clip on a click. Same clip engine as the corner mascot (ada-mascot.js): only the prepared
 // clips and stills are switched, never moved or warped in code. The island's own open/close logic
 // is not touched: the mascot box stays pointer-events:none and the cursor is matched by position.
 if (!new URLSearchParams(location.search).has('hero')) return;
 const BASE = new URL('../mascot/ada/', document.currentScript?.src || location.href).href;
 const CLIPS = {
  idle: { file: 'idle', duration: 1798 },
  hop: { file: 'hop', duration: 1984 },
  wave: { file: 'wave', duration: 2046 },
  shy: { file: 'shy', duration: 2542 },
  plead: { file: 'plead', duration: 2046 },
 };
 const HOP_EVERY = [9000, 16000];
 const clipUrl = name => `${BASE}${CLIPS[name].file}-256.webp`;
 const gazeUrl = dir => `${BASE}look-${dir === 'upLeft' ? 'up-left' : dir}-256.png`;
 const GAZE_REST_MS = 2500, GAZE_SETTLE_MS = 110; // a resting cursor → back to idle; a direction must hold
 // The clips share one 512 px frame; inside it Ada spans x 43..469, y 87..424. The still in the
 // island (still-426.webp) is that same pose cropped and padded to 426x403 (33 px above and below),
 // drawn with object-fit: contain at the bottom of the box. The clip layer is placed so the two
 // line up exactly, whatever the box size.
 const FRAME = { x: 43, y: 87, w: 426, h: 337, pad: 33, canvasH: 403 };

 const calm = matchMedia('(prefers-reduced-motion: reduce)');

 /* ---------- Files: fetched once, replayed from memory (as in ada-mascot.js) ---------- */
 const blobs = new Map(), loaded = new Set();
 function load(url, priority) {
  let p = blobs.get(url);
  if (!p) {
   p = fetch(url, priority ? { priority } : undefined).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.blob(); });
   p.then(() => loaded.add(url), () => blobs.delete(url));
   blobs.set(url, p);
  }
  return p;
 }
 function ready(img) {
  const done = img.complete && img.naturalWidth ? Promise.resolve()
   : new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('not loaded')); });
  return Promise.race([img.decode(), done.then(() => new Promise(r => setTimeout(r, 300)))]);
 }

 let app, box, layers, body, view;
 const stillUrls = new Map();
 let showToken = 0;
 // The old picture stays until the new one is decoded; the island's own still is hidden only once
 // a clip frame is on screen, and comes back in the same frame when the clip layer is cleared.
 async function show(url, restart) {
  const token = ++showToken;
  let blob;
  try { blob = await load(url); } catch (e) { console.warn('hero ada: could not load', url, e); return false; }
  if (token !== showToken) return false;
  let src = stillUrls.get(url), own = false;
  if (restart || !src) { src = URL.createObjectURL(blob); if (restart) own = true; else stillUrls.set(url, src); }
  const img = new Image();
  img.alt = ''; img.draggable = false; img.src = src;
  if (own) img.dataset.own = src;
  const drop = () => { if (own) URL.revokeObjectURL(src); };
  try { await ready(img); } catch (e) { console.warn('hero ada: could not decode', url, e); drop(); return false; }
  if (token !== showToken) { drop(); return false; }
  const old = [...view.children];
  view.append(img);
  view.hidden = false;
  body.style.opacity = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => old.forEach(o => { o.remove(); if (o.dataset.own) URL.revokeObjectURL(o.dataset.own); })));
  return true;
 }
 function clear() {
  ++showToken;
  body.style.opacity = '';
  view.hidden = true;
  for (const o of [...view.children]) { o.remove(); if (o.dataset.own) URL.revokeObjectURL(o.dataset.own); }
 }

 function place() {
  const w = box.offsetWidth, h = box.offsetHeight;
  if (!w || !h) return;
  const k = Math.min(w / FRAME.w, h / FRAME.canvasH);
  const left = (w - FRAME.w * k) / 2, top = h - FRAME.canvasH * k + FRAME.pad * k;
  view.style.cssText = `position:absolute;pointer-events:none;width:${512 * k}px;height:${512 * k}px;left:${left - FRAME.x * k}px;top:${top - FRAME.y * k}px`;
  for (const img of view.children) img.removeAttribute('style');
 }

 /* ---------- Behaviour ---------- */
 const S = { state: 'closed', timer: 0, hopTimer: 0, over: false, gaze: null };
 const cursor = { x: 0, y: 0, inside: false, moved: 0 };
 const isOpen = () => app.classList.contains('expanded');

 async function idle() {
  clearTimeout(S.timer);
  if (!isOpen()) return;
  S.state = 'idle'; S.gaze = null;
  if (!(await show(clipUrl('idle'), true)) && S.state === 'idle') S.timer = setTimeout(idle, 1500);
 }
 async function play(name) {
  clearTimeout(S.timer);
  S.state = name; S.gaze = null;
  const ok = await show(clipUrl(name), true);
  if (S.state !== name) return;
  S.timer = setTimeout(() => { if (S.state === name) idle(); }, ok ? CLIPS[name].duration : 0);
 }
 function scheduleHop() {
  clearTimeout(S.hopTimer);
  const [a, b] = HOP_EVERY;
  S.hopTimer = setTimeout(() => {
   if (isOpen() && S.state === 'idle' && !document.hidden && loaded.has(clipUrl('hop'))) play('hop');
   scheduleHop();
  }, a + Math.random() * (b - a));
 }

 function opened() {
  if (calm.matches) return;
  S.over = false;
  if (loaded.has(clipUrl('wave'))) play('wave'); else idle();
  scheduleHop();
 }
 function closed() {
  clearTimeout(S.timer); clearTimeout(S.hopTimer);
  S.state = 'closed'; S.over = false;
  clear();
 }

 // Is the cursor on Ada herself (her drawn area, not the empty corners of the box)?
 function onAda(x, y) {
  const r = box.getBoundingClientRect();
  return x > r.left + r.width * 0.1 && x < r.right - r.width * 0.1 && y > r.top + r.height * 0.12 && y < r.bottom;
 }
 // Which gaze still matches the cursor, seen from Ada's eyes (only the made directions:
 // left, right, up-left). Null when the cursor is on or right next to her.
 const DIRS = ['right', 'right', 'down', 'left', 'left', 'upLeft', 'upLeft', 'right'];
 function gazeDir() {
  const r = box.getBoundingClientRect();
  const dx = cursor.x - (r.left + r.width / 2), dy = cursor.y - (r.top + r.height * 0.42);
  if (Math.hypot(dx, dy) < Math.max(24, r.width * 0.6)) return null;
  const dir = DIRS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
  return dir === 'down' ? (dx >= 0 ? 'right' : 'left') : dir;
 }
 let pendingGaze = null, pendingSince = 0;
 function updateGaze() {
  if (!isOpen() || calm.matches || (S.state !== 'idle' && S.state !== 'gaze')) { pendingGaze = null; return; }
  const want = cursor.inside && !S.over && performance.now() - cursor.moved < GAZE_REST_MS ? gazeDir() : null;
  if (want === S.gaze) { pendingGaze = null; return; }
  const now = performance.now();
  if (want !== pendingGaze) { pendingGaze = want; pendingSince = now; return; }
  if (now - pendingSince < GAZE_SETTLE_MS) return;
  pendingGaze = null;
  if (!want) { idle(); return; }
  const url = gazeUrl(want);
  if (!loaded.has(url)) { load(url, 'low').catch(() => {}); return; }
  clearTimeout(S.timer);
  S.state = 'gaze'; S.gaze = want;
  show(url, false);
 }

 function pointer(e) {
  if (e.pointerType === 'touch') return;
  cursor.x = e.clientX; cursor.y = e.clientY; cursor.inside = true; cursor.moved = performance.now();
  if (!isOpen() || calm.matches) return;
  const over = onAda(e.clientX, e.clientY);
  if (over === S.over) return;
  S.over = over;
  // Landing on her: she looks up at you, once per landing.
  if (over && (S.state === 'idle' || S.state === 'gaze' || S.state === 'hop')) play('plead');
 }
 function left() { cursor.inside = false; S.over = false; }

 function start() {
  app = document.getElementById('app');
  box = app?.querySelector('.island-mascot');
  layers = box?.querySelector('.mascot-layers');
  body = layers?.querySelector('img.body');
  if (!body) return false;
  view = document.createElement('div');
  view.className = 'hero-ada-clip';
  view.hidden = true;
  layers.append(view);
  const style = document.createElement('style');
  style.textContent = '.hero-ada-clip img{position:absolute;inset:0;width:100%;height:100%;display:block}.hero-ada-clip[hidden]{display:none}';
  document.head.append(style);
  place();
  new ResizeObserver(place).observe(box);
  let was = isOpen();
  new MutationObserver(() => { const now = isOpen(); if (now !== was) { was = now; now ? opened() : closed(); } })
   .observe(app, { attributes: true, attributeFilter: ['class'] });
  addEventListener('pointermove', pointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', left);
  addEventListener('blur', left);
  setInterval(updateGaze, 60);
  addEventListener('click', e => { if (isOpen() && !calm.matches && onAda(e.clientX, e.clientY)) play('shy'); }, true);
  calm.addEventListener?.('change', () => { if (calm.matches) closed(); else if (isOpen()) opened(); });
  if (was) opened();
  // Fetch the clips after the page has settled, in the order they are needed.
  const fetchAll = () => { if (!calm.matches && !navigator.connection?.saveData) ['wave', 'idle', 'plead', 'shy', 'hop'].map(clipUrl).concat(['right', 'left', 'upLeft'].map(gazeUrl)).reduce((p, u) => p.then(() => load(u, 'low').catch(() => {})), Promise.resolve()); };
  (window.requestIdleCallback ? requestIdleCallback(fetchAll, { timeout: 3000 }) : setTimeout(fetchAll, 500));
  window.AO_HERO_ADA = S;
  return true;
 }
 // The island is drawn by the product bundle (a module), so wait for its mascot to exist.
 const tryStart = () => { if (!start()) { const mo = new MutationObserver(() => { if (start()) mo.disconnect(); }); mo.observe(document.body, { childList: true, subtree: true }); } };
 if (document.readyState === 'loading') addEventListener('DOMContentLoaded', tryStart, { once: true }); else tryStart();
})();
