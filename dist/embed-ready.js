(() => {
 'use strict';
 // The hero island and the closing mascot fade in once their page has loaded, so the first paint
 // never shows an empty or dark frame (their pages are transparent from the first byte too).
 document.querySelectorAll('.hero-island-live iframe, iframe.release-mascot').forEach(frame => {
  const ready = () => frame.classList.add('is-ready');
  let done = false;
  try { done = frame.contentDocument && frame.contentDocument.readyState === 'complete' && frame.contentDocument.body && frame.contentDocument.body.childElementCount > 0; } catch { done = true; }
  if (done) ready(); else frame.addEventListener('load', () => setTimeout(ready, 120), { once: true });
  setTimeout(ready, 6000); // never leave it hidden
 });
})();

// While the hero island is open, the navigation underneath steps back so the two never collide.
(() => {
 const frame = document.querySelector('.hero-island-live iframe');
 if (!frame) return;
 window.addEventListener('message', e => { if (e.origin === location.origin && e.source === frame.contentWindow && e.data && e.data.type === 'product-state') document.documentElement.classList.toggle('hero-island-open', !!e.data.expanded); });
 // A finger has no hover to lose: a tap anywhere else on the page closes the island it opened.
 document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && frame.contentWindow) frame.contentWindow.postMessage({ type: 'hero-pointer-away' }, location.origin); }, { passive: true });
})();
