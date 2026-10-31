(() => {
 'use strict';
 // The kawaii layer: the day/night switch, sakura petals, the hero's sticker Octo and the
 // thank-you corner of the support section. The theme itself is set before the first paint by the
 // inline script in <head>; this file only changes it and keeps the rest in step.
 const root = document.documentElement;
 const reduce = matchMedia('(prefers-reduced-motion: reduce)');
 const system = matchMedia('(prefers-color-scheme: dark)');
 const KEY = 'agentoffice:theme';
 const stored = () => { try { const v = localStorage.getItem(KEY); return v === 'day' || v === 'night' ? v : null; } catch { return null; } };
 const theme = () => root.dataset.theme === 'night' ? 'night' : 'day';

 const PETALS = {
  day: { colors: [['#ff8fbf', '#ffd2e5'], ['#ffb3d1', '#fff4f9']], glow: null },
  night: { colors: [['#ffc4de', '#fff6fb'], ['#ff9cc8', '#ffe3f0']], glow: 'rgba(255,150,205,.85)' }
 };
 const layers = [];

 function apply(next) {
  root.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'night' ? '#120f33' : '#fff6d2');
  document.querySelectorAll('[data-kw-theme]').forEach(b => b.setAttribute('aria-pressed', String(next === 'night')));
  layers.forEach(l => l.restyle(next));
  dispatchEvent(new CustomEvent('kw-themechange', { detail: { theme: next } }));
 }

 // The switch: a sun and a moon on a little track. Where the browser can, the new theme opens
 // as a circle from the switch; otherwise (and with reduced motion) it simply changes.
 function toggle(button) {
  const next = theme() === 'night' ? 'day' : 'night';
  try { localStorage.setItem(KEY, next); } catch {}
  if (!document.startViewTransition || reduce.matches) { apply(next); return; }
  const r = button.getBoundingClientRect();
  root.style.setProperty('--kw-x', `${r.left + r.width / 2}px`);
  root.style.setProperty('--kw-y', `${r.top + r.height / 2}px`);
  root.classList.add('kw-switching');
  document.startViewTransition(() => apply(next)).finished.finally(() => root.classList.remove('kw-switching'));
 }
 document.querySelectorAll('[data-kw-theme]').forEach(b => {
  b.setAttribute('aria-pressed', String(theme() === 'night'));
  b.addEventListener('click', () => toggle(b));
 });
 system.addEventListener('change', e => { if (!stored()) apply(e.matches ? 'night' : 'day'); });
 // FAQ and legal pages have no site dictionary; the switch's name follows the page language there.
 if (!window.AO_COPY) {
  const NAME = { tr: 'Gece teması', en: 'Night theme', es: 'Tema nocturno', de: 'Nachtmodus', fr: 'Thème nuit', pt: 'Tema noturno', it: 'Tema notte', ru: 'Ночная тема', ja: 'ナイトテーマ', ko: '야간 테마', zh: '夜间主题' };
  const name = () => { const n = NAME[(root.lang || 'en').slice(0, 2).toLowerCase()] || NAME.en; document.querySelectorAll('[data-kw-theme]').forEach(b => { b.setAttribute('aria-label', n); b.title = n; }); };
  name(); new MutationObserver(name).observe(root, { attributes: true, attributeFilter: ['lang'] });
 }

 // Sakura: a richer layer in the hero (with stars at night), a light one over the rest of the page
 // that rests while the hero is on screen.
 const hero = document.querySelector('.reference-hero');
 if (window.Sakura) {
  const canvas = cls => { const c = document.createElement('canvas'); c.className = `kw-petals ${cls}`; c.setAttribute('aria-hidden', 'true'); return c; };
  const page = canvas('kw-page');
  document.body.append(page);
  const pageLayer = Sakura.layer({ back: page, maxBack: 14, maxFront: 0, ...PETALS[theme()] });
  layers.push({ restyle: t => pageLayer.set(PETALS[t]) });
  if (hero) {
   const back = canvas('kw-back'), front = canvas('kw-front');
   hero.prepend(back); hero.append(front);
   const night = t => t === 'night' ? { stars: 120 } : { stars: 0 };
   const heroLayer = Sakura.layer({ area: hero, back, front, maxBack: 34, maxFront: 7, wind: 0.5, ...PETALS[theme()], ...night(theme()) });
   layers.push({ restyle: t => heroLayer.set({ ...PETALS[t], ...night(t) }) });
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
  const set = n => { if (pose === n) return; pose = n; img.srcset = SRCSET(n); img.src = POSE(n); img.dataset.pose = n; };
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
