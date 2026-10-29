// Office demo: window seasons (29 Oct 2026). A row of season buttons under the window-weather ones.
// The office scene is the app's own (dist/ofis); a season is sent to it the way the app allows from
// outside: {type:'ofis-mevsim', mevsim:'ilkbahar'|'yaz'|'sonbahar'|'kis'} to each office frame inside
// the product office. Copy in all 11 site languages: label, then Spring, Summer, Autumn, Winter.
(() => {
  'use strict';
  const COPY = {
    en: ['Window season (demo)', 'Spring', 'Summer', 'Autumn', 'Winter'],
    tr: ['Pencere mevsimi (demo)', 'İlkbahar', 'Yaz', 'Sonbahar', 'Kış'],
    es: ['Estación en la ventana (demo)', 'Primavera', 'Verano', 'Otoño', 'Invierno'],
    de: ['Jahreszeit im Fenster (Demo)', 'Frühling', 'Sommer', 'Herbst', 'Winter'],
    fr: ['Saison à la fenêtre (démo)', 'Printemps', 'Été', 'Automne', 'Hiver'],
    'pt-BR': ['Estação na janela (demo)', 'Primavera', 'Verão', 'Outono', 'Inverno'],
    it: ['Stagione alla finestra (demo)', 'Primavera', 'Estate', 'Autunno', 'Inverno'],
    ru: ['Время года за окном (демо)', 'Весна', 'Лето', 'Осень', 'Зима'],
    ja: ['窓の季節（デモ）', '春', '夏', '秋', '冬'],
    ko: ['창밖 계절 (데모)', '봄', '여름', '가을', '겨울'],
    'zh-Hans': ['窗外季节（演示）', '春季', '夏季', '秋季', '冬季'],
  };
  const SEASONS = ['ilkbahar', 'yaz', 'sonbahar', 'kis'];
  const weather = document.querySelector('.office-weather');
  if (!weather) return;
  const fromTag = tag => { const t = String(tag || '').toLowerCase(); if (t.startsWith('zh')) return 'zh-Hans'; if (t === 'pt-br' || t.startsWith('pt')) return 'pt-BR'; const k = t.slice(0, 2); return COPY[k] ? k : 'en'; };
  let lang = fromTag(document.documentElement.lang), chosen = null;

  const group = document.createElement('div');
  group.className = 'office-weather office-season'; group.setAttribute('role', 'group');
  group.innerHTML = '<span class="office-weather-label"></span>' + SEASONS.map(s => `<button type="button" data-season="${s}" aria-pressed="false"></button>`).join('');
  // Both rows in one grid cell, so the section's row gap does not push them apart.
  const rows = document.createElement('div');
  rows.className = 'office-demo-rows';
  weather.before(rows); rows.append(weather, group);
  const style = document.createElement('style');
  style.textContent = '.office-demo-rows{grid-column:1/-1;min-width:0}.office-weather.office-season{margin-top:10px}';
  document.head.appendChild(style);
  const label = group.querySelector('.office-weather-label'), buttons = [...group.querySelectorAll('[data-season]')];
  const relabel = () => { const c = COPY[lang] || COPY.en; label.textContent = c[0]; group.setAttribute('aria-label', c[0]); buttons.forEach((b, i) => { b.textContent = c[i + 1]; }); };
  relabel();

  // Every office frame inside the product office (tabs or a split view make new ones), now and later.
  const productFrame = () => document.querySelector('.reference-office-frame');
  const hooked = new WeakSet();
  const officeFrames = () => { try { const doc = productFrame()?.contentDocument; return doc ? [...doc.querySelectorAll('iframe.office-frame')] : []; } catch { return []; } };
  const tell = frame => { if (chosen) try { frame.contentWindow?.postMessage({ type: 'ofis-mevsim', mevsim: chosen }, location.origin); } catch { /* not ready yet */ } };
  const send = () => officeFrames().forEach(f => { if (!hooked.has(f)) { hooked.add(f); f.addEventListener('load', () => setTimeout(() => tell(f), 400)); } tell(f); });
  let watched = null;
  const watch = () => {
    let doc = null; try { doc = productFrame()?.contentDocument; } catch { /* not ours */ }
    if (!doc || !doc.body || doc === watched) return;
    watched = doc;
    new MutationObserver(() => { if (chosen) send(); }).observe(doc.body, { childList: true, subtree: true });
  };
  buttons.forEach(b => b.addEventListener('click', () => {
    chosen = b.dataset.season; buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    const f = productFrame(); if (f && f.getAttribute('loading') === 'lazy') f.removeAttribute('loading');
    watch(); send(); setTimeout(() => { watch(); send(); }, 1200);
  }));
  // The product office (lazy, or reloaded for another language) says when it is ready.
  window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'native-office-ready') setTimeout(() => { watch(); send(); }, 800); });
  window.addEventListener('site-languagechange', e => { const id = e.detail && e.detail.language; lang = COPY[id] ? id : fromTag(document.documentElement.lang); relabel(); setTimeout(() => { watch(); send(); }, 1500); });
})();
