(() => {
 'use strict';
 // Ada, the floating mascot in the bottom-right corner. Behaviour follows the approved mascot demo:
 // idle with blink, a random hop, a greeting on hover (wave → plead → shy, with speech bubbles),
 // a giggle on click and eye contact while idle. Only the prepared clips and stills are switched;
 // the picture itself is never moved, rotated or warped in code.
 if (window.AO_ADA) return;
 const BASE = new URL('mascot/ada/', document.currentScript?.src || location.href).href;

 // Durations (ms) are the clips' own lengths, as in the demo.
 const CONFIG = {
  clips: {
   idle: { file: 'idle', duration: 1798 },     // idle with blink
   hop: { file: 'hop', duration: 1984 },       // happy hop
   giggle: { file: 'giggle', duration: 1984 }, // giggle (click)
   wave: { file: 'wave', duration: 2046 },     // wave            → "Hi!"
   plead: { file: 'plead', duration: 2046 },   // pleading eyes   → "Can I come live on your desktop?"
   shy: { file: 'shy', duration: 2542 },       // shy             → "I'm teeny tiny, I'll fit!"
  },
  // Hover: each clip plays with its own bubble line, then back to idle.
  greeting: [
   { clip: 'wave', line: 0 },  // greeting bubble on one side
   { clip: 'plead', line: 1 }, // one bubble opens on the other side
   { clip: 'shy', line: 2 },   // same bubble, the line scrolls; it closes when the clip ends
  ],
  // Gaze stills. Only the directions that were actually made; nothing mirrored or invented.
  look: { center: 'look-center', left: 'look-left', right: 'look-right', upLeft: 'look-up-left' },
  lookMap: { left: 'left', right: 'right', upLeft: 'upLeft' }, // other directions: center
  hopEvery: [6000, 12000],
  lookNearPx: 70,     // at the demo's 256 px; scaled with the mascot
  lookIdleMs: 2500,   // a cursor resting this long → back to idle
  lookSettleMs: 110,  // a direction must hold this long before switching
 };

 // [greeting, "can I come to your desktop?", "I'm tiny, I'll fit!"]
 const LINES = {
  'tr': ['Selam!', 'Masaüstüne gelebilir miyim? 🥺', 'Çok küçüğüm, sığarım! 🐙'],
  'en': ['Hi!', 'Can I come live on your desktop? 🥺', "I'm teeny tiny, I'll fit! 🐙"],
  'es': ['¡Hola!', '¿Me dejas ir a tu escritorio? 🥺', '¡Ocupo poquito, quepo seguro! 🐙'],
  'de': ['Hallo!', 'Darf ich auf deinen Desktop? 🥺', 'Ich bin ganz klein, ich pass rein! 🐙'],
  'fr': ['Coucou !', 'Je peux venir sur ton bureau ? 🥺', 'Je prends pas de place, promis ! 🐙'],
  'pt-BR': ['Oi!', 'Posso morar no seu desktop? 🥺', 'Ocupo pouquinho, eu caibo! 🐙'],
  'it': ['Ciao!', 'Posso venire sul tuo desktop? 🥺', 'Occupo pochissimo, ci sto! 🐙'],
  'ru': ['Привет!', 'Можно мне к тебе на рабочий стол? 🥺', 'Я совсем крошка, я помещусь! 🐙'],
  'ja': ['やっほー！', 'デスクトップに行ってもいい？🥺', 'ちっちゃいから、ちゃんと入るよ！🐙'],
  'ko': ['안녕!', '바탕화면에 놀러 가도 돼? 🥺', '나 엄청 작아서 쏙 들어가! 🐙'],
  'zh-Hans': ['你好呀！', '我可以去你的桌面吗？🥺', '我超小的，放得下！🐙'],
 };
 const LANG_TAGS = { tr: 'tr-TR', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', 'pt-BR': 'pt-BR',
  it: 'it-IT', ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR', 'zh-Hans': 'zh-CN' };
 function langId(tag) {
  const t = (tag || '').toLowerCase();
  if (t.startsWith('pt')) return 'pt-BR';
  if (t.startsWith('zh')) return 'zh-Hans';
  const base = t.split('-')[0];
  return LINES[base] ? base : 'en';
 }
 const currentLang = () => langId(document.documentElement.lang);

 const CSS = `
.ada{--ada:136px;--k:calc(var(--ada) / 256px);position:fixed;right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));z-index:35;width:var(--ada);height:var(--ada);opacity:0;visibility:hidden;transition:opacity .3s ease,visibility 0s linear .3s;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.ada.on{opacity:1;visibility:visible;transition:opacity .3s ease,visibility 0s}
.ada.away{opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s ease,visibility 0s linear .2s}
.ada-view{position:absolute;inset:0;cursor:pointer}
.ada-layer{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.ada-bubble{position:absolute;left:0;top:0;max-width:min(230px,calc(100vw - 32px));width:max-content;padding:7px 15px 6px;background:#fff1f6;border:3px solid #ffc2d8;border-radius:20px;color:#e2557f;font:700 16px/1.25 var(--font,'Segoe UI',system-ui,sans-serif);letter-spacing:.1px;box-shadow:0 5px 0 rgba(255,194,216,.35),0 10px 24px rgba(255,140,180,.18);transform-origin:var(--tail-x,18px) 100%;opacity:0;transform:scale(.4) translateY(8px);pointer-events:none;text-wrap:balance;white-space:normal}
.ada-bubble.greet{font-size:22px;line-height:1.05;border-radius:999px;padding:6px 16px 5px;white-space:nowrap}
.ada-bubble::before,.ada-bubble::after{content:"";position:absolute;left:var(--tail-x,18px);bottom:-14px;margin-left:-8px;border-style:solid;border-width:14px 6px 0 14px;border-color:#ffc2d8 transparent transparent transparent}
.ada-bubble::after{bottom:-9px;margin-left:-5px;border-width:10px 4px 0 10px;border-color:#fff1f6 transparent transparent transparent}
.ada-bubble.tail-right::before{border-width:14px 14px 0 6px;margin-left:-12px}
.ada-bubble.tail-right::after{border-width:10px 10px 0 4px;margin-left:-9px}
@property --tail-x{syntax:"<length>";inherits:true;initial-value:18px}
.ada-bubble.sizing{transition:translate .38s ease,--tail-x .38s ease}
.ada-bubble .tick{position:relative;overflow:hidden;transition:width .38s ease,height .38s ease}
.ada-bubble .tline{position:absolute;left:0;bottom:0;transition:transform .38s ease,opacity .38s ease}
.ada-bubble .tline.enter{transform:translateY(-70%);opacity:0;transition:none}
.ada-bubble .tline.leave{transform:translateY(70%);opacity:0}
.ada-bubble .heart{font-family:var(--font,'Segoe UI'),'Segoe UI Symbol',sans-serif;font-variant-emoji:text;font-size:15px;vertical-align:3px;margin-left:4px;color:#ff8fb4}
.ada-bubble.show{animation:ada-pop .42s cubic-bezier(.34,1.7,.5,1) forwards}
.ada-bubble.hide{animation:ada-fade .35s ease forwards}
@keyframes ada-pop{from{opacity:0;transform:scale(.4) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes ada-fade{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.9) translateY(-4px)}}
.ada-bubble:lang(ja){font-family:'Yu Gothic UI','Meiryo','Segoe UI Emoji',sans-serif}
.ada-bubble:lang(ko){font-family:'Malgun Gothic','Segoe UI Emoji',sans-serif}
.ada-bubble:lang(zh){font-family:'Microsoft YaHei','Segoe UI Emoji',sans-serif}
@media (max-width:640px){.ada{--ada:80px}.ada-bubble{font-size:14px;padding:6px 12px 5px;border-radius:17px}.ada-bubble.greet{font-size:18px;padding:5px 13px 4px}}
@media (prefers-reduced-motion:reduce){.ada,.ada.on,.ada.away{transition:none}.ada-bubble.show{animation:none;opacity:1;transform:none}.ada-bubble.hide{animation:none;opacity:0}.ada-bubble.sizing,.ada-bubble .tick,.ada-bubble .tline{transition:none}}
`;

 const calmQuery = matchMedia('(prefers-reduced-motion: reduce)');
 const calm = () => calmQuery.matches;
 const fineQuery = matchMedia('(hover: hover) and (pointer: fine)');

 let root, view, bubbleA, bubbleB;
 const scale = () => (view?.offsetWidth || 136) / 256;
 // 512 px clips only where the 256 px ones would be upscaled (high-DPI screens).
 const res = () => ((view?.offsetWidth || 136) * (devicePixelRatio || 1) > 256 ? 512 : 256);
 const fileUrl = (name, still) => `${BASE}${name}-${res()}.${still ? 'png' : 'webp'}`;
 const clipUrl = name => fileUrl(CONFIG.clips[name].file, false);
 const lookUrl = name => fileUrl(CONFIG.look[name], true);

 /* ---------- Files: fetched once (HTTP cache), replayed from memory ---------- */
 // An animated WebP restarts from frame 0 only under a new URL. A fresh blob: URL per play gives
 // that without asking the server again.
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
 // decode() sometimes never settles (hidden tab and the like); give a loaded picture at most 300 ms.
 function ready(img) {
  const done = img.complete && img.naturalWidth ? Promise.resolve()
   : new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('not loaded')); });
  return Promise.race([img.decode(), done.then(() => new Promise(r => setTimeout(r, 300)))]);
 }

 /* ---------- Picture: the old one stays until the new one is decoded ---------- */
 const stillUrls = new Map();
 let showToken = 0;
 async function show(url, restart) {
  const token = ++showToken;
  let blob;
  try { blob = await load(url); } catch (e) { console.warn('ada: could not load', url, e); return false; }
  if (token !== showToken) return false;
  let src = stillUrls.get(url), own = false;
  if (restart || !src) { src = URL.createObjectURL(blob); if (restart) own = true; else stillUrls.set(url, src); }
  const img = new Image();
  img.className = 'ada-layer'; img.alt = ''; img.draggable = false; img.src = src;
  if (own) img.dataset.own = src;
  const drop = () => { if (own) URL.revokeObjectURL(src); };
  try { await ready(img); } catch (e) { console.warn('ada: could not decode', url, e); drop(); return false; }
  if (token !== showToken) { drop(); return false; }
  const old = [...view.children];
  view.append(img);                                  // new one on top, same frame
  requestAnimationFrame(() => requestAnimationFrame(() => old.forEach(o => { o.remove(); if (o.dataset.own) URL.revokeObjectURL(o.dataset.own); })));
  if (!root.classList.contains('on')) requestAnimationFrame(() => { if (covering()) root.classList.add('away'); root.classList.add('on'); });
  return true;
 }

 /* ---------- Behaviour ---------- */
 const S = { state: 'idle', look: null, clipTimer: 0, queued: null, hovering: false, greet: null };

 const FADE_MS = 350, TICK_MS = 380, GUTTER = 16;
 let bubbleGen = 0, fontsReady = Promise.resolve(), tickCur = null;

 // Next to the head; if that side doesn't fit, above the head; always inside the screen.
 // w/h: the target size while a size change is still running. Offsets are the demo's, at 256 px.
 function placeBubble(el, side, w = el.offsetWidth, h = el.offsetHeight) {
  const stage = root.getBoundingClientRect(), k = scale();
  let x = side === 'right' ? 196 * k : 60 * k - w;
  let y = 34 * k - h;
  const fits = stage.left + x >= GUTTER && stage.left + x + w <= innerWidth - GUTTER;
  if (!fits) {
   x = side === 'right' ? 150 * k - w * 0.25 : 106 * k - w * 0.75;
   y = 22 * k - h;
  }
  x = Math.max(GUTTER - stage.left, Math.min(innerWidth - GUTTER - stage.left - w, x));
  el.style.translate = `${x}px ${y}px`;
  const headX = (side === 'right' ? 150 : 106) * k;  // tail keeps pointing at the mascot
  const tail = Math.max(22, Math.min(w - 22, headX - x));
  el.style.setProperty('--tail-x', tail + 'px');
  el.classList.toggle('tail-right', tail > w / 2);
 }

 // A line's natural size inside the bubble, measured on a hidden copy; as narrow as it can be
 // without adding a line, so the bubble wraps the text tightly.
 function measureLine(text, lang) {
  const m = document.createElement('div');
  m.className = 'ada-bubble'; m.lang = lang;
  m.style.cssText = 'visibility:hidden;animation:none;transform:none;left:-9999px;top:0';
  const t = document.createElement('div'); t.textContent = text;
  m.append(t); root.append(m);
  let r = t.getBoundingClientRect();
  const h = Math.ceil(r.height);
  let lo = 40, hi = r.width;
  t.style.width = 'max-content';
  for (let i = 0; i < 9; i++) {
   const mid = (lo + hi) / 2;
   t.style.width = mid + 'px';
   if (t.getBoundingClientRect().height > r.height + 1) lo = mid; else hi = mid;
  }
  t.style.width = hi + 'px'; r = t.getBoundingClientRect();
  const w = Math.min(Math.ceil(hi) + 1, Math.floor(parseFloat(getComputedStyle(m).maxWidth) - (m.offsetWidth - t.offsetWidth)) || Infinity);
  const size = { w, h, bw: m.offsetWidth - t.offsetWidth + w, bh: m.offsetHeight - t.offsetHeight + h };
  m.remove();
  return size;
 }

 function tickerLine(text, w) {
  const d = document.createElement('div');
  d.className = 'tline'; d.textContent = text; d.style.width = w + 'px';
  return d;
 }

 function prepareBubbles() {
  const id = currentLang();
  bubbleB.lang = LANG_TAGS[id];
  fontsReady = document.fonts.load(`700 16px ${getComputedStyle(bubbleB).fontFamily}`, LINES[id].join('')).catch(() => {});
  return ++bubbleGen;
 }

 // One step of the greeting: 0 = greeting bubble, first line opens the other bubble, the next scrolls in.
 async function bubbleStep(gen, idx) {
  await fontsReady;
  if (gen !== bubbleGen) return;
  const id = currentLang(), lang = LANG_TAGS[id], line = CONFIG.greeting[idx].line;
  if (idx === 0) {
   bubbleA.lang = lang;
   bubbleA.textContent = LINES[id][line];
   bubbleA.insertAdjacentHTML('beforeend', '<span class="heart">♡</span>');
   bubbleA.classList.remove('show', 'hide');
   placeBubble(bubbleA, 'right');
   void bubbleA.offsetWidth;
   bubbleA.classList.add('show');
   return;
  }
  if (bubbleA.classList.contains('show')) bubbleA.classList.replace('show', 'hide');
  const text = LINES[id][line], m = measureLine(text, lang);
  const el = tickerLine(text, m.w);
  bubbleB.lang = lang;
  if (!bubbleB.classList.contains('show')) {         // the bubble opens
   bubbleB.classList.remove('hide', 'sizing');
   const tick = document.createElement('div'); tick.className = 'tick';
   tick.style.width = m.w + 'px'; tick.style.height = m.h + 'px';
   tick.append(el); bubbleB.replaceChildren(tick);
   placeBubble(bubbleB, 'left', m.bw, m.bh);
   void bubbleB.offsetWidth;
   bubbleB.classList.add('show', 'sizing');          // from now on size and place change smoothly
  } else {                                           // the line slides down and out, the new one comes from the top
   const tick = bubbleB.querySelector('.tick');
   el.classList.add('enter');
   tick.append(el);
   tick.style.width = m.w + 'px'; tick.style.height = m.h + 'px';
   placeBubble(bubbleB, 'left', m.bw, m.bh);
   const old = tickCur;
   old?.classList.add('leave');
   void el.offsetWidth;
   el.classList.remove('enter');
   setTimeout(() => old?.remove(), TICK_MS);
  }
  tickCur = el;
 }

 function closeBubbles() {
  bubbleGen++;
  for (const el of [bubbleA, bubbleB]) if (el.classList.contains('show')) el.classList.replace('show', 'hide');
  setTimeout(() => { if (!bubbleB.classList.contains('show')) bubbleB.classList.remove('sizing'); }, FADE_MS);
  tickCur = null;
 }

 async function goIdle() {
  S.state = 'idle'; S.look = null;
  // Reduced motion: the still base pose instead of the blinking clip.
  const ok = calm() ? await show(lookUrl('center'), false) : await show(clipUrl('idle'), true);
  if (!ok && S.state === 'idle' && !S.look) { setTimeout(() => { if (S.state === 'idle' && !S.look) goIdle(); }, 1500); return; }
  updateLook();
 }

 // onStart: the moment the clip's first frame is on screen (its bubble line starts with it).
 async function play(name, onStart) {
  const clip = CONFIG.clips[name];
  clearTimeout(S.clipTimer);
  S.state = name; S.look = null;
  if (calm()) {                                      // no clip; only the bubbles keep their timing
   if (S.greet) { onStart?.(); S.clipTimer = setTimeout(() => finish(name), clip.duration); } else finish(name);
   return;
  }
  const ok = await show(clipUrl(name), true);
  if (S.state !== name) return;
  if (!ok) { finish(name); return; }
  onStart?.();
  S.clipTimer = setTimeout(() => finish(name), clip.duration);
 }

 function playGreetStep(gen, idx) {
  S.greet = { gen, idx };
  play(CONFIG.greeting[idx].clip, () => bubbleStep(gen, idx));
 }

 function finish(name) {
  if (S.state !== name) return;
  if (S.greet) {
   const { gen, idx } = S.greet;
   if (idx + 1 < CONFIG.greeting.length) return playGreetStep(gen, idx + 1);
   S.greet = null; closeBubbles();
  }
  const next = S.queued; S.queued = null;
  if (next && next !== name) request(next); else goIdle();
 }

 function request(name) {
  if (name === 'greet') {
   if (S.greet) return;                              // a greeting is running; don't stack
   if (S.state !== 'idle' && S.state !== 'look') { S.queued = 'greet'; return; }
   return playGreetStep(prepareBubbles(), 0);
  }
  if (calm()) return;                                // reduced motion: no giggle, no hop
  if (name === 'giggle' && S.state !== 'giggle') {   // a click interrupts; bubbles close cleanly
   if (S.greet) { S.greet = null; closeBubbles(); }
   return play('giggle');
  }
  if (S.state === 'idle' || S.state === 'look') return play(name);
  if (S.state !== name) S.queued = name;
 }

 // Out of the way: stop whatever is running and close the bubbles.
 function interrupt() {
  if (!S.greet && S.state === 'idle') return;
  clearTimeout(S.clipTimer);
  S.queued = null;
  if (S.greet) { S.greet = null; closeBubbles(); }
  goIdle();
 }

 function scheduleHop() {
  const [a, b] = CONFIG.hopEvery;
  setTimeout(() => {
   const url = clipUrl('hop');
   if (!calm() && (S.state === 'idle' || S.state === 'look') && !document.hidden && !root.classList.contains('away')) {
    if (loaded.has(url)) play('hop'); else load(url, 'low').catch(() => {});  // not fetched yet: next time
   }
   scheduleHop();
  }, a + Math.random() * (b - a));
 }

 /* ---------- Eye contact ---------- */
 const cursor = { x: 0, y: 0, inside: false, lastMove: 0 };
 let pendingDir = null, pendingSince = 0;
 const DIRS = ['right', 'downRight', 'down', 'downLeft', 'left', 'upLeft', 'up', 'upRight'];
 function dirFromCursor() {
  const r = view.getBoundingClientRect();
  const dx = cursor.x - (r.left + r.width / 2), dy = cursor.y - (r.top + r.height * 0.42);
  if (Math.hypot(dx, dy) < Math.max(40, CONFIG.lookNearPx * scale())) return null;
  const idx = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return CONFIG.lookMap[DIRS[(idx + 8) % 8]] || 'center';
 }
 function updateLook() {
  if (calm() || (S.state !== 'idle' && S.state !== 'look')) return;
  const resting = performance.now() - cursor.lastMove > CONFIG.lookIdleMs;
  let want = cursor.inside && !resting && !root.classList.contains('away') ? dirFromCursor() : null;
  if (want && !loaded.has(lookUrl(want))) { load(lookUrl(want), 'low').catch(() => {}); want = null; }
  if (want === S.look) { pendingDir = null; return; }
  const now = performance.now();
  if (want !== pendingDir) { pendingDir = want; pendingSince = now; return; }
  if (now - pendingSince < CONFIG.lookSettleMs) return;
  pendingDir = null;
  if (want === null) { goIdle(); return; }
  S.state = 'look'; S.look = want;
  show(lookUrl(want), false);
 }

 /* ---------- Staying clear of the page ---------- */
 // When the mascot would sit on text, a control, a heading, a picture/frame or the footer, it steps aside
 // (fades out and lets clicks through) until that part has scrolled past.
 const IMPORTANT = 'a,button,input,select,textarea,summary,label,iframe,video,canvas,img,svg,[role="button"],[tabindex]:not([tabindex="-1"]),h1,h2,h3,footer';
 let clearSince = 0, checkQueued = false;
 const range = document.createRange();
 // Text right under the mascot (the element's own lines, not just its box).
 function textUnder(el, a) {
  for (const node of el.childNodes) {
   if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
   range.selectNodeContents(node);
   for (const t of range.getClientRects()) if (t.right > a.left && t.left < a.right && t.bottom > a.top && t.top < a.bottom) return true;
  }
  return false;
 }
 function covering() {
  const r = view.getBoundingClientRect();
  // The octopus fills roughly the middle of its square; the corners are transparent.
  const a = { left: r.left + r.width * 0.2, right: r.right - r.width * 0.2, top: r.top + r.height * 0.2, bottom: r.bottom - r.height * 0.05 };
  for (const fx of [0.3, 0.5, 0.7]) for (const fy of [0.3, 0.55, 0.85]) {
   const x = r.left + r.width * fx, y = r.top + r.height * fy;
   const under = document.elementsFromPoint(x, y).find(el => !root.contains(el));
   if (!under || under === document.body || under === document.documentElement) continue;
   if (under.closest(IMPORTANT) || textUnder(under, a)) return true;
  }
  return false;
 }
 function checkClear() {
  checkQueued = false;
  if (!root || !root.classList.contains('on')) return;
  const away = root.classList.contains('away');
  if (covering()) {
   clearSince = 0;
   if (!away) { root.classList.add('away'); interrupt(); }
  } else if (away) {
   const now = performance.now();
   if (!clearSince) clearSince = now;
   else if (now - clearSince > 400) root.classList.remove('away');
  }
 }
 const queueCheck = () => { if (!checkQueued) { checkQueued = true; requestAnimationFrame(checkClear); } };

 /* ---------- Start: after the page has loaded, so first paint isn't slowed ---------- */
 function prefetch() {
  if (calm() || navigator.connection?.saveData) return;
  const urls = [...(fineQuery.matches ? Object.keys(CONFIG.look).map(lookUrl) : []),
   ...CONFIG.greeting.map(g => clipUrl(g.clip)), clipUrl('giggle'), clipUrl('hop')];
  urls.reduce((p, url) => p.then(() => load(url, 'low').catch(() => {})), Promise.resolve());
 }

 async function start() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  root = document.createElement('div');
  root.className = 'ada';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<div class="ada-view"></div><div class="ada-bubble greet"></div><div class="ada-bubble"></div>';
  [view, bubbleA, bubbleB] = root.children;
  document.body.append(root);

  let lastPointer = 'mouse';
  view.addEventListener('pointerdown', e => { lastPointer = e.pointerType; });
  view.addEventListener('pointerenter', e => {
   if (e.pointerType !== 'mouse') return;            // touch: the tap decides (below)
   if (!S.hovering) { S.hovering = true; request('greet'); }
  });
  view.addEventListener('pointerleave', () => { S.hovering = false; });
  view.addEventListener('click', () => {
   // With touch there is no hover: the first tap greets, a tap during it giggles.
   if (lastPointer !== 'mouse' && !S.greet && (S.state === 'idle' || S.state === 'look')) request('greet');
   else request('giggle');
  });

  addEventListener('pointermove', e => {
   if (e.pointerType !== 'mouse') return;
   cursor.x = e.clientX; cursor.y = e.clientY; cursor.inside = true; cursor.lastMove = performance.now();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { cursor.inside = false; });
  setInterval(updateLook, 60);

  addEventListener('scroll', queueCheck, { passive: true });
  addEventListener('resize', queueCheck, { passive: true });
  setInterval(queueCheck, 300);                      // menus, accordions and the like change the page too
  calmQuery.addEventListener?.('change', () => { interrupt(); if (!S.greet) goIdle(); });

  await goIdle();
  queueCheck();
  prefetch();
  scheduleHop();
 }

 window.AO_ADA = { get state() { return S; }, CONFIG, request };
 const begin = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2000 }) : setTimeout(start, 200));
 if (document.readyState === 'complete') begin(); else addEventListener('load', begin, { once: true });
})();
