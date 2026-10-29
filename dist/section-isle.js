(() => {
 'use strict';
 // Page sections as one quiet hairline with a small marker on the left edge (wide screens), or a
 // thin progress line along the top (narrow screens). Covers every main part of the page and hides
 // at the very top and at the footer.
 const t = text => (window.AO_I18N ? window.AO_I18N.t(text) : text);
 const $ = s => document.querySelector(s);
 const groups = [
  ['AgentOffice', ['.reference-hero']],
  ['Live demo', ['#demo']],
  ['Agents', ['#inside']],
  ['The office', ['#team']],
  ['The island', ['#media-preview', '#notes-preview', '#focus-preview', '#alarm-preview', '#water-preview', '#shelf-preview', '#settings-preview']],
  ['Languages', ['#languages']],
  ['On Windows', ['#windows-features', '#usage']],
  ['Download', ['#download', '#note', '#getting-started']],
  ['Support', ['#support']],
  ['Feedback', ['#feedback']],
  ['FAQ', ['.faq']],
 ].map(([label, selectors]) => ({ label, els: selectors.map($).filter(Boolean) })).filter(g => g.els.length);
 if (groups.length < 3) return;
 const anchor = (el, i) => { if (!el.id) el.id = i === 0 ? 'top' : 'section-' + groups[i].label.toLowerCase().replace(/[^a-z]+/g, '-'); return '#' + el.id; };

 const nav = document.createElement('nav');
 nav.className = 'section-isle';
 nav.innerHTML = `<div class="section-isle-track"><span class="section-isle-pill" aria-hidden="true"><i></i></span><ol>${groups.map((g, i) => `<li style="--at:${i / (groups.length - 1)}"><a href="${anchor(g.els[0], i)}"><span class="section-isle-label"></span></a></li>`).join('')}</ol></div>`;
 const line = document.createElement('div');
 line.className = 'section-line'; line.setAttribute('aria-hidden', 'true'); line.innerHTML = '<i></i>';
 document.body.append(nav, line);
 const links = [...nav.querySelectorAll('a')], pill = nav.querySelector('.section-isle-pill');

 const words = () => {
  nav.setAttribute('aria-label', t('Page sections'));
  links.forEach((a, i) => { a.querySelector('.section-isle-label').textContent = t(groups[i].label); });
 };
 words(); window.addEventListener('site-languagechange', words);

 let current = -1, hush = 0;
 const footer = $('footer');
 function update() {
  const mark = innerHeight * .4;
  let at = 0;
  groups.forEach((g, i) => { if (g.els[0].getBoundingClientRect().top <= mark) at = i; });
  const heroGone = groups[0].els[0].getBoundingClientRect().bottom < innerHeight * .55;
  const footerIn = footer && footer.getBoundingClientRect().top < innerHeight * .92;
  nav.classList.toggle('is-shown', heroGone && !footerIn);
  const max = document.documentElement.scrollHeight - innerHeight;
  line.style.setProperty('--done', max > 0 ? Math.min(1, scrollY / max).toFixed(4) : '0');
  line.classList.toggle('is-shown', heroGone);
  if (at !== current) {
   current = at;
   links.forEach((a, i) => { if (i === at) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
   pill.style.setProperty('--at', String(at / (groups.length - 1)));
   // Say the new section's name for a moment, then fade back to the marker alone.
   nav.classList.add('is-telling'); clearTimeout(hush); hush = setTimeout(() => nav.classList.remove('is-telling'), 1800);
  }
 }
 let ticking = false;
 const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; update(); }); } };
 addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll);
 update();
})();
