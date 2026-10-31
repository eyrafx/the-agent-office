/**
 * The office's manager, chosen where it sits: a click on the big desk (or its name plate), a chat
 * dropped on that desk, or "Change manager" on the manager's card opens this small list. "Automatic"
 * (the default) lets the office find its manager: the chat running helper agents, a title like
 * "Yönetici" / "Manager" first. A chat picked here keeps the desk; "No manager" makes the middle
 * desk an ordinary one. Only that office's choice changes.
 */
import type { Translate } from '../i18n';
import { autoManager, type ManagerSource, type Person, type ProjectOffice } from '../shared/people';
import { escapeHtml as e } from './state';
import type { Rect } from '../office/scene';
import './manager-picker.css';

/** What a choice writes for an office: a chat's id, '' (no manager) or null (automatic: no entry). */
export type ManagerValue = string | null;
const MAX_CHOICES = 30;

export function createManagerPicker(host: HTMLElement, o: { l: () => Translate; name: (p: Person) => string; color: (p: Person) => string; set: (office: string, value: ManagerValue) => Promise<void> }) {
  const box = document.createElement('div');
  box.className = 'manager-picker'; box.hidden = true; box.setAttribute('role', 'dialog');
  host.append(box);
  let office: ProjectOffice | undefined, busy = false;
  const close = () => { office = undefined; box.hidden = true; box.innerHTML = ''; };
  function open(next: ProjectOffice, choice: { person?: Person; source: ManagerSource }, explicit: boolean, at?: Rect) {
    office = next;
    const l = o.l(), auto = autoManager(next), mains = next.people.filter(p => !p.session.parentKey && p.state !== 'ended')
      .sort((a, b) => Number(b === choice.person) - Number(a === choice.person) || b.session.lastActivity - a.session.lastActivity).slice(0, MAX_CHOICES);
    const on = (x: boolean) => x ? ' on' : '';
    const pickedHand = explicit && choice.source === 'chosen';
    box.setAttribute('aria-label', l('office.manager_picker_title'));
    box.innerHTML = `<header><b>${e(l('office.manager_picker_title'))}</b><button class="mp-close" data-mp-close aria-label="${e(l('office.close'))}">×</button></header>`
      + `<button class="mp-row mp-auto${on(!explicit)}" data-mp-auto ${busy ? 'disabled' : ''}><span class="mp-radio"></span><span><b>${e(l('office.manager_auto'))}${auto ? ` · ${e(o.name(auto))}` : ''}</b><small>${e(l('office.manager_auto_hint'))}</small></span></button>`
      + `<div class="mp-list">${mains.map(p => `<button class="mp-row${on(pickedHand && p === choice.person)}" data-mp-chat="${e(p.session.key.sessionId)}" ${busy ? 'disabled' : ''}><span class="mp-radio"></span><i class="mp-dot" style="background:${o.color(p)}"></i><span class="mp-name">${e(o.name(p))}</span></button>`).join('')}</div>`
      + `<button class="mp-row mp-none${on(explicit && choice.source === 'none')}" data-mp-none ${busy ? 'disabled' : ''}><span class="mp-radio"></span><span>${e(l('office.no_manager'))}</span></button>`;
    box.hidden = false;
    // Beside the desk, kept inside the window.
    const w = box.offsetWidth || 300, h = box.offsetHeight || 320;
    const x = at ? at.x + at.w / 2 - w / 2 : innerWidth / 2 - w / 2, y = at ? at.y + at.h + 8 : innerHeight / 2 - h / 2;
    box.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x))}px`;
    box.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, y + h > innerHeight - 8 && at ? at.y - h - 8 : y))}px`;
  }
  box.addEventListener('click', event => {
    const b = (event.target as Element).closest('button'); if (!b || b.disabled || !office) return;
    if (b.hasAttribute('data-mp-close')) { close(); return; }
    const value: ManagerValue | undefined = b.hasAttribute('data-mp-auto') ? null : b.hasAttribute('data-mp-none') ? '' : b.dataset.mpChat;
    if (value === undefined) return;
    busy = true; const key = office.key;
    void o.set(key, value).then(close, () => close()).finally(() => { busy = false; });
  });
  const outside = (event: PointerEvent) => { if (!box.hidden && !box.contains(event.target as Node)) close(); };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !box.hidden) { event.stopPropagation(); close(); } };
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('keydown', escape, true);
  return {
    open,
    close,
    get isOpen() { return !box.hidden; },
    dispose() { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', escape, true); box.remove(); },
  };
}
