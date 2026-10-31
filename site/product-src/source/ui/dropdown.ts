/**
 * One dropdown for the whole app, in place of the system's list (a plain Windows list that did
 * not belong to the glass). The page's own <select> stays the source of truth: its value, its
 * options, `disabled`, and the `input`/`change` events code listens to are exactly as before; it
 * is only hidden. Beside it a button (a select-only combobox, as in the ARIA practices) shows the
 * choice; its list opens in the top layer (never clipped by a scrolling box), inside the island's
 * own shape when it is on the island (the window shows nothing outside that shape) and inside the
 * window otherwise, below the button or above it when there is more room there.
 *
 * Keys, as a native list: Enter, Space, Alt+Down or the arrows open it; the arrows, Home, End,
 * PageUp and PageDown move; letters jump to an item; Enter or Space picks; Escape closes without
 * a change; Tab picks the highlighted item and moves on. Focus stays on the button throughout.
 */

const CHEVRON = '<svg class="dd-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg class="dd-check" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.2 5.8 10 11 4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MARGIN = 8, GAP = 4;
const valueOf = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!;
const indexOf = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex')!;

interface Open { select: HTMLSelectElement; trigger: HTMLButtonElement; active: number; typed: string; typedAt: number }
let open: Open | null = null, pop: HTMLDivElement | null = null, counter = 0;
const triggers = new WeakMap<HTMLSelectElement, HTMLButtonElement>();

/** Whether a dropdown's list is open now (the island stays open meanwhile, as for a menu). */
export const dropdownOpen = () => !!open;

/** Every <select> in the page becomes a dropdown, also those a page adds later. */
export function watchSelects(root: ParentNode & Node = document.body): () => void {
  root.querySelectorAll('select').forEach(enhance);
  const watch = new MutationObserver(changes => { for (const c of changes) c.addedNodes.forEach(n => { if (n instanceof HTMLSelectElement) enhance(n); else if (n instanceof Element) n.querySelectorAll('select').forEach(enhance); }); });
  watch.observe(root, { childList: true, subtree: true });
  return () => watch.disconnect();
}

function enhance(select: HTMLSelectElement) {
  if (triggers.has(select) || select.multiple) return;
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'dd-trigger';
  trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `<span class="dd-value"></span>${CHEVRON}`;
  // Its name: the select's own label, else its aria-label.
  const label = select.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(select.id)}"]`) : null;
  if (label) { label.id ||= `dd-label-${++counter}`; trigger.setAttribute('aria-labelledby', label.id); label.addEventListener('click', event => { event.preventDefault(); if (!trigger.disabled) trigger.focus(); }); }
  else if (select.getAttribute('aria-label')) trigger.setAttribute('aria-label', select.getAttribute('aria-label')!);
  select.classList.add('dd-native'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
  select.after(trigger); triggers.set(select, trigger);
  const sync = () => {
    const option = select.selectedOptions[0];
    const value = trigger.querySelector<HTMLElement>('.dd-value')!;
    value.textContent = option?.textContent ?? '';
    if (option?.lang) value.lang = option.lang; else value.removeAttribute('lang');
    trigger.disabled = select.disabled; trigger.hidden = select.hidden; trigger.title = option?.textContent ?? '';
    if (open?.select === select) fill();
  };
  // Code sets the value or the selected item directly (no event): the button follows.
  Object.defineProperty(select, 'value', { configurable: true, get() { return valueOf.get!.call(this); }, set(v) { valueOf.set!.call(this, v); sync(); } });
  Object.defineProperty(select, 'selectedIndex', { configurable: true, get() { return indexOf.get!.call(this); }, set(v) { indexOf.set!.call(this, v); sync(); } });
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
  select.addEventListener('change', sync); select.addEventListener('focus', () => trigger.focus());
  trigger.addEventListener('click', () => (open?.select === select ? close() : show(select)));
  trigger.addEventListener('keydown', event => keys(select, event));
  // Focus moved elsewhere in the page (the window losing focus is the window's business, below).
  trigger.addEventListener('blur', () => { if (open?.select === select && document.hasFocus()) close(); });
  sync();
}

const options = (select: HTMLSelectElement) => [...select.options];
const usable = (select: HTMLSelectElement, i: number) => !!select.options[i] && !select.options[i].disabled;

function show(select: HTMLSelectElement) {
  const trigger = triggers.get(select)!;
  if (trigger.disabled) return;
  close();
  pop ||= createPop();
  open = { select, trigger, active: Math.max(0, select.selectedIndex), typed: '', typedAt: 0 };
  trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-controls', pop.id);
  pop.classList.toggle('dd-calm', !!trigger.closest('.reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches);
  fill(); pop.showPopover(); place();
  requestAnimationFrame(() => pop?.classList.add('dd-in'));
  setTimeout(() => { addEventListener('pointerdown', outside, true); addEventListener('resize', away); addEventListener('blur', away); addEventListener('scroll', scrolled, true); });
}

function close() {
  if (!open || !pop) return;
  open.trigger.setAttribute('aria-expanded', 'false'); open.trigger.removeAttribute('aria-activedescendant'); open.trigger.removeAttribute('aria-controls');
  open = null; pop.classList.remove('dd-in'); pop.hidePopover();
  removeEventListener('pointerdown', outside, true); removeEventListener('resize', away); removeEventListener('blur', away); removeEventListener('scroll', scrolled, true);
}

function createPop(): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'dd-list'; el.className = 'dd-pop'; el.setAttribute('popover', 'manual'); el.setAttribute('role', 'listbox');
  // The button keeps focus: a press in the list must not take it away.
  el.addEventListener('pointerdown', event => event.preventDefault());
  el.addEventListener('click', event => { const o = (event.target as Element).closest<HTMLElement>('[data-i]'); if (o && open) pick(Number(o.dataset.i)); });
  el.addEventListener('pointermove', event => { const o = (event.target as Element).closest<HTMLElement>('[data-i]'); if (o && open && Number(o.dataset.i) !== open.active) highlight(Number(o.dataset.i), false); });
  document.body.append(el);
  return el;
}

function fill() {
  if (!open || !pop) return;
  const { select } = open, current = select.selectedIndex;
  const label = open.trigger.getAttribute('aria-labelledby'); if (label) pop.setAttribute('aria-labelledby', label); else pop.removeAttribute('aria-labelledby');
  pop.innerHTML = options(select).map((o, i) => `<div class="dd-opt${i === current ? ' on' : ''}${o.disabled ? ' off' : ''}" role="option" id="dd-opt-${i}" data-i="${i}" aria-selected="${i === current}"${o.disabled ? ' aria-disabled="true"' : ''}${o.lang ? ` lang="${o.lang}"` : ''}>${CHECK}<span></span></div>`).join('');
  pop.querySelectorAll<HTMLElement>('.dd-opt span').forEach((s, i) => { s.textContent = select.options[i].textContent; });
  highlight(open.active, true);
}

function highlight(i: number, scroll: boolean) {
  if (!open || !pop) return;
  open.active = i;
  pop.querySelectorAll('.dd-opt.active').forEach(x => x.classList.remove('active'));
  const el = pop.querySelector<HTMLElement>(`#dd-opt-${i}`);
  if (!el) return;
  el.classList.add('active'); open.trigger.setAttribute('aria-activedescendant', el.id);
  if (scroll) el.scrollIntoView({ block: 'nearest' });
}

/** Where the list may be drawn: the island's own shape when the button is on the island. */
function bounds(trigger: HTMLElement): DOMRect {
  const island = trigger.closest('.island-shape');
  return island ? island.getBoundingClientRect() : new DOMRect(0, 0, innerWidth, innerHeight);
}

function place() {
  if (!open || !pop) return;
  const t = open.trigger.getBoundingClientRect(), b = bounds(open.trigger);
  // Sized like the button's surroundings (the island scales with the user's size setting).
  const zoom = t.width / (open.trigger.offsetWidth || t.width) || 1;
  pop.style.zoom = String(zoom);
  pop.style.minWidth = `${t.width / zoom}px`; pop.style.maxWidth = `${(b.width - 2 * MARGIN) / zoom}px`; pop.style.maxHeight = 'none';
  const natural = pop.getBoundingClientRect();
  const below = b.bottom - MARGIN - (t.bottom + GAP), above = t.top - GAP - (b.top + MARGIN);
  const down = natural.height <= below || below >= above;
  const room = Math.max(60, down ? below : above), height = Math.min(natural.height, room);
  pop.style.maxHeight = `${room / zoom}px`;
  // Measured again once its height is set: a list that now scrolls is a scrollbar wider.
  const width = pop.getBoundingClientRect().width;
  const left = Math.min(Math.max(t.left, b.left + MARGIN), b.right - MARGIN - width);
  pop.style.left = `${left / zoom}px`;
  pop.style.top = `${(down ? t.bottom + GAP : t.top - GAP - height) / zoom}px`;
  pop.classList.toggle('dd-up', !down);
  pop.querySelector('.dd-opt.active')?.scrollIntoView({ block: 'nearest' });
}

function pick(i: number) {
  if (!open || !usable(open.select, i)) return;
  const { select, trigger } = open;
  close();
  if (select.selectedIndex !== i) {
    indexOf.set!.call(select, i);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  trigger.focus();
}

function step(select: HTMLSelectElement, from: number, by: number): number {
  const n = select.options.length;
  for (let i = from + by; i >= 0 && i < n; i += by) if (usable(select, i)) return i;
  return from;
}

function keys(select: HTMLSelectElement, event: KeyboardEvent) {
  const isOpen = open?.select === select;
  const k = event.key;
  if (!isOpen) {
    if (k === 'Enter' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp' || (k === 'ArrowDown' && event.altKey)) { event.preventDefault(); show(select); }
    return;
  }
  const o = open!;
  const last = step(select, select.options.length, -1), first = step(select, -1, 1);
  if (k === 'Escape' || (k === 'ArrowUp' && event.altKey)) { event.preventDefault(); event.stopPropagation(); close(); return; }
  if (k === 'Enter' || k === ' ') { event.preventDefault(); pick(o.active); return; }
  if (k === 'Tab') { pick(o.active); return; }
  // Eight items at a time for PageDown / PageUp, stopping at the ends (and on a usable item).
  const page = (by: number) => { const n = select.options.length; let i = Math.max(0, Math.min(n - 1, o.active + by)); if (!usable(select, i)) i = step(select, i, -Math.sign(by)); return usable(select, i) ? i : o.active; };
  const move = k === 'ArrowDown' ? step(select, o.active, 1) : k === 'ArrowUp' ? step(select, o.active, -1) : k === 'Home' ? first : k === 'End' ? last
    : k === 'PageDown' ? page(8) : k === 'PageUp' ? page(-8) : -1;
  if (move >= 0) { event.preventDefault(); highlight(move, true); return; }
  // Letters jump to the next item that starts with what was typed (in the item's language).
  if (k.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const now = performance.now(); o.typed = now - o.typedAt > 700 ? k : o.typed + k; o.typedAt = now;
    const want = o.typed.toLocaleLowerCase(), n = select.options.length;
    for (let j = 0; j < n; j++) {
      const i = (o.active + (o.typed.length > 1 ? 0 : 1) + j) % n;
      if (usable(select, i) && (select.options[i].textContent ?? '').trim().toLocaleLowerCase(select.options[i].lang || undefined).startsWith(want)) { highlight(i, true); break; }
    }
    event.preventDefault();
  }
}

function outside(event: PointerEvent) {
  if (!open) return;
  const t = event.target as Node;
  if (pop?.contains(t) || open.trigger.contains(t)) return;
  close();
}
/** The window resized or lost focus: the list closes, as a system list does (a test photographing it may keep it). */
function away() { if (!(window as { __dropdown?: { keepOpen?: boolean } }).__dropdown?.keepOpen) close(); }
/** Something scrolled: the list closes only when that moved its button (a box around it, or the page). */
function scrolled(event: Event) { const t = event.target as Node; if (open && pop && !pop.contains(t) && (t === document || t.contains(open.trigger))) close(); }
