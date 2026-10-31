(() => {
 'use strict';
 // The kawaii layer: sakura petals, the hero's sticker Octo and the thank-you corner of the
 // support section. Day only (html.kw in the markup); the night theme was dropped on 31 Oct.
 const reduce = matchMedia('(prefers-reduced-motion: reduce)');
 const PETALS = { colors: [['#ff6fae', '#ffc0dc'], ['#ff8fc0', '#ffe2ef'], ['#ff5fa2', '#ffd0e4']] };

 // Sakura: a richer layer in the hero, a light one over the rest of the page that rests while the
 // hero is on screen.
 const hero = document.querySelector('.reference-hero');
 if (window.Sakura) {
  const canvas = cls => { const c = document.createElement('canvas'); c.className = `kw-petals ${cls}`; c.setAttribute('aria-hidden', 'true'); return c; };
  const page = canvas('kw-page');
  document.body.append(page);
  const pageLayer = Sakura.layer({ back: page, maxBack: 20, maxFront: 0, size: 1.2, ...PETALS });
  if (hero) {
   const back = canvas('kw-back'), front = canvas('kw-front');
   hero.prepend(back); hero.append(front);
   Sakura.layer({ area: hero, back, front, maxBack: 44, maxFront: 8, wind: 0.5, size: 1.2, ...PETALS });
   new IntersectionObserver(([e]) => pageLayer.hold(e.isIntersecting), { rootMargin: '-25% 0px 0px 0px' }).observe(hero);
  }
 }

 // Octo poses: hello first, then the resting pose; shy when the cursor lands on him, pleading while
 // pressed. A tap on a phone gets a short shy moment.
 // Octo's poses are crisp stills; once the page has settled (desktop, motion allowed, no data
 // saver) the pink idle clip (ada-75, re-encoded for the web) is fetched and plays while he rests.
 // The sticker box has a fixed aspect, so swapping still and clip never moves the layout.
 const POSE = n => `assets/octo/octo-${n}-720.webp`;
 const SRCSET = n => `assets/octo/octo-${n}-360.webp 360w, assets/octo/octo-${n}-720.webp 720w`;
 const IDLE_CLIP = 'assets/octo/octo-idle-512.webp';
 ['base', 'shy', 'plead'].forEach(n => { const i = new Image(); i.srcset = SRCSET(n); i.sizes = '480px'; });
 document.querySelectorAll('[data-kw-octo]').forEach(img => {
  let pose = 'wave', timer, hover, clip = null;
  // the hero's sunburst band follows the pose (kawaii.css colours it per data-octo)
  const stage = img.closest('.reference-hero');
  // The fixed-size sticker box takes the pointer, not the image: the image's box grows and shrinks
  // between still and clip, which used to flip Octo back and forth under a parked cursor.
  const box = img.closest('.kw-sticker') || img;
  const show = n => {
   if (n === 'base' && clip) { img.removeAttribute('srcset'); img.classList.add('kw-clip'); img.src = clip; return; }
   img.classList.remove('kw-clip'); img.srcset = SRCSET(n); img.src = POSE(n);
  };
  const set = n => { if (pose === n) return; pose = n; img.dataset.pose = n; if (stage) stage.dataset.octo = n; show(n); };
  // A short delay on the way in and a longer one on the way out: brushing the edge starts nothing.
  const later = (fn, ms) => { clearTimeout(hover); hover = setTimeout(fn, ms); };
  const on = v => { box.classList.toggle('kw-on', v); set(v ? 'shy' : 'base'); };
  if (stage) stage.dataset.octo = pose;
  setTimeout(() => pose === 'wave' && set('base'), reduce.matches ? 0 : 1900);
  const wantClip = !reduce.matches && !navigator.connection?.saveData && matchMedia('(min-width: 900px)').matches;
  if (wantClip) addEventListener('load', () => {
   const go = () => { const c = new Image(); c.src = IDLE_CLIP; (c.decode ? c.decode() : Promise.resolve()).then(() => { clip = c.src; if (pose === 'base') show('base'); }).catch(() => {}); };
   window.requestIdleCallback ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 1500);
  }, { once: true });
  box.addEventListener('pointerenter', e => e.pointerType === 'mouse' && later(() => on(true), 80));
  box.addEventListener('pointerleave', e => e.pointerType === 'mouse' && later(() => on(false), 220));
  box.addEventListener('pointerdown', () => { clearTimeout(timer); clearTimeout(hover); set('plead'); });
  box.addEventListener('pointerup', e => { set('shy'); if (e.pointerType !== 'mouse') timer = setTimeout(() => set('base'), 1400); });
  box.addEventListener('pointercancel', () => { box.classList.remove('kw-on'); set('base'); });
 });

 // Say thanks: the support Octo blushes and says thank you. Nothing is sent anywhere.
 const thanks = document.querySelector('[data-kw-thanks]');
 if (thanks) {
  const body = document.querySelector('.pledge-layers .body');
  const bubble = document.querySelector('.kw-thanks-bubble');
  let t;
  thanks.addEventListener('click', () => {
   clearTimeout(t);
   if (body) { body.srcset = 'assets/octo/octo-shy-128.webp 128w, assets/octo/octo-shy-256.webp 256w'; body.src = 'assets/octo/octo-shy-256.webp'; }
   document.querySelector('.support-pledge')?.classList.add('kw-thanked');
   if (bubble) { bubble.hidden = false; bubble.classList.remove('kw-pop'); void bubble.offsetWidth; bubble.classList.add('kw-pop'); }
   t = setTimeout(() => {
    if (body) { body.srcset = 'assets/octo/octo-base-128.webp 128w, assets/octo/octo-base-256.webp 256w'; body.src = 'assets/octo/octo-base-256.webp'; }
    document.querySelector('.support-pledge')?.classList.remove('kw-thanked');
   }, 3200);
  });
 }

 // Video slots ("The Agent Office" film and loops): a slot with data-src gets a muted, looping
 // video that plays only while on screen; without one the placeholder stays. Reduced motion shows
 // the poster with controls instead of autoplay.
 document.querySelectorAll('[data-kw-video]').forEach(slot => {
  const src = slot.dataset.src;
  if (!src) return;
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
  if (slot.dataset.poster) v.poster = slot.dataset.poster;
  v.src = src;
  if (reduce.matches) v.controls = true;
  slot.prepend(v); slot.classList.add('has-video');
  new IntersectionObserver(([e]) => { if (reduce.matches) return; e.isIntersecting ? v.play().catch(() => {}) : v.pause(); }, { threshold: .25 }).observe(slot);
 });
})();
