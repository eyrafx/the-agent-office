import { dateTime } from '../i18n';
import type { Translate } from '../i18n';
import type { Bridge } from '../shared/contract';
import { escapeHtml as e } from '../ui/state';
import { icon } from '../ui/icons';
import { pageNeeds, quiet, volume, watchWidth } from './kit';

/** The water record: the glass, the day's goal, the hours it reminds in and how often, and what was drunk. */
export interface WaterDoc { portion: number; goal: number; from: number; to: number; every: number; remind: boolean; log: { at: number; ml: number }[]; reminded?: number }
export const WATER_DEFAULTS: WaterDoc = { portion: 250, goal: 2000, from: 9, to: 22, every: 90, remind: false, log: [] };
const DAY_MS = 86_400_000;
/** The glass, drawn in a 60×84 box: the inside it holds water in (open at the top), and the
 *  inside wall's left edge at a height (the glass narrows a little towards its base). */
const CAVITY = 'M9.2 7 L13.4 69.4 Q13.6 72 16.2 72 H43.8 Q46.4 72 46.6 69.4 L50.8 7 Z', WATER_BOTTOM = 72, WATER_TOP = 10;
const innerLeft = (y: number) => 9.2 + (Math.min(y, 69.4) - 7) * (4.2 / 62.4);

/** A saved record as the page can trust it (known fields, sensible ranges, the last 14 days of drinks). */
export function cleanWater(raw: unknown, now = Date.now()): WaterDoc {
  const r = (raw ?? {}) as Partial<WaterDoc>, n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d; };
  const log = Array.isArray(r.log) ? r.log.filter(x => x && Number.isFinite(x.at) && Number.isFinite(x.ml) && x.ml > 0 && x.at > now - 14 * DAY_MS && x.at <= now + 60_000).map(x => ({ at: x.at, ml: Math.min(2000, Math.round(x.ml)) })).slice(-500) : [];
  return { portion: n(r.portion, 50, 1000, 250), goal: n(r.goal, 500, 6000, 2000), from: n(r.from, 0, 23, 9), to: n(r.to, 1, 24, 22), every: n(r.every, 15, 360, 90), remind: !!r.remind, log, reminded: Number(r.reminded) || 0 };
}
/** What was drunk on the local day of `now` (ml). */
export const drunkToday = (doc: WaterDoc, now = Date.now()) => { const day = new Date(now).toDateString(); return doc.log.filter(x => new Date(x.at).toDateString() === day).reduce((a, x) => a + x.ml, 0); };
/** Whether a reminder is due: on, within the hours chosen, the goal not reached, and nothing drunk (or reminded) for `every` minutes. */
export function reminderDue(doc: WaterDoc, now = Date.now()): boolean {
  if (!doc.remind) return false;
  const hour = new Date(now).getHours();
  if (hour < doc.from || hour >= doc.to || drunkToday(doc, now) >= doc.goal) return false;
  const start = new Date(now); start.setHours(doc.from, 0, 0, 0);
  const last = Math.max(start.getTime(), ...doc.log.map(x => x.at), doc.reminded ?? 0);
  return now - last >= doc.every * 60_000;
}
/** When the next reminder comes (ms), as `reminderDue` will find it; null while reminders are off.
 *  Past the day's hours, or with the goal reached, it is the next day's first one. */
export function nextReminder(doc: WaterDoc, now = Date.now()): number | null {
  if (!doc.remind) return null;
  const at = (dayOffset: number, hour: number) => { const d = new Date(now); d.setDate(d.getDate() + dayOffset); d.setHours(hour, 0, 0, 0); return d.getTime(); };
  const tomorrow = at(1, doc.from) + doc.every * 60_000;
  if (drunkToday(doc, now) >= doc.goal) return tomorrow;
  const start = at(0, doc.from), end = at(0, doc.to);
  const next = Math.max(start, ...doc.log.map(x => x.at), doc.reminded ?? 0) + doc.every * 60_000;
  if (next >= end) return tomorrow;
  return Math.max(next, Math.min(now, end));
}

/**
 * Water tracking: what was drunk today against the day's goal, shown as a glass that fills, with
 * the total, the goal and what is left. One press records a glass ("Bir bardak içtim", its size
 * beside it); the last one can be taken back. The glass and the goal are changed right there. The
 * line below shows today's real drinks hour by hour (nothing drawn while nothing was drunk). It
 * can remind, only within the hours chosen and until the goal is reached; the page says whether
 * that is on and when the next one comes. The reminder opens the island here and sounds as the
 * user chose for reminders. Kept on this computer.
 */
export function createWaterPage(el: HTMLElement, bridge: Bridge, o: { l: Translate; report: (text: string) => void; changed: () => void; resized?: () => void }) {
  const { l } = o;
  let doc: WaterDoc = { ...WATER_DEFAULTS }, loaded = false, setup = false, draft: WaterDoc = { ...WATER_DEFAULTS };
  const timeOf = (t: number) => dateTime({ hour: '2-digit', minute: '2-digit' }).format(t);
  el.innerHTML = `<div class="pg water-page"><div class="water-top">`
    + `<div class="w-glass" aria-hidden="true"><svg viewBox="0 0 60 84" shape-rendering="geometricPrecision"><defs>`
    + `<linearGradient id="w-body-g" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".11"/><stop offset=".45" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity=".07"/></linearGradient>`
    + `<linearGradient id="w-water-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd8ff"/><stop offset="1" stop-color="#2d84d4"/></linearGradient>`
    + `<clipPath id="w-cavity"><path d="${CAVITY}"/></clipPath></defs>`
    + `<path class="w-body" d="M7 5 L11.8 76.2 Q12 79 14.8 79 H45.2 Q48 79 48.2 76.2 L53 5 Z"/><path class="w-base" d="M13.6 72 H46.4 L46.2 76 Q46 77.4 44.6 77.4 H15.4 Q14 77.4 13.8 76 Z"/>`
    + `<g clip-path="url(#w-cavity)"><rect class="w-water" x="0" y="84" width="60" height="84"/><ellipse class="w-surface" cx="30" cy="84" rx="0" ry="1.5"/></g>`
    + `<path class="w-shine" d="M11.4 10 L14.4 63"/><path class="w-shine soft" d="M15.6 10 L16.3 21"/><path class="w-shine faint" d="M48.8 12 L46.4 58"/>`
    + `<path class="w-edge" d="M7 5 L11.8 76.2 Q12 79 14.8 79 H45.2 Q48 79 48.2 76.2 L53 5"/><ellipse class="w-edge" cx="30" cy="5" rx="23" ry="1.6"/></svg></div>`
    + `<div class="w-info"><span class="w-label"></span><span class="w-amount"><b></b><small></small></span><span class="w-left"></span>`
    + `<div class="w-actions"><button type="button" class="pg-primary w-drink"></button><button type="button" class="pg-quiet w-undo"></button></div></div></div>`
    + `<div class="w-chips" role="group" aria-label="${e(l('water.settings'))}"><button type="button" class="pg-chip w-set" data-set="portion"></button><button type="button" class="pg-chip w-set" data-set="goal"></button><button type="button" class="pg-chip w-set w-remind" data-set="remind"></button></div>`
    + `<div class="w-day" aria-label="${e(l('water.today_by_the_hour'))}"></div>`
    + `<form class="water-setup pg-card" data-noswipe hidden><b class="ws-head">${e(l('water.water_settings'))}</b>`
    + `<div class="ws-row"><span>${e(l('water.one_glass'))}</span><span class="pg-stepper"><button type="button" data-adj="portion:-50" aria-label="${e(l('water.smaller_glass'))}">−</button><output class="ws-portion"></output><button type="button" data-adj="portion:50" aria-label="${e(l('water.bigger_glass'))}">+</button></span></div>`
    + `<div class="ws-row"><span>${e(l('water.daily_goal'))}</span><span class="pg-stepper"><button type="button" data-adj="goal:-250" aria-label="${e(l('water.lower_goal'))}">−</button><output class="ws-goal"></output><button type="button" data-adj="goal:250" aria-label="${e(l('water.raise_goal'))}">+</button></span></div>`
    + `<div class="ws-row"><label class="ws-on"><input type="checkbox" class="pg-switch"><span>${e(l('water.remind_me_to_drink'))}</span></label><span class="ws-when"><select class="ws-every" aria-label="${e(l('water.how_often'))}">${[30, 45, 60, 90, 120, 180].map(m => `<option value="${m}">${e(m < 60 ? l('water.every_min', { m }) : l('water.every_hours', { n: m / 60 }))}</option>`).join('')}</select><select class="ws-from" aria-label="${e(l('water.from'))}">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`).join('')}</select>–<select class="ws-to" aria-label="${e(l('water.until'))}">${Array.from({ length: 24 }, (_, h) => `<option value="${h + 1}">${String(h + 1).padStart(2, '0')}:00</option>`).join('')}</select></span></div>`
    + `<div class="ws-foot"><small>${e(l('water.reminders_come_only_in_these'))}</small>${quiet('ws-cancel', l('water.cancel'))}<button type="submit" class="pg-primary">${icon('check', 15)}<span>${e(l('water.save'))}</span></button></div></form></div>`;
  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const root = q('.water-page');
  const save = (next: WaterDoc) => { const before = doc; doc = next; render(); o.changed(); void bridge.saveDoc('water', next).catch(err => { doc = before; render(); o.report(String(err)); }); };
  const today = (now = Date.now()) => { const day = new Date(now).toDateString(); return doc.log.filter(x => new Date(x.at).toDateString() === day); };
  function render() {
    const now = Date.now(), drunk = drunkToday(doc, now), share = Math.min(1, drunk / doc.goal), list = today(now), last = list.at(-1);
    root.classList.toggle('is-setup', setup); root.classList.toggle('is-empty', !list.length);
    q('.water-setup').hidden = !setup;
    // The glass fills with the day's share; the wave shows only while there is water.
    // The water stands as high in the glass as the share drunk; its surface spans the glass there.
    const level = share > 0 ? WATER_BOTTOM - (WATER_BOTTOM - WATER_TOP) * share : 84;
    q<SVGRectElement>('.w-water').setAttribute('y', level.toFixed(2));
    const surface = q<SVGEllipseElement>('.w-surface'); surface.setAttribute('cy', level.toFixed(2)); surface.setAttribute('rx', (30 - innerLeft(level)).toFixed(2)); surface.style.display = share > 0 ? '' : 'none';
    q('.w-glass').dataset.level = String(Math.round(share * 100));
    q('.w-label').textContent = list.length ? l('water.water_drunk_today') : l('water.record_the_water_you_drink');
    q('.w-amount b').textContent = volume(drunk); q('.w-amount small').textContent = ` / ${volume(doc.goal)}`;
    q('.w-left').textContent = drunk >= doc.goal ? l('water.daily_goal_reached') : l('water.to_go', { volume: volume(doc.goal - drunk), round: Math.round(share * 100) });
    q('.w-left').classList.toggle('done', drunk >= doc.goal);
    q('.w-drink').innerHTML = `${icon('glass', 15)}<span>${e(l('water.i_drank_a_glass'))}</span><em>${e(`${doc.portion} ml`)}</em>`;
    const undo = q<HTMLButtonElement>('.w-undo'); undo.hidden = !last;
    if (last) { undo.innerHTML = `${icon('reset', 14)}<span>${e(l('water.undo'))}</span>`; undo.title = l('water.remove_the_last_one_ml', { ml: last.ml, timeOf: timeOf(last.at) }); undo.setAttribute('aria-label', undo.title); }
    q('[data-set=portion]').innerHTML = `${icon('glass', 13)}<span>${e(l('water.glass_ml', { portion: doc.portion }))}</span>`;
    q('[data-set=goal]').innerHTML = `${icon('target', 13)}<span>${e(l('water.goal', { volume: volume(doc.goal) }))}</span>`;
    const next = nextReminder(doc, now);
    q('[data-set=remind]').innerHTML = `${icon('bell', 13)}<span>${e(next === null ? l('water.reminders_off') : new Date(next).toDateString() === new Date(now).toDateString() ? l('water.next_reminder', { timeOf: timeOf(next) }) : l('water.reminder_tomorrow', { timeOf: timeOf(next) }))}</span>`;
    q('[data-set=remind]').classList.toggle('off', next === null);
    el.querySelectorAll<HTMLElement>('.w-set').forEach(b => b.title = l('water.change'));
    // Today's real drinks by hour, across the hours chosen (and any drink outside them).
    const seen = list.map(x => new Date(x.at).getHours()), first = Math.min(doc.from, ...seen), end = Math.max(doc.to, doc.from + 1, ...seen.map(h => h + 1));
    const span = Array.from({ length: end - first }, (_, i) => first + i), per = span.map(h => list.filter(x => new Date(x.at).getHours() === h).reduce((a, x) => a + x.ml, 0)), top = Math.max(doc.portion, ...per), hourNow = new Date(now).getHours();
    const day = list.length
      ? `<div class="w-bars">${span.map((h, i) => `<span class="w-hour${h === hourNow ? ' now' : ''}" title="${String(h).padStart(2, '0')}:00 · ${per[i] ? `${per[i]} ml` : l('water.nothing')}">${per[i] ? `<em>${per[i]}</em><i style="--h:${Math.round(per[i] / top * 100)}%"></i>` : ''}</span>`).join('')}</div><div class="w-hours">${span.map((h, i) => `<span>${i % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>`).join('')}</div>`
      : `<p class="w-none">${icon('drop', 14)}<span>${e(l('water.nothing_recorded_today_your_drinks'))}</span></p>`;
    const d = q('.w-day'); if (d.innerHTML !== day) d.innerHTML = day;
    if (setup) {
      q('.ws-portion').textContent = `${draft.portion} ml`; q('.ws-goal').textContent = volume(draft.goal);
      q<HTMLInputElement>('.ws-on input').checked = draft.remind; q('.ws-when').classList.toggle('off', !draft.remind);
      el.querySelectorAll<HTMLSelectElement>('.ws-when select').forEach(s => s.disabled = !draft.remind);
    }
    o.resized?.();
  }
  const openSetup = () => {
    draft = { ...doc }; setup = true;
    const every = q<HTMLSelectElement>('.ws-every'); if (![...every.options].some(x => Number(x.value) === doc.every)) every.add(new Option(l('water.every_min_2', { every: doc.every }), String(doc.every)));
    every.value = String(doc.every); q<HTMLSelectElement>('.ws-from').value = String(doc.from); q<HTMLSelectElement>('.ws-to').value = String(doc.to);
    render(); q<HTMLElement>('.ws-row button').focus({ preventScroll: true });
  };
  const click = (ev: MouseEvent) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>('button'); if (!b || !loaded || b.disabled) return;
    const now = Date.now();
    if (b.matches('.w-drink')) save({ ...doc, log: [...doc.log, { at: now, ml: doc.portion }] });
    else if (b.matches('.w-undo')) { const i = doc.log.map(x => new Date(x.at).toDateString()).lastIndexOf(new Date(now).toDateString()); if (i >= 0) save({ ...doc, log: doc.log.filter((_, k) => k !== i) }); }
    else if (b.matches('.w-set')) openSetup();
    else if (b.dataset.adj) { const [k, by] = b.dataset.adj.split(':') as ['portion' | 'goal', string]; draft = cleanWater({ ...draft, [k]: draft[k] + Number(by) }); render(); }
    else if (b.matches('.ws-cancel')) { setup = false; render(); }
  };
  const change = (ev: Event) => { const t = ev.target as HTMLInputElement; if (t.closest('.ws-on')) { draft = { ...draft, remind: t.checked }; render(); } };
  const submit = (ev: Event) => {
    ev.preventDefault();
    const v = (s: string) => Number(q<HTMLSelectElement>(s).value);
    const next = cleanWater({ ...doc, portion: draft.portion, goal: draft.goal, remind: draft.remind, every: v('.ws-every'), from: v('.ws-from'), to: v('.ws-to') });
    if (next.to <= next.from) { o.report(l('water.the_end_hour_must_come')); return; }
    setup = false; save(next);
  };
  const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && setup) { ev.stopPropagation(); setup = false; render(); } };
  el.addEventListener('click', click); el.addEventListener('change', change); el.addEventListener('submit', submit); el.addEventListener('keydown', key);
  const unWidth = watchWidth(el, () => o.resized?.());
  void bridge.loadDoc<WaterDoc>('water').then(saved => { doc = cleanWater(saved); loaded = true; render(); }).catch(err => { loaded = true; o.report(String(err)); render(); });
  const stop = bridge.onDoc(c => { if (c.name === 'water' && !setup) { doc = cleanWater(c.doc); render(); } });
  // Once a minute: the reminder (it notes when it reminded, so it does not repeat at once).
  const timer = setInterval(() => { if (!loaded) return; const now = Date.now(); if (reminderDue(doc, now)) { save({ ...doc, reminded: now }); void bridge.notify('water').catch(() => {}); } else if (!setup) render(); }, 60_000);
  render();
  return {
    /** The height this page needs now (CSS px): what it shows, at its natural height. */
    height(): number | null { return pageNeeds(root); },
    dispose() { clearInterval(timer); unWidth(); el.removeEventListener('click', click); el.removeEventListener('change', change); el.removeEventListener('submit', submit); el.removeEventListener('keydown', key); void stop.then(f => f()); },
  };
}
