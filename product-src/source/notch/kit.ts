import { number } from '../i18n';
import { escapeHtml as e } from '../ui/state';
import { icon } from '../ui/icons';

/**
 * The parts the island's own pages share (notes, alarms, water, shelf), so they read as one
 * product: tabs, one main action, a quiet second action, an empty state that shows what the page
 * is for, an "i" that keeps the fine print at hand without covering the page, and the height a
 * page really needs (the island grows and shrinks with it, so a short page never scrolls).
 */

/** Tabs inside a page (role tablist); `count` is shown only when there is something to count. */
export const tabs = (label: string, items: { id: string; text: string; count?: number; on: boolean }[], attr = 'data-tab') =>
  `<div class="pg-tabs" role="tablist" aria-label="${e(label)}">${items.map(t => `<button type="button" role="tab" ${attr}="${e(t.id)}" aria-selected="${t.on}">${e(t.text)}${t.count ? `<em>${t.count}</em>` : ''}</button>`).join('')}</div>`;

/** The page's one main action (white), and a quieter one beside it. */
export const primary = (cls: string, text: string, ic?: string, extra = '') => `<button type="button" class="pg-primary ${cls}" ${extra}>${ic ? icon(ic, 15) : ''}<span>${e(text)}</span></button>`;
export const quiet = (cls: string, text: string, ic?: string, extra = '') => `<button type="button" class="pg-quiet ${cls}" ${extra}>${ic ? icon(ic, 14) : ''}<span>${e(text)}</span></button>`;
/** A small icon button whose purpose is said (tooltip and screen reader). */
export const iconButton = (cls: string, ic: string, label: string, extra = '') => `<button type="button" class="pg-icon ${cls}" title="${e(label)}" aria-label="${e(label)}" ${extra}>${icon(ic, 15)}</button>`;

/** An empty page: a small picture, what it is for, and what to do (actions given as HTML). */
export const emptyState = (o: { ic: string; tone?: string; title: string; text: string; actions?: string; extra?: string }) =>
  `<div class="pg-empty"${o.tone ? ` style="--tone:${o.tone}"` : ''}><span class="pg-art">${icon(o.ic, 22)}</span><div class="pg-empty-text"><b>${e(o.title)}</b><span>${e(o.text)}</span>${o.actions ? `<div class="pg-empty-actions">${o.actions}</div>` : ''}</div>${o.extra ?? ''}</div>`;

/** The fine print behind an "i": a button that shows or hides it in place (not a tooltip, so it
 *  can be read in full and reached from the keyboard). */
export const info = (label: string, text: string) =>
  `<span class="pg-info"><button type="button" class="pg-info-btn" aria-expanded="false" title="${e(label)}" aria-label="${e(label)}">${icon('info', 15)}</button><span class="pg-info-text" role="note" hidden>${e(text)}</span></span>`;
/** Wires every "i" in `root`: a click opens or closes it, Escape or a click elsewhere closes it. */
export function wireInfo(root: HTMLElement, changed: () => void) {
  const close = (except?: Element) => root.querySelectorAll<HTMLElement>('.pg-info').forEach(x => { if (x === except) return; const t = x.querySelector<HTMLElement>('.pg-info-text')!; if (!t.hidden) { t.hidden = true; x.querySelector('.pg-info-btn')!.setAttribute('aria-expanded', 'false'); changed(); } });
  const click = (ev: MouseEvent) => {
    const b = (ev.target as Element).closest('.pg-info-btn'), box = b?.closest<HTMLElement>('.pg-info');
    if (!box) { if (!(ev.target as Element).closest('.pg-info-text')) close(); return; }
    close(box); const t = box.querySelector<HTMLElement>('.pg-info-text')!; t.hidden = !t.hidden; b!.setAttribute('aria-expanded', String(!t.hidden)); changed();
  };
  const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && root.querySelector('.pg-info-text:not([hidden])')) { ev.stopPropagation(); close(); } };
  root.addEventListener('click', click); root.addEventListener('keydown', key);
  return () => { root.removeEventListener('click', click); root.removeEventListener('keydown', key); };
}

/** The island's header above a page and the space kept under it (CSS px). */
const HEAD = 50, FOOT = 12;
/** The height a page needs for what it shows now: each shown part at its natural height (a list
 *  counts all its lines, so it scrolls only when the island cannot grow further). */
export function pageNeeds(box: HTMLElement): number {
  const cs = getComputedStyle(box), gap = parseFloat(cs.rowGap) || 0;
  let h = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0), n = 0;
  for (const c of Array.from(box.children) as HTMLElement[]) {
    const s = getComputedStyle(c);
    if (c.hidden || s.display === 'none' || s.position === 'absolute') continue;
    h += Math.max(c.offsetHeight, c.scrollHeight) + (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0); n++;
  }
  return Math.ceil(HEAD + h + gap * Math.max(0, n - 1) + FOOT);
}
/** Calls `changed` when the page's width changes (its lines wrap differently then). */
export function watchWidth(el: HTMLElement, changed: () => void) {
  let w = 0; const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; changed(); } }); ro.observe(el);
  return () => ro.disconnect();
}

/** "1,25 L" or "750 ml". */
export const volume = (ml: number) => ml >= 1000 ? number(ml / 1000, { style: 'unit', unit: 'liter', maximumFractionDigits: 2 }) : number(Math.round(ml), { style: 'unit', unit: 'milliliter' });
