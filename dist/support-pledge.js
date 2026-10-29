(() => {
 'use strict';
 // The support call to action: the button brings the wallet card into view and moves focus to its
 // tabs; the small layered mascot blinks and waves now and then (the app's own motion), never under
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
 if (!layers || !layers.animate) return;
 const eyes = [...layers.querySelectorAll('.eyeL,.eyeR')], arm = layers.querySelector('.arm');
 const BLINK = [
  { transform: 'scale(1,1)', filter: 'brightness(1)', easing: 'cubic-bezier(.55,0,.9,.4)' },
  { transform: 'scale(1.05,.17)', filter: 'brightness(1.45)', offset: .34 },
  { transform: 'scale(1.05,.17)', filter: 'brightness(1.45)', offset: .5, easing: 'cubic-bezier(.15,.75,.3,1)' },
  { transform: 'scale(.99,1.06)', filter: 'brightness(1)', offset: .82, easing: 'ease-in-out' },
  { transform: 'scale(1,1)', filter: 'brightness(1)' },
 ];
 const WAVE = [0, -9, 2, -8, 1, -5, 0].map((deg, i, all) => ({ transform: `rotate(${deg}deg)`, offset: i / (all.length - 1), easing: 'cubic-bezier(.45,0,.55,1)' }));
 let visible = false;
 const awake = () => visible && !reduce.matches && document.visibilityState === 'visible';
 const loopBlink = () => setTimeout(() => { if (awake()) eyes.forEach(e => e.animate(BLINK, { duration: 270 })); loopBlink(); }, 2600 + Math.random() * 3900);
 const loopWave = (delay = 7000 + Math.random() * 4000) => setTimeout(() => { if (awake() && arm) arm.animate(WAVE, { duration: 2100 }); loopWave(); }, delay);
 if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: .3 }).observe(layers);
 else visible = true;
 loopBlink(); loopWave(1800);
})();
