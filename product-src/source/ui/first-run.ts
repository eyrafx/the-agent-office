/**
 * The first start: one screen over the office. It says which supported tools are on this computer
 * (a tool not found is said so, never shown as found), what connecting does in a few plain lines,
 * and offers one step: "Connect the tools and start". The app does the rest (the helper in its
 * place, Claude Code's entries; Codex is only read). Nothing is approved for the user, ever. A
 * tool installed while the screen is open appears on it. "Continue without connecting" leaves
 * everything as it is; Settings can connect later.
 */
import type { Translate } from '../i18n';
import type { Bridge, ToolsState } from '../shared/contract';
import { escapeHtml as e } from './state';
import { icon } from './icons';

const LOOK_MS = 4000;
/** The connection's error as the user reads it (the app's codes; anything else as it came). */
export function connectError(error: unknown, l: Translate): string {
  const code = String(error instanceof Error ? error.message : error);
  if (code.includes('unreadable')) return l('setup.error_unreadable');
  if (code.includes('helper_not_bundled') || code.includes('no_local_folder')) return l('setup.error_helper');
  return l('setup.error_other', { detail: code });
}

export function mountFirstRun(host: HTMLElement, bridge: Bridge, o: { l: () => Translate; done: () => void }) {
  const box = document.createElement('section');
  box.className = 'first-run'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'first-run-title');
  host.append(box);
  let state: ToolsState | null = null, busy = false, error = '', disposed = false;
  const row = (found: boolean, name: string) => `<li class="fr-tool ${found ? 'found' : 'missing'}"><span class="fr-mark" aria-hidden="true">${found ? icon('check', 16) : '–'}</span><span><b>${e(name)}</b> ${e(found ? o.l()('setup.found') : o.l()('setup.not_found'))}</span></li>`;
  const render = () => {
    const l = o.l(), t = state?.tools, any = !!t && (t.claude || t.codex);
    box.innerHTML = `<div class="fr-card">
      <h1 id="first-run-title">${e(l('setup.welcome'))}</h1>
      <p class="fr-lead">${e(l('setup.lead'))}</p>
      <ul class="fr-tools" aria-live="polite">${t ? row(t.claude, 'Claude Code') + row(t.codex, 'Codex') : `<li class="fr-tool">${e(l('setup.looking'))}</li>`}</ul>
      ${t && !any ? `<p class="fr-note">${e(l('setup.none_found'))}</p>` : ''}
      ${any ? `<ul class="fr-what">${t!.claude ? `<li>${e(l('setup.what_claude'))}</li>` : ''}${t!.codex ? `<li>${e(l('setup.what_codex'))}</li>` : ''}<li>${e(l('setup.what_never'))}</li></ul>` : ''}
      ${error ? `<p class="fr-error" role="alert">${e(error)}</p>` : ''}
      <div class="fr-actions">
        <button class="primary-button fr-go" data-fr-go ${busy || !t ? 'disabled' : ''}>${e(busy ? l('setup.connecting') : any ? l('setup.connect_and_start') : l('setup.start'))}</button>
        ${any ? `<button class="fr-skip" data-fr-skip ${busy ? 'disabled' : ''}>${e(l('setup.skip'))}</button>` : ''}
      </div>
      <p class="fr-later">${e(l('setup.later'))}</p>
    </div>`;
  };
  const look = async () => { try { const next = await bridge.toolsState(); if (!disposed && !busy && JSON.stringify(next) !== JSON.stringify(state)) { state = next; render(); } } catch { /* Looked again in a moment. */ } };
  const finish = async (connect: boolean) => {
    busy = true; error = ''; render();
    try {
      if (connect && (state?.tools.claude || state?.tools.codex)) state = await bridge.connectTools();
      else await bridge.setSettings({ setupDone: true });
      if (!disposed) { dispose(); o.done(); }
    } catch (err) { busy = false; error = connectError(err, o.l()); render(); }
  };
  box.addEventListener('click', event => {
    const b = (event.target as Element).closest('button');
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-fr-go')) void finish(true);
    else if (b.hasAttribute('data-fr-skip')) void finish(false);
  });
  render(); void look();
  // A tool installed while this screen is open appears on it.
  const timer = setInterval(() => void look(), LOOK_MS);
  queueMicrotask(() => box.querySelector<HTMLElement>('[data-fr-go]')?.focus());
  function dispose() { disposed = true; clearInterval(timer); box.remove(); }
  return { dispose, relabel: render };
}
