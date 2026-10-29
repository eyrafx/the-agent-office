(() => {
 'use strict';
 // The support call to action: the button brings the wallet card into view and moves focus to its
 // tabs; the small chibi mascot blinks now and then (the app's own motion), never under
 // reduced motion or while off screen.
 const button = document.querySelector('[data-open-wallets]');
 const card = document.querySelector('.wallet-card');
 const reduce = matchMedia('(prefers-reduced-motion: reduce)');
 button?.addEventListener('click', () => {
  if (!card) return;
  card.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'center' });
  const tab = card.querySelector('[role="tab"][aria-selected="true"]') || card.querySelector('[role="tab"]');
  setTimeout(() => tab?.focus({ preventScroll: true }), reduce.matches ? 0 : 450);
  card.classList.remove('is-called'); void card.offsetWidth; card.classList.add('is-called');
 });
 const layers = document.querySelector('.pledge-layers');
 if (!layers) return;
 // The chibi octopus as in the app: the body stays still, only the face blinks now and then.
 let visible = false;
 const awake = () => visible && !reduce.matches && document.visibilityState === 'visible';
 const blink = () => { layers.classList.add('is-blinking'); setTimeout(() => layers.classList.remove('is-blinking'), 160); };
 const loop = () => setTimeout(() => { if (awake()) { blink(); if (Math.random() < .2) setTimeout(blink, 320); } loop(); }, 2600 + Math.random() * 3900);
 if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: .3 }).observe(layers);
 else visible = true;
 loop();
})();
