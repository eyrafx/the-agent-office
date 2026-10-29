(() => {
 'use strict';
 // The developer's note and the installer fingerprint, both read from site-config.js.
 const config = window.AO_CONFIG || {};
 const t = text => (window.AO_I18N ? window.AO_I18N.t(text) : text);
 const signer = (config.note && config.note.signer) || 'eyra';
 document.querySelectorAll('[data-note-signer]').forEach(el => { el.textContent = signer; });
 const sha = String((config.download && config.download.sha256) || '').trim().toLowerCase();
 const real = /^[0-9a-f]{64}$/.test(sha);
 document.querySelectorAll('[data-sha-sentence]').forEach(el => { el.hidden = !real; });
 const box = document.querySelector('[data-sha]');
 if (!box || !real) return;
 box.hidden = false;
 box.querySelector('[data-sha-value]').textContent = sha;
 const button = box.querySelector('[data-sha-copy]'), label = button.querySelector('span'), status = box.querySelector('.get-sha-status');
 button.addEventListener('click', async () => {
  let ok = false;
  try { await navigator.clipboard.writeText(sha); ok = true; } catch {
   const field = document.createElement('textarea'); field.value = sha; field.setAttribute('readonly', ''); field.style.cssText = 'position:fixed;opacity:0;top:0';
   document.body.append(field); field.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } field.remove();
  }
  clearTimeout(button._timer);
  label.textContent = ok ? t('Copied') : t('Copy failed. Select the address and copy it by hand.');
  status.textContent = ok ? t('Copied') : '';
  button.classList.toggle('done', ok);
  button._timer = setTimeout(() => { label.textContent = t('Copy fingerprint'); status.textContent = ''; button.classList.remove('done'); }, 2200);
 });
})();
