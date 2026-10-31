// Support wallets (local QR codes, copy), feedback, hardware figures and download links,
// all read from site-config.js. Words go through the site's translator (site-i18n.js).
(() => {
  'use strict';
  const config = window.AO_CONFIG || {};
  const t = text => (window.AO_I18N ? window.AO_I18N.t(text) : text);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const isPlaceholder = value => !value || /PLACEHOLDER/i.test(value);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ——— QR codes, drawn here from the bundled generator (vendor/qrcode.js); no remote service ———
  function qrSvg(text) {
    if (typeof window.qrcode !== 'function') return '';
    const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
    const n = qr.getModuleCount(), quiet = 2; let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    const size = n + quiet * 2;
    return `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#10131c"/></svg>`;
  }

  // ——— wallets ———
  const wallets = Array.isArray(config.wallets) ? config.wallets : [];
  const tabs = $('.wallet-tabs'), panels = $('.wallet-panels');
  if (tabs && panels && wallets.length) {
    // Open on the first wallet that has a real address; a wallet still waiting for one says so itself.
    const first = Math.max(0, wallets.findIndex(w => !isPlaceholder(w.address)));
    tabs.innerHTML = wallets.map((w, i) => `<button type="button" role="tab" id="wallet-tab-${esc(w.id)}" aria-controls="wallet-${esc(w.id)}" aria-selected="${i === first}" tabindex="${i === first ? 0 : -1}" class="${isPlaceholder(w.address) ? 'is-placeholder' : ''}" style="--coin:${esc(w.color || '#ffad62')}"><i aria-hidden="true"></i><b>${esc(w.coin)}</b>${isPlaceholder(w.address) ? '<small>Coming soon</small>' : ''}</button>`).join('');
    panels.innerHTML = wallets.map((w, i) => {
      const placeholder = isPlaceholder(w.address);
      return `<div class="wallet-panel${placeholder ? ' is-placeholder' : ''}" role="tabpanel" id="wallet-${esc(w.id)}" aria-labelledby="wallet-tab-${esc(w.id)}" ${i === first ? '' : 'hidden'} style="--coin:${esc(w.color || '#ffad62')}">
        <div class="wallet-qr"><div class="wallet-qr-code" ${placeholder ? 'aria-hidden="true"' : 'role="img" aria-label="QR code for this address"'}>${qrSvg(w.address)}</div>${placeholder ? '<span class="wallet-qr-flag">Address coming soon</span>' : ''}</div>
        <div class="wallet-info"><p class="wallet-coin"><b>${esc(w.coin)}</b><span>${esc(w.network)}</span></p>
          ${placeholder ? '<p class="wallet-soon">Address coming soon</p>' : `<div class="wallet-address"><code>${esc(w.address)}</code><button type="button" class="wallet-copy" data-copy="${esc(w.address)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span>Copy address</span></button></div>`}${Array.isArray(w.notes) && w.notes.length ? `<ul class="wallet-notes">${w.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
          <p class="wallet-copy-status" role="status" aria-live="polite"></p></div></div>`;
    }).join('');
    const badge = $('[data-wallet-badge]'); if (badge) badge.hidden = !wallets.every(w => isPlaceholder(w.address));
    const select = button => {
      $$('[role="tab"]', tabs).forEach(b => { const on = b === button; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $('#' + b.getAttribute('aria-controls')).hidden = !on; });
    };
    tabs.addEventListener('click', e => { const b = e.target.closest('[role="tab"]'); if (b) select(b); });
    tabs.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const list = $$('[role="tab"]', tabs), at = list.indexOf(document.activeElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
      e.preventDefault(); list[next].focus(); select(list[next]);
    });
    panels.addEventListener('click', async e => {
      const b = e.target.closest('.wallet-copy'); if (!b) return;
      const status = b.closest('.wallet-panel').querySelector('.wallet-copy-status'), label = b.querySelector('span');
      let ok = false;
      try { await navigator.clipboard.writeText(b.dataset.copy); ok = true; }
      catch { // Older browsers, or a page without clipboard permission: copy through a hidden field.
        const field = document.createElement('textarea'); field.value = b.dataset.copy; field.setAttribute('readonly', ''); field.style.cssText = 'position:fixed;opacity:0;top:0';
        document.body.append(field); field.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } field.remove();
      }
      clearTimeout(b._timer);
      if (ok) { b.classList.add('done'); label.textContent = t('Copied'); status.textContent = t('Copied'); }
      else status.textContent = t('Copy failed. Select the address and copy it by hand.');
      b._timer = setTimeout(() => { b.classList.remove('done'); label.textContent = t('Copy address'); status.textContent = ''; }, 2200);
    });
  }

  // ——— feedback (no backend: an email draft, or "coming soon") ———
  const form = $('.feedback-form');
  if (form) {
    const status = $('.feedback-status', form), message = $('#feedback-message', form), contact = $('#feedback-contact', form);
    const fb = config.feedback || {};
    const mailto = fb.mode === 'mailto' && /@/.test(fb.email || '');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = message.value.trim();
      if (!text) { status.textContent = t('Please write a message first.'); status.dataset.kind = 'warn'; message.focus(); return; }
      status.dataset.kind = 'ok';
      if (mailto) {
        const body = contact.value.trim() ? `${text}\n\n— ${contact.value.trim()}` : text;
        location.href = `mailto:${encodeURIComponent(fb.email)}?subject=${encodeURIComponent(fb.subject || 'AgentOffice feedback')}&body=${encodeURIComponent(body)}`;
        status.textContent = t('Your email app will open with this message ready to send.');
      } else status.textContent = t('Sending from the site is coming soon. Thank you for writing!');
    });
  }

  // ——— hardware figures (approximate, from site-config.js) ———
  const usage = config.usage || {};
  const approx = usage.approximate !== false ? '~' : '';
  const values = { memory: `${approx}${usage.memoryMB ?? 150} MB`, cpu: `${approx}${usage.idleCpuPercent ?? 1}%`, download: `${approx}${usage.downloadMB ?? 9} MB` };
  $$('[data-usage]').forEach(el => { el.textContent = values[el.dataset.usage] ?? ''; });
  $$('[data-usage-approx]').forEach(el => { el.hidden = usage.approximate === false; });

  // ——— download links (empty: not published yet) ———
  const dl = config.download || {};
  for (const kind of ['store', 'installer']) {
    const url = kind === 'store' ? dl.storeUrl : dl.installerUrl, link = $(`[data-download="${kind}"]`), soon = $(`[data-download-soon="${kind}"]`);
    if (!link) continue;
    if (url) { link.href = url; link.removeAttribute('aria-disabled'); link.classList.remove('is-soon'); if (kind === 'store') { link.target = '_blank'; link.rel = 'noopener'; } if (soon) soon.hidden = true; }
    else { link.setAttribute('aria-disabled', 'true'); link.classList.add('is-soon'); link.removeAttribute('href'); link.setAttribute('role', 'link'); if (soon) soon.hidden = true; if (!link.querySelector('.soon-pill')) link.insertAdjacentHTML('beforeend', '<small class="soon-pill">Coming soon</small>'); }
  }
  // Nothing published yet: the Windows buttons in the hero and the closing section say so too
  // (they still lead to the download block, which explains the options).
  // The markup already carries the "Coming soon" pill, so the hero does not reflow when this runs;
  // once a link is published it goes away.
  if (!dl.storeUrl && !dl.installerUrl) $$('.download-action:not(.mac-action)').forEach(btn => { btn.classList.add('is-soon'); if (!btn.querySelector('small')) btn.insertAdjacentHTML('beforeend', '<small>Coming soon</small>'); });
  else $$('.download-action:not(.mac-action)').forEach(btn => { btn.classList.remove('is-soon'); btn.querySelector('small')?.remove(); });

  // ——— placeholders follow the site language ———
  const placeholders = () => $$('[data-placeholder]').forEach(el => { el.placeholder = t(el.dataset.placeholder); });
  placeholders(); window.addEventListener('site-languagechange', placeholders);

  // ——— office demo: window weather buttons (demo data sent to the office frame) ———
  const weatherButtons = $$('[data-weather]');
  if (weatherButtons.length) {
    let chosen = null;
    const officeFrame = () => document.querySelector('.reference-office-frame');
    const sendWeather = () => { const f = officeFrame(); if (chosen && f && f.contentWindow) f.contentWindow.postMessage({ type: 'office-weather', kind: chosen, place: t('Demo') }, location.origin); };
    weatherButtons.forEach(b => b.addEventListener('click', () => {
      chosen = b.dataset.weather; weatherButtons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const f = officeFrame(); if (f && f.getAttribute('loading') === 'lazy') f.removeAttribute('loading');
      sendWeather();
    }));
    // The office frame (lazy, or reloaded for another language) asks again once it is ready.
    window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'native-office-ready') setTimeout(sendWeather, 300); });
    window.addEventListener('site-languagechange', () => setTimeout(sendWeather, 1200));
  }

  // ——— the inactive macOS button does nothing ———
  $$('.mac-action').forEach(el => el.addEventListener('click', e => e.preventDefault()));
})();
