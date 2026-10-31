/**
 * A line under the office's header, once per office, the first time it has agents and no manager:
 * "Would you like to choose a manager?". Yes: the office's agents to pick from; the one picked sits
 * at the manager's desk in the middle of the office. No: no manager desk, and not asked again for
 * that office. Either can be changed later from an agent's card ("Choose as manager"). The demo
 * office is never asked about. Being the manager is not a priority: the island's top card stays
 * the request and the latest activity.
 */
import type { Translate } from '../i18n';
import type { Person, ProjectOffice } from '../shared/people';
import { escapeHtml as e } from './state';

const ASKED = 'agentoffice-manager-asked', MAX_CHOICES = 8;
const asked = (): string[] => { try { const v = JSON.parse(localStorage.getItem(ASKED) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const markAsked = (key: string) => { try { localStorage.setItem(ASKED, JSON.stringify([...new Set([...asked(), key])])); } catch { /* Asked again next time. */ } };

/** Whether an office is to be asked about now: it has agents (not helpers), no manager, not asked yet. */
export function wantsOffer(o: ProjectOffice | undefined, hasManager: boolean, live: boolean, setupDone: boolean, askedKeys: string[]): boolean {
  return !!o && live && setupDone && !hasManager && !askedKeys.includes(o.key) && o.people.some(p => !p.session.parentKey);
}

export function mountManagerOffer(host: HTMLElement, before: Element | null, o: { l: () => Translate; name: (p: Person) => string; officeName: (o: ProjectOffice) => string; choose: (office: string, chat: string) => Promise<void> }) {
  const box = document.createElement('div');
  box.className = 'link-notice manager-offer'; box.setAttribute('role', 'status'); box.hidden = true;
  host.insertBefore(box, before);
  let office: ProjectOffice | undefined, picking = false, busy = false;
  const render = () => {
    const l = o.l();
    box.hidden = !office; if (!office) { box.innerHTML = ''; return; }
    const mains = office.people.filter(p => !p.session.parentKey).slice(0, MAX_CHOICES);
    box.innerHTML = picking
      ? `<span class="ln-text">${e(l('manager.pick'))}</span><span class="mo-choices">${mains.map(p => `<button class="ln-act mo-pick" data-mo-pick="${e(p.session.key.sessionId)}" ${busy ? 'disabled' : ''}>${e(o.name(p))}</button>`).join('')}</span><button class="ln-close" data-mo-back aria-label="${e(l('manager.cancel'))}" title="${e(l('manager.cancel'))}">×</button>`
      : `<span class="ln-text">${e(l('manager.offer', { office: o.officeName(office) }))}</span><button class="ln-act" data-mo-yes>${e(l('manager.yes_choose'))}</button><button class="ln-act quiet" data-mo-no>${e(l('manager.no'))}</button>`;
  };
  box.addEventListener('click', event => {
    const b = (event.target as Element).closest('button'); if (!b || b.disabled || !office) return;
    const key = office.key;
    if (b.hasAttribute('data-mo-yes')) { picking = true; render(); }
    else if (b.hasAttribute('data-mo-back')) { picking = false; render(); }
    else if (b.hasAttribute('data-mo-no')) { markAsked(key); office = undefined; render(); }
    else if (b.dataset.moPick) {
      busy = true; render();
      void o.choose(key, b.dataset.moPick).then(() => { markAsked(key); office = undefined; picking = false; }).finally(() => { busy = false; render(); });
    }
  });
  return {
    /** The office to ask about now (or none); asked offices and offices with a manager are skipped by the caller. */
    show(next: ProjectOffice | undefined) { if (next?.key !== office?.key) picking = false; office = next; render(); },
    asked,
    relabel: render,
    dispose() { box.remove(); },
  };
}
