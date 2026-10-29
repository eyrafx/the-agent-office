(() => {
 'use strict';
 // Links to the privacy, FAQ and disclaimer pages carry the language the visitor is reading.
 const update = () => {
  const id = (window.AO_I18N && window.AO_I18N.language) || 'en';
  document.querySelectorAll('a[data-legal-link]').forEach(a => {
   const url = new URL(a.getAttribute('href'), location.href); url.searchParams.set('lang', id);
   a.setAttribute('href', url.pathname.split('/').pop() + url.search);
  });
 };
 // The footer's by-line carries the name from site-config.js (note.signer).
 const by = () => {
  const name = (window.AO_CONFIG && window.AO_CONFIG.note && window.AO_CONFIG.note.signer) || 'eyra';
  const t = window.AO_I18N ? window.AO_I18N.t : (s, v) => s.replace('{name}', v.name);
  document.querySelectorAll('[data-footer-by]').forEach(el => { el.textContent = ' · ' + t('by {name}', { name }); });
 };
 update(); by(); window.addEventListener('site-languagechange', () => { update(); by(); });
})();
