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
