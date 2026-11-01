(() => {
 'use strict';
 // Contact links (GitHub Discussions, GitHub Issues) come from site-config.js; the page's own
 // addresses are the fallback when scripts are off.
 const fb = (window.AO_CONFIG && window.AO_CONFIG.feedback) || {};
 const set = (kind, href, label) => document.querySelectorAll(`a[data-contact="${kind}"]`).forEach(a => {
  if (!href) { a.closest('li')?.remove(); return; }
  a.href = href; const b = a.querySelector('[data-contact-label]'); if (b && label) b.textContent = label;
 });
 set('discussions', fb.discussions);
 set('issues', fb.issues);
})();
