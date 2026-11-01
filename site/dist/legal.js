// Privacy, FAQ and disclaimer pages: one small renderer for all three, in every site language.
// Each page loads its own copy (window.AO_LEGAL = { en: {...}, tr: {...}, ... }) before this file.
(() => {
  'use strict';
  const LANGS = [['tr', 'Türkçe', 'tr-TR'], ['en', 'English', 'en-US'], ['es', 'Español', 'es-ES'], ['de', 'Deutsch', 'de-DE'], ['fr', 'Français', 'fr-FR'], ['pt-BR', 'Português (Brasil)', 'pt-BR'], ['it', 'Italiano', 'it-IT'], ['ru', 'Русский', 'ru-RU'], ['ja', '日本語', 'ja-JP'], ['ko', '한국어', 'ko-KR'], ['zh-Hans', '简体中文', 'zh-CN']];
  const UI = {
    en: { privacy: 'Privacy', faq: 'FAQ', disclaimer: 'Disclaimer', feedback: 'Feedback', download: 'Download', language: 'Language', home: 'Back to The Agent Office', updated: 'Last updated', by: 'by {name}' },
    tr: { privacy: 'Gizlilik', faq: 'SSS', disclaimer: 'Sorumluluk reddi', feedback: 'Geri bildirim', download: 'İndir', language: 'Dil', home: 'The Agent Office’e dön', updated: 'Son güncelleme', by: '{name} tarafından' },
    es: { privacy: 'Privacidad', faq: 'Preguntas frecuentes', disclaimer: 'Aviso legal', feedback: 'Comentarios', download: 'Descargar', language: 'Idioma', home: 'Volver a The Agent Office', updated: 'Última actualización', by: 'por {name}' },
    de: { privacy: 'Datenschutz', faq: 'FAQ', disclaimer: 'Haftungsausschluss', feedback: 'Feedback', download: 'Download', language: 'Sprache', home: 'Zurück zu The Agent Office', updated: 'Zuletzt aktualisiert', by: 'von {name}' },
    fr: { privacy: 'Confidentialité', faq: 'FAQ', disclaimer: 'Avertissement', feedback: 'Retours', download: 'Télécharger', language: 'Langue', home: 'Retour à The Agent Office', updated: 'Dernière mise à jour', by: 'par {name}' },
    'pt-BR': { privacy: 'Privacidade', faq: 'Perguntas frequentes', disclaimer: 'Aviso legal', feedback: 'Feedback', download: 'Baixar', language: 'Idioma', home: 'Voltar para The Agent Office', updated: 'Última atualização', by: 'por {name}' },
    it: { privacy: 'Privacy', faq: 'FAQ', disclaimer: 'Esclusione di responsabilità', feedback: 'Feedback', download: 'Scarica', language: 'Lingua', home: 'Torna a The Agent Office', updated: 'Ultimo aggiornamento', by: 'di {name}' },
    ru: { privacy: 'Конфиденциальность', faq: 'Вопросы и ответы', disclaimer: 'Отказ от ответственности', feedback: 'Отзывы', download: 'Скачать', language: 'Язык', home: 'Вернуться к The Agent Office', updated: 'Обновлено', by: 'автор: {name}' },
    ja: { privacy: 'プライバシー', faq: 'よくある質問', disclaimer: '免責事項', feedback: 'フィードバック', download: 'ダウンロード', language: '言語', home: 'The Agent Officeに戻る', updated: '最終更新', by: '制作: {name}' },
    ko: { privacy: '개인정보', faq: '자주 묻는 질문', disclaimer: '면책 조항', feedback: '피드백', download: '다운로드', language: '언어', home: 'The Agent Office로 돌아가기', updated: '최종 업데이트', by: '제작: {name}' },
    'zh-Hans': { privacy: '隐私', faq: '常见问题', disclaimer: '免责声明', feedback: '反馈', download: '下载', language: '语言', home: '返回 The Agent Office', updated: '最后更新', by: '制作：{name}' },
  };
  const copy = window.AO_LEGAL || {};
  const page = document.body.dataset.page;
  const ids = LANGS.map(l => l[0]);
  const config = window.AO_CONFIG || {};
  const fill = html => html.replace(/\{(\w+)\}/g, (m, k) => {
    const u = config.usage || {}, a = u.approximate !== false ? '~' : '';
    return ({ memory: `${a}${u.memoryMB ?? 150} MB`, cpu: `${a}${u.idleCpuPercent ?? 1}%`, size: `${a}${u.downloadMB ?? 9} MB` })[k] ?? m;
  });
  const home = (id, hash = '') => `index.html?lang=${encodeURIComponent(id)}${hash}`;
  const here = (file, id) => `${file}?lang=${encodeURIComponent(id)}`;

  function render(id) {
    // A page without this language shows the English text, so it is marked as English.
    const ui = UI[id] || UI.en, c = copy[id] || copy.en, tag = copy[id] ? (LANGS.find(l => l[0] === id) || LANGS[1])[2] : 'en-US';
    document.documentElement.lang = tag;
    document.title = `The Agent Office — ${c.title}`;
    const main = document.querySelector('#legal');
    const section = s => `<section>${s.h ? `<h2>${s.h}</h2>` : ''}${(s.p || []).map(p => `<p>${fill(p)}</p>`).join('')}${s.items ? `<ul>${s.items.map(i => `<li>${fill(i)}</li>`).join('')}</ul>` : ''}</section>`;
    const qa = q => `<details><summary>${q.q}</summary><div>${q.a.map(p => `<p>${fill(p)}</p>`).join('')}</div></details>`;
    main.innerHTML = `<h1>${c.title}</h1>${c.updated ? `<p class="when">${(copy[id] ? ui : UI.en).updated}: ${c.updated}</p>` : ''}${(c.intro || []).map(p => `<p class="lead">${fill(p)}</p>`).join('')}${(c.sections || []).map(section).join('')}${c.questions ? `<div class="legal-faq">${c.questions.map(qa).join('')}</div>` : ''}`;
    document.querySelector('[data-legal-home]').href = home(id);
    document.querySelector('[data-legal-home] span').textContent = ui.home;
    const select = document.querySelector('#legal-language');
    select.value = id; select.setAttribute('aria-label', ui.language);
    document.querySelector('label[for="legal-language"]').textContent = ui.language;
    const signer = (config.note && config.note.signer) || 'eyra';
    document.querySelector('[data-footer-by]').textContent = ' · ' + (ui.by || UI.en.by).replace('{name}', signer);
    document.querySelector('#legal-footer-links').innerHTML = [
      ['privacy.html', ui.privacy, 'privacy'], ['faq.html', ui.faq, 'faq'], ['disclaimer.html', ui.disclaimer, 'disclaimer'],
    ].map(([f, label, key]) => `<a href="${here(f, id)}"${key === page ? ' aria-current="page"' : ''}>${label}</a>`).join('') +
      `<a href="${home(id, '#feedback')}">${ui.feedback}</a><a href="${home(id, '#download')}">${ui.download}</a><a href="${home(id, '#languages')}">${ui.language}</a>`;
  }

  const select = document.querySelector('#legal-language');
  select.innerHTML = LANGS.map(([id, name, tag]) => `<option value="${id}" lang="${tag}">${name}</option>`).join('');
  let id = new URLSearchParams(location.search).get('lang');
  if (!ids.includes(id)) { try { id = localStorage.getItem('agentoffice:site-language'); } catch { id = null; } }
  if (!ids.includes(id)) { const nav = (navigator.language || '').toLowerCase(); id = nav.startsWith('zh') ? 'zh-Hans' : nav.startsWith('pt') ? 'pt-BR' : ids.find(x => nav.startsWith(x)) || 'en'; }
  render(id);
  select.addEventListener('change', () => {
    const next = select.value; render(next);
    try { localStorage.setItem('agentoffice:site-language', next); } catch { /* No storage: the URL keeps it. */ }
    const url = new URL(location.href); url.searchParams.set('lang', next); history.replaceState(null, '', url);
  });
})();
