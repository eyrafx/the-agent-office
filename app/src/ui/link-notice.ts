/**
 * A line under the office's header about the Claude Code connection, only when there is something
 * to do: Claude Code is here but not connected (installed after the first start, or skipped then):
 * "Connect", which the user may dismiss for good; the connection is broken: what is wrong and one
 * "Repair the connection"; Claude Code's settings cannot be read: said, nothing touched. Looked at
 * again every half minute while the office is seen, and when its window comes back. Codex needs
 * nothing here: its records are read as soon as they are there.
 */
import type { Translate } from '../i18n';
import type { Bridge, ToolsState } from '../shared/contract';
import { escapeHtml as e } from './state';
import { connectError } from './first-run';

const EVERY_MS = 30_000, DISMISSED = 'agentoffice-link-offer-dismissed';
type Kind = 'offer' | 'broken' | 'unreadable';
/** What the line says for a state (null: nothing to say). */
export function noticeOf(state: ToolsState | null, setupDone: boolean, dismissed: boolean): Kind | null {
  if (!state || !setupDone || !state.tools.claude) return null;
  if (state.claude.state === 'broken') return 'broken';
  if (state.claude.state === 'unreadable') return 'unreadable';
  if (state.claude.state === 'off' && !dismissed) return 'offer';
  return null;
}

export function mountLinkNotice(host: HTMLElement, before: Element | null, bridge: Bridge, o: { l: () => Translate; setupDone: () => boolean; seen: () => boolean; toast: (text: string) => void }) {
  const box = document.createElement('div');
  box.className = 'link-notice'; box.setAttribute('role', 'status'); box.hidden = true;
  host.insertBefore(box, before);
  let state: ToolsState | null = null, busy = false;
  const dismissed = () => { try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; } };
  const render = () => {
    const l = o.l(), kind = noticeOf(state, o.setupDone(), dismissed());
    box.hidden = !kind; box.dataset.kind = kind ?? '';
    if (!kind) { box.innerHTML = ''; return; }
    const reason = state!.claude.reason ?? 'partial';
    const text = kind === 'offer' ? l('link.offer') : kind === 'unreadable' ? l('link.unreadable')
      : reason === 'helper_missing' ? l('link.broken_helper_missing') : reason === 'old_path' ? l('link.broken_old_path') : l('link.broken_partial');
    box.innerHTML = `<span class="ln-text">${e(text)}</span>${kind === 'unreadable' ? '' : `<button class="ln-act" data-ln-act ${busy ? 'disabled' : ''}>${e(busy ? l('setup.connecting') : kind === 'offer' ? l('link.connect') : l('link.repair'))}</button>`}${kind === 'offer' ? `<button class="ln-close" data-ln-dismiss aria-label="${e(l('link.dismiss'))}" title="${e(l('link.dismiss'))}">×</button>` : ''}`;
  };
  const look = async () => { if (busy) return; try { state = await bridge.toolsState(); render(); } catch { /* Looked again later. */ } };
  box.addEventListener('click', event => {
    const b = (event.target as Element).closest('button'); if (!b || b.disabled) return;
    if (b.hasAttribute('data-ln-dismiss')) { try { localStorage.setItem(DISMISSED, '1'); } catch { /* Shown again next time. */ } render(); return; }
    if (b.hasAttribute('data-ln-act')) {
      const was = box.dataset.kind; busy = true; render();
      void bridge.connectTools().then(next => { state = next; o.toast(o.l()(was === 'offer' ? 'link.connected' : 'link.repaired')); })
        .catch(err => o.toast(connectError(err, o.l()))).finally(() => { busy = false; render(); });
    }
  });
  void look();
  const timer = setInterval(() => { if (o.seen()) void look(); }, EVERY_MS);
  const focus = () => void look();
  window.addEventListener('focus', focus);
  return { refresh: look, relabel: render, dispose() { clearInterval(timer); window.removeEventListener('focus', focus); box.remove(); } };
}
