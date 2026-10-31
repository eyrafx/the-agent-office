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
 const POSE = n => `assets/octo/octo-${n}-720.webp`;
 const SRCSET = n => `assets/octo/octo-${n}-360.webp 360w, assets/octo/octo-${n}-720.webp 720w`;
 ['base', 'shy', 'plead'].forEach(n => { const i = new Image(); i.srcset = SRCSET(n); i.sizes = '480px'; });
 document.querySelectorAll('[data-kw-octo]').forEach(img => {
  let pose = 'wave', timer;
  // the hero's sunburst band follows the pose (kawaii.css colours it per data-octo)
  const stage = img.closest('.reference-hero');
  const set = n => { if (pose === n) return; pose = n; img.srcset = SRCSET(n); img.src = POSE(n); img.dataset.pose = n; if (stage) stage.dataset.octo = n; };
  if (stage) stage.dataset.octo = pose;
  setTimeout(() => pose === 'wave' && set('base'), reduce.matches ? 0 : 1900);
  img.addEventListener('pointerenter', e => e.pointerType === 'mouse' && set('shy'));
  img.addEventListener('pointerleave', e => e.pointerType === 'mouse' && set('base'));
  img.addEventListener('pointerdown', () => { clearTimeout(timer); set('plead'); });
  img.addEventListener('pointerup', e => { set('shy'); if (e.pointerType !== 'mouse') timer = setTimeout(() => set('base'), 1400); });
  img.addEventListener('pointercancel', () => set('base'));
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
})();
