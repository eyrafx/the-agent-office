import { lower, span } from '../i18n';
import type { Translate } from '../i18n';
import type { Bridge, Reminder, ReminderKind } from '../shared/contract';
import { escapeHtml as e } from '../ui/state';
import { icon } from '../ui/icons';
import { emptyState, iconButton, info, pageNeeds, primary, quiet, tabs, watchWidth, wireInfo } from './kit';

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-10-26T09:30" for a moment on the local clock. */
export const localAt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** An alarm's next moment for a time of day: today if it is still ahead, else tomorrow. */
/** A new alarm's time: now, rounded up to the next five minutes ("18:24" → "18:25", "18:25" → "18:30"). */
export const roundedNow = (now = new Date(), step = 5) => { const d = new Date(now); d.setSeconds(0, 0); d.setMinutes(Math.floor(d.getMinutes() / step) * step + step); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** Whether the locale writes the time on a 12-hour clock, and its words for the two halves of the day. */
export const clockOf = (locale: string) => {
  const f = new Intl.DateTimeFormat(locale, { hour: 'numeric' });
  const h12 = ['h11', 'h12'].includes(f.resolvedOptions().hourCycle ?? '');
  const half = (h: number) => new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true }).formatToParts(new Date(2026, 0, 1, h)).find(x => x.type === 'dayPeriod')?.value ?? (h < 12 ? 'AM' : 'PM');
  return { h12, am: half(9), pm: half(21) };
};
/** The hour as the clock shows it (1–12 on a 12-hour clock) and back to 0–23. */
export const toShown = (h: number, h12: boolean) => h12 ? { hour: h % 12 || 12, pm: h >= 12 } : { hour: h, pm: h >= 12 };
export const fromShown = (hour: number, pm: boolean, h12: boolean) => h12 ? Math.min(12, Math.max(1, hour || 12)) % 12 + (pm ? 12 : 0) : Math.min(23, Math.max(0, hour || 0));
export const nextAt = (time: string, now = new Date()) => { const [h, m] = time.split(':').map(Number); const d = new Date(now); d.setHours(h, m, 0, 0); if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1); return localAt(d); };
/** Monday 0 … Sunday 6 (as the app keeps chosen days). */
const dayOf = (d: Date) => (d.getDay() + 6) % 7;
/** The days an alarm repeats on, from its repeat ("days:0,2,4", "weekdays", …); none: once. */
export function repeatDays(repeat: string, at?: string): number[] {
  if (repeat === 'daily') return [0, 1, 2, 3, 4, 5, 6];
  if (repeat === 'weekdays') return [0, 1, 2, 3, 4];
  if (repeat === 'weekly' && at) return [dayOf(new Date(`${at}:00`))];
  if (repeat.startsWith('days:')) return [...new Set(repeat.slice(5).split(',').map(Number).filter(d => Number.isInteger(d) && d >= 0 && d < 7))].sort();
  return [];
}
/** The repeat kept for a choice of days (every day and Monday to Friday by their names). */
export const repeatOf = (days: number[]): Reminder['repeat'] => { const d = [...new Set(days)].sort(); return !d.length ? 'once' : d.length === 7 ? 'daily' : d.join() === '0,1,2,3,4' ? 'weekdays' : `days:${d.join(',')}`; };
/** The next time an alarm at `time` rings on `days` (none: the next such time, once). */
export function nextRing(time: string, days: number[], now = new Date()): Date {
  const [h, m] = time.split(':').map(Number);
  for (let i = 0; i < 8; i++) { const d = new Date(now); d.setDate(d.getDate() + i); d.setHours(h, m, 0, 0); if (d.getTime() > now.getTime() && (!days.length || days.includes(dayOf(d)))) return d; }
  return new Date(nextAt(time, now) + ':00');
}

/**
 * Alarms, reminders and the countdown, each on its own tab, kept and timed by the app (it looks at
 * the wall clock every second, so sleep does not throw it off, and each one rings once). An alarm
 * is set with the time large in the middle, the days it repeats and an optional name, and says
 * when it will ring next before it is saved; a saved one is a card with its time, its days and a
 * switch. A reminder has what to remind, a day and a time, and a repeat. A to-do's reminder shows
 * here and is changed with its to-do; a countdown is started on the focus page. One that came due
 * while the computer slept or AgentOffice was not running is shown as missed. They ring while
 * AgentOffice runs (also with its windows closed, in the tray), not after quitting: the page says
 * so in one line, the rest is behind its "i".
 */
export function createAlarmsPage(el: HTMLElement, bridge: Bridge, o: { l: Translate; locale: string; report: (text: string) => void; changed: () => void; resized?: () => void; openFocus?: () => void }) {
  const { l } = o;
  const dayClock = clockOf(o.locale);
  type Tab = 'alarm' | 'reminder' | 'countdown';
  let list: Reminder[] = [], tab: Tab = 'alarm', form: { kind: 'reminder' | 'alarm'; id?: string; repeat?: Reminder['repeat']; daysTouched?: boolean } | null = null, days: number[] = [];
  const DAY_NAMES = [l('alarms.mon'), l('alarms.tue'), l('alarms.wed'), l('alarms.thu'), l('alarms.fri'), l('alarms.sat'), l('alarms.sun')];
  const repeatText = (r: string, at?: string) => {
    if (r.startsWith('days:') || (r === 'weekly' && at)) { const d = repeatDays(r, at); return d.join() === '5,6' ? l('alarms.weekends') : r === 'weekly' ? l('alarms.every', { v: DAY_NAMES[d[0]] }) : d.map(x => DAY_NAMES[x]).join(', '); }
    return ({ once: l('alarms.once'), daily: l('alarms.every_day'), weekdays: l('alarms.weekdays'), weekly: l('alarms.every_week'), monthly: l('alarms.every_month') })[r] ?? r;
  };
  const kindText = (k?: ReminderKind) => ({ alarm: l('alarms.alarm'), todo: l('alarms.to_do'), countdown: l('alarms.countdown'), reminder: l('alarms.reminder') })[k ?? 'reminder'];
  const dayFormat = new Intl.DateTimeFormat(o.locale, { weekday: 'short', day: 'numeric', month: 'short' }), timeFormat = new Intl.DateTimeFormat(o.locale, { hour: '2-digit', minute: '2-digit' });
  const dayWord = (d: Date) => { const today = new Date(), tomorrow = new Date(Date.now() + 86_400_000); return d.toDateString() === today.toDateString() ? l('alarms.today') : d.toDateString() === tomorrow.toDateString() ? l('alarms.tomorrow') : dayFormat.format(d); };
  const inHow = (ms: number) => l('alarms.in_span', { span: span(Math.max(1, Math.round(ms / 60_000))) });
  const when = (r: Reminder) => { const t = r.snoozed ?? r.due; if (!t) return l('alarms.done'); const d = new Date(t); return `${dayWord(d)} ${timeFormat.format(d)}${r.snoozed ? ` · ${l('alarms.snoozed')}` : ''}`; };
  const LIMITS = l('alarms.alarms_and_reminders_ring_while');
  el.innerHTML = `<div class="pg alarms-page"><div class="alarm-ringing"></div><div class="pg-bar alarms-bar"></div>`
    + `<form class="alarm-editor pg-card" data-noswipe hidden><div class="ae-main"><div class="ae-clock" role="group" aria-label="${e(l('alarms.time'))}">`
    + `<span class="ae-unit"><button type="button" class="ae-step" data-step="h+1" aria-label="${e(l('alarms.hour_up'))}">${icon('chevL', 14)}</button><input class="ae-h" inputmode="numeric" maxlength="2" aria-label="${e(l('alarms.hour'))}"><button type="button" class="ae-step" data-step="h-1" aria-label="${e(l('alarms.hour_down'))}">${icon('chevL', 14)}</button></span><b class="ae-colon">:</b>`
    + `<span class="ae-unit"><button type="button" class="ae-step" data-step="m+5" aria-label="${e(l('alarms.minutes_up'))}">${icon('chevL', 14)}</button><input class="ae-m" inputmode="numeric" maxlength="2" aria-label="${e(l('alarms.minutes'))}"><button type="button" class="ae-step" data-step="m-5" aria-label="${e(l('alarms.minutes_down'))}">${icon('chevL', 14)}</button></span>${dayClock.h12 ? `<button type="button" class="ae-half" aria-label="${e(l('alarms.half_of_day'))}"></button>` : ''}</div>`
    + `<div class="ae-side"><input class="ae-title" maxlength="120" autocomplete="off"><div class="ae-when"></div></div></div>`
    + `<div class="ae-foot"><span class="ae-summary" aria-live="polite"></span>${quiet('ae-delete', l('alarms.delete'), 'trash')}${quiet('ae-cancel', l('alarms.cancel'))}<button type="submit" class="pg-primary ae-save"></button></div></form>`
    + `<div class="alarms-body"></div><p class="pg-foot alarms-foot"><span>${e(l('alarms.rings_only_while_agentoffice_runs'))}</span>${info(l('alarms.when_does_it_ring'), LIMITS)}</p></div>`;
  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const root = q('.alarms-page');
  const hInput = q<HTMLInputElement>('.ae-h'), mInput = q<HTMLInputElement>('.ae-m'), half = el.querySelector<HTMLButtonElement>('.ae-half');
  // The value is always 24-hour ("07:30"); on a 12-hour clock the hour shows 1–12 beside AM/PM.
  let pm = false;
  const timeValue = () => `${pad(fromShown(Number(hInput.value), pm, dayClock.h12))}:${pad(Math.min(59, Math.max(0, Number(mInput.value) || 0)))}`;
  const setTime = (t: string) => { const s = toShown(Number(t.slice(0, 2)), dayClock.h12); pm = s.pm; hInput.value = dayClock.h12 ? String(s.hour) : pad(s.hour); mInput.value = t.slice(3, 5); if (half) half.textContent = pm ? dayClock.pm : dayClock.am; };
  const step = (what: string) => {
    let [h, m] = timeValue().split(':').map(Number); const n = Number(what.slice(1));
    if (what[0] === 'h') h = (h + n + 24) % 24; else { m += n; if (m >= 60) { m -= 60; h = (h + 1) % 24; } if (m < 0) { m += 60; h = (h + 23) % 24; } if (Math.abs(n) === 5) m = Math.round(m / 5) * 5 % 60; }
    setTime(`${pad(h)}:${pad(m)}`); summary();
  };
  // Where the editor's choices lead: when it rings next, said before it is saved.
  const reminderAt = () => `${q<HTMLInputElement>('.ae-date').value}T${timeValue()}`;
  function summary() {
    if (!form) return;
    let text: string, late = false;
    if (form.kind === 'alarm') { const d = nextRing(timeValue(), days); text = l('alarms.rings_at', { day: dayWord(d), dayLower: lower(dayWord(d)), time: timeFormat.format(d), in: inHow(d.getTime() - Date.now()) }); }
    else {
      const at = reminderAt(), d = new Date(`${at}:00`), repeat = q<HTMLSelectElement>('.ae-repeat').value;
      if (Number.isNaN(d.getTime())) text = l('alarms.pick_a_day');
      else if (d.getTime() <= Date.now() && repeat === 'once') { late = true; text = l('alarms.that_time_has_passed_pick'); }
      else text = l('alarms.reminds_at', { day: dayWord(d), dayLower: lower(dayWord(d)), time: timeFormat.format(d) }) + (repeat !== 'once' ? ` · ${lower(repeatText(repeat))}` : '');
    }
    const s = q('.ae-summary'); s.innerHTML = `${icon(late ? 'info' : 'bell', 13)}<span>${e(text)}</span>`; s.classList.toggle('late', late);
  }
  // Examples that fill the editor (nothing is saved until the user saves).
  const examples = {
    alarm: [{ label: l('alarms.weekdays_07_30'), time: '07:30', days: [0, 1, 2, 3, 4], title: l('alarms.wake_up') }, { label: l('alarms.every_day_22_30'), time: '22:30', days: [0, 1, 2, 3, 4, 5, 6], title: l('alarms.bedtime') }],
    reminder: [{ label: l('alarms.meeting_tomorrow_09_00'), title: l('alarms.meeting'), at: () => { const d = new Date(Date.now() + 86_400_000); d.setHours(9, 0, 0, 0); return localAt(d); }, repeat: 'once' as const }, { label: l('alarms.medicine_daily_21_00'), title: l('alarms.medicine'), at: () => nextAt('21:00'), repeat: 'daily' as const }],
  };
  const shown = (t: Tab) => list.filter(r => t === 'countdown' ? r.kind === 'countdown' : t === 'alarm' ? r.kind === 'alarm' : r.kind !== 'alarm' && r.kind !== 'countdown');
  const left = (r: Reminder) => r.ends ? Math.max(0, r.ends - Date.now()) : r.left ?? 0;
  const clock = (ms: number) => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600); return h ? `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
  function render() {
    // Ringing or missed: on top, with snooze and dismiss.
    const loud = list.filter(r => r.ringing || r.missed);
    const ring = loud.map(r => `<div class="ring-card${r.ringing ? ' on' : ''}" data-id="${e(r.id)}">${icon('bell', 18)}<span class="ring-text"><b>${e(r.kind === 'countdown' ? l('alarms.countdown_finished') : r.title)}</b><small>${e(`${kindText(r.kind)} · ${r.ringing ? l('alarms.now') : l('alarms.missed', { v: r.rung ? timeFormat.format(new Date(r.rung)) : '' })}`)}</small></span>${r.kind === 'countdown' ? '' : `<button type="button" data-snooze="5">${e(l('alarms.snooze_5'))}</button><button type="button" data-snooze="10">${e(l('alarms.10_min'))}</button>`}<button type="button" class="ring-off" data-dismiss>${e(l('alarms.dismiss'))}</button></div>`).join('');
    const box = q('.alarm-ringing'); if (box.innerHTML !== ring) box.innerHTML = ring;
    el.classList.toggle('ringing', loud.some(r => r.ringing));
    const now = shown(tab);
    // The bar: three tabs (a count where there is one on) and, once there is a list, the main action.
    const on = (t: Tab) => shown(t).filter(r => t === 'countdown' ? r.ends || r.left : r.enabled).length;
    const main = form || !now.length || tab === 'countdown' ? '' : tab === 'alarm' ? primary('alarms-new', l('alarms.set_an_alarm'), 'plus', 'data-new="alarm"') : primary('alarms-new', l('alarms.reminder'), 'plus', 'data-new="reminder"');
    const bar = `${tabs(l('alarms.kind'), [{ id: 'alarm', text: l('alarms.alarms'), count: on('alarm'), on: tab === 'alarm' }, { id: 'reminder', text: l('alarms.reminders'), count: on('reminder'), on: tab === 'reminder' }, { id: 'countdown', text: l('alarms.countdown'), count: on('countdown'), on: tab === 'countdown' }])}<span class="pg-spacer"></span>${main}`;
    const b = q('.alarms-bar'); if (b.innerHTML !== bar) b.innerHTML = bar;
    q('.alarm-editor').hidden = !form;
    let html: string;
    if (form) html = '';
    else if (tab === 'countdown') html = now.length ? `<ul class="alarm-rows" role="list">${now.map(r => `<li class="alarm-row cd" data-id="${e(r.id)}"><span class="ar-when"><b>${e(clock(left(r)))}</b><small>${e(r.ends ? l('alarms.left') : l('alarms.paused'))}</small></span><span class="ar-text"><b>${e(r.title)}</b><small>${e(r.ends ? l('alarms.ends_at', { format: timeFormat.format(new Date(r.ends)) }) : l('alarms.resume_it_on_the_focus'))}</small></span>${quiet('to-focus', l('alarms.focus_page'), 'chevR')}</li>`).join('')}</ul>`
      : emptyState({ ic: 'timer', tone: '#ffc04d', title: l('alarms.no_countdown_running'), text: l('alarms.to_hear_after_a_set'), actions: primary('to-focus', l('alarms.go_to_the_focus_page'), 'chevR') });
    else if (!now.length) html = tab === 'alarm'
      ? emptyState({ ic: 'bell', tone: '#ff9f5a', title: l('alarms.no_alarms_yet'), text: l('alarms.it_rings_at_the_time'), actions: primary('alarms-new', l('alarms.set_an_alarm'), 'plus', 'data-new="alarm"') + examples.alarm.map((x, i) => `<button type="button" class="pg-chip" data-example="alarm-${i}">${e(x.label)}</button>`).join('') })
      : emptyState({ ic: 'calendar', tone: '#6cc6ff', title: l('alarms.no_reminders_yet'), text: l('alarms.pick_a_day_and_time'), actions: primary('alarms-new', l('alarms.add_a_reminder'), 'plus', 'data-new="reminder"') + examples.reminder.map((x, i) => `<button type="button" class="pg-chip" data-example="reminder-${i}">${e(x.label)}</button>`).join('') });
    else {
      const sorted = [...now].sort((a, b) => Number(b.enabled) - Number(a.enabled) || (a.snoozed ?? a.due ?? Infinity) - (b.snoozed ?? b.due ?? Infinity));
      const toggle = (r: Reminder) => `<input type="checkbox" class="pg-switch alarm-on" ${r.enabled ? 'checked' : ''} aria-label="${e(r.enabled ? l('alarms.on_click_to_turn_off') : l('alarms.off_click_to_turn_on'))}" title="${e(r.enabled ? l('alarms.on') : l('alarms.off'))}">`;
      html = tab === 'alarm'
        ? `<ul class="alarm-cards" role="list">${sorted.map(r => `<li class="alarm-card${r.enabled ? '' : ' off'}" data-id="${e(r.id)}"><button type="button" class="ac-open" title="${e(l('alarms.edit'))}"><b class="ac-time">${e(r.at.slice(11, 16))}</b><span class="ac-name">${e(r.title)}</span><small>${e(repeatText(r.repeat, r.at))}${r.enabled ? ` · ${e(when(r))}` : ` · ${e(l('alarms.off'))}`}</small></button>${toggle(r)}${iconButton('alarm-del', 'trash', l('alarms.delete'))}</li>`).join('')}</ul>`
        : `<ul class="alarm-rows" role="list">${sorted.map(r => { const d = new Date(r.snoozed ?? r.due ?? `${r.at}:00`); return `<li class="alarm-row${r.enabled ? '' : ' off'} k-${r.kind ?? 'reminder'}" data-id="${e(r.id)}"><span class="ar-when"><b>${e(r.at.slice(11, 16))}</b><small>${e(r.enabled && (r.due || r.snoozed) ? dayWord(d) : l('alarms.off'))}</small></span><button type="button" class="ar-text" title="${e(r.kind === 'todo' ? l('alarms.a_to_do_s_time') : l('alarms.edit'))}"><b>${e(r.title)}</b><small>${e(`${r.kind === 'todo' ? `${kindText('todo')} · ` : ''}${repeatText(r.repeat, r.at)}${r.snoozed ? ` · ${l('alarms.snoozed')}` : ''}`)}</small></button>${toggle(r)}${iconButton('alarm-del', 'trash', l('alarms.delete'))}</li>`; }).join('')}</ul>`;
    }
    const body = q('.alarms-body'); if (body.innerHTML !== html) body.innerHTML = html; body.hidden = !html;
    o.resized?.();
  }
  const act = (p: Promise<unknown>) => void p.catch(err => o.report(err instanceof Error ? err.message : String(err)));
  /** Opens the editor: a new alarm or reminder (optionally filled from an example), or a saved one. */
  const openForm = (kind: 'reminder' | 'alarm', fill?: { id?: string; title: string; at: string; repeat: Reminder['repeat'] }) => {
    tab = kind;
    const soon = new Date(Date.now() + 60 * 60_000); soon.setMinutes(0, 0, 0);
    const at = fill?.at ?? (kind === 'alarm' ? nextAt(roundedNow()) : localAt(soon));
    form = { kind, id: fill?.id, repeat: fill?.repeat };
    days = kind === 'alarm' ? repeatDays(fill?.repeat ?? 'weekdays', at) : [];
    // Values put here by the page are not the user's typing (they hold nothing open).
    el.querySelectorAll<HTMLElement>('[data-typed]').forEach(x => { delete x.dataset.typed; });
    root.classList.toggle('editing-alarm', kind === 'alarm'); root.classList.toggle('editing-reminder', kind === 'reminder');
    setTime(at.slice(11));
    const title = q<HTMLInputElement>('.ae-title'); title.value = fill?.title ?? '';
    title.placeholder = kind === 'alarm' ? l('alarms.name_optional_e_g_wake') : l('alarms.what_to_remind_e_g');
    title.setAttribute('aria-label', kind === 'alarm' ? l('alarms.alarm_name') : l('alarms.what_to_remind'));
    const today = localAt(new Date()).slice(0, 10), tomorrow = localAt(new Date(Date.now() + 86_400_000)).slice(0, 10);
    q('.ae-when').innerHTML = kind === 'alarm'
      ? `<span class="ae-label">${e(l('alarms.repeat'))}</span><div class="ae-days" role="group" aria-label="${e(l('alarms.days_it_rings'))}">${DAY_NAMES.map((n, i) => `<button type="button" class="ae-day" data-day="${i}" aria-pressed="false">${e(n)}</button>`).join('')}</div><small class="ae-days-note"></small>`
      : `<span class="ae-label">${e(l('alarms.day'))}</span><div class="ae-dayrow"><button type="button" class="pg-chip" data-date="${today}">${e(l('alarms.today'))}</button><button type="button" class="pg-chip" data-date="${tomorrow}">${e(l('alarms.tomorrow'))}</button><input type="date" class="ae-date" value="${at.slice(0, 10)}" aria-label="${e(l('alarms.date'))}"><select class="ae-repeat" aria-label="${e(l('alarms.repeat'))}">${['once', 'daily', 'weekdays', 'weekly', 'monthly'].map(r => `<option value="${r}">${e(repeatText(r))}</option>`).join('')}</select></div>`;
    if (kind === 'reminder') q<HTMLSelectElement>('.ae-repeat').value = fill?.repeat && !fill.repeat.startsWith('days:') ? fill.repeat : 'once';
    q('.ae-save').innerHTML = `${icon('check', 15)}<span>${e(fill?.id ? l('alarms.save') : kind === 'alarm' ? l('alarms.set_alarm') : l('alarms.add'))}</span>`;
    q('.ae-delete').hidden = !fill?.id;
    paintDays(); render(); summary();
    (kind === 'alarm' ? hInput : title).focus({ preventScroll: true });
  };
  const paintDays = () => {
    el.querySelectorAll<HTMLElement>('.ae-day').forEach(b => { const on = days.includes(Number(b.dataset.day)); b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); });
    const n = el.querySelector('.ae-days-note'); if (n) n.textContent = days.length ? repeatText(repeatOf(days)) : l('alarms.no_day_chosen_rings_once');
    el.querySelectorAll<HTMLElement>('.ae-dayrow [data-date]').forEach(b => b.classList.toggle('on', b.dataset.date === el.querySelector<HTMLInputElement>('.ae-date')?.value));
  };
  const closeForm = () => { form = null; root.classList.remove('editing-alarm', 'editing-reminder'); render(); };
  const submit = (ev: Event) => {
    ev.preventDefault(); if (!form) return;
    const time = timeValue(), title = q<HTMLInputElement>('.ae-title').value.trim();
    if (form.kind === 'alarm') {
      const repeat = !form.daysTouched && form.repeat === 'monthly' ? 'monthly' : repeatOf(days);
      act(bridge.saveReminder({ id: form.id, title: title || l('alarms.alarm'), at: localAt(nextRing(time, days)), repeat, enabled: true, kind: 'alarm' }).then(closeForm));
    } else {
      if (!title) { o.report(l('alarms.write_what_to_remind')); q<HTMLInputElement>('.ae-title').focus({ preventScroll: true }); return; }
      const date = q<HTMLInputElement>('.ae-date').value; if (!date) { o.report(l('alarms.pick_a_day')); return; }
      act(bridge.saveReminder({ id: form.id, title, at: `${date}T${time}`, repeat: q<HTMLSelectElement>('.ae-repeat').value as Reminder['repeat'], enabled: true, kind: 'reminder' }).then(closeForm));
    }
  };
  const click = (ev: MouseEvent) => {
    const t = ev.target as Element;
    const tb = t.closest<HTMLElement>('[data-tab]'); if (tb) { tab = tb.dataset.tab as Tab; if (form) closeForm(); else render(); return; }
    const add = t.closest<HTMLElement>('[data-new]'); if (add) { openForm(add.dataset.new as 'reminder' | 'alarm'); return; }
    const ex = t.closest<HTMLElement>('[data-example]');
    if (ex) { const [k, i] = ex.dataset.example!.split('-'); if (k === 'alarm') { const x = examples.alarm[Number(i)]; openForm('alarm', { title: x.title, at: nextAt(x.time), repeat: repeatOf(x.days) }); } else { const x = examples.reminder[Number(i)]; openForm('reminder', { title: x.title, at: x.at(), repeat: x.repeat }); } return; }
    if (t.closest('.to-focus')) { o.openFocus?.(); return; }
    const st = t.closest<HTMLElement>('[data-step]'); if (st) { step(st.dataset.step!); return; }
    if (t.closest('.ae-half')) { setTime(`${pad((fromShown(Number(hInput.value), pm, true) + 12) % 24)}:${mInput.value}`); summary(); return; }
    const dy = t.closest<HTMLElement>('[data-day]'); if (dy && form) { const d = Number(dy.dataset.day); days = days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort(); form.daysTouched = true; paintDays(); summary(); return; }
    const dt = t.closest<HTMLElement>('[data-date]'); if (dt) { q<HTMLInputElement>('.ae-date').value = dt.dataset.date!; paintDays(); summary(); return; }
    if (t.closest('.ae-cancel')) { closeForm(); return; }
    if (t.closest('.ae-delete') && form?.id) { const id = form.id; act(bridge.deleteReminder(id).then(closeForm)); return; }
    const card = t.closest<HTMLElement>('.ring-card');
    if (card) { const b = t.closest<HTMLButtonElement>('button'); if (b?.dataset.snooze) act(bridge.snoozeReminder(card.dataset.id!, Number(b.dataset.snooze))); else if (b?.hasAttribute('data-dismiss')) act(bridge.dismissReminder(card.dataset.id!)); return; }
    const li = t.closest<HTMLElement>('li.alarm-card, li.alarm-row'); if (!li) return;
    const r = list.find(x => x.id === li.dataset.id); if (!r) return;
    if (t.closest('.alarm-del')) act(bridge.deleteReminder(r.id));
    else if (t.closest('.ac-open, .ar-text') && r.kind !== 'todo' && r.kind !== 'countdown') openForm(r.kind === 'alarm' ? 'alarm' : 'reminder', { id: r.id, title: r.title, at: r.kind === 'alarm' ? nextAt(r.at.slice(11)) : r.at, repeat: r.repeat });
  };
  const change = (ev: Event) => {
    const t = ev.target as HTMLInputElement; const li = t.closest<HTMLElement>('li.alarm-card, li.alarm-row');
    if (li && t.matches('.alarm-on')) { const r = list.find(x => x.id === li.dataset.id); if (r) act(bridge.saveReminder({ id: r.id, title: r.title, at: r.kind === 'alarm' && t.checked ? localAt(nextRing(r.at.slice(11), repeatDays(r.repeat, r.at))) : r.at, repeat: r.repeat, enabled: t.checked, kind: r.kind }).catch(err => { t.checked = !t.checked; throw err; })); return; }
    if (t.matches('.ae-date, .ae-repeat')) { paintDays(); summary(); }
  };
  const input = (ev: Event) => { const t = ev.target as HTMLInputElement; if (t === hInput || t === mInput) { t.value = t.value.replace(/\D/g, '').slice(0, 2); if (t === hInput && t.value.length === 2) { mInput.focus(); mInput.select(); } summary(); } };
  const key = (ev: KeyboardEvent) => {
    const t = ev.target as HTMLElement;
    if ((t === hInput || t === mInput) && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) { ev.preventDefault(); step(`${t === hInput ? 'h' : 'm'}${ev.key === 'ArrowUp' ? '+' : '-'}1`); return; }
    if (ev.key === 'Escape' && form) { ev.stopPropagation(); closeForm(); }
  };
  const blur = (ev: FocusEvent) => { const t = ev.target as HTMLInputElement; if (t === hInput || t === mInput) { setTime(timeValue()); summary(); } };
  const wheel = (ev: WheelEvent) => { const t = (ev.target as Element).closest('.ae-unit'); if (!t || !form) return; ev.preventDefault(); step(`${t.querySelector('.ae-h') ? 'h' : 'm'}${ev.deltaY < 0 ? '+' : '-'}${t.querySelector('.ae-h') ? 1 : 5}`); };
  q('.alarm-editor').addEventListener('submit', submit); el.addEventListener('click', click); el.addEventListener('change', change); el.addEventListener('input', input); el.addEventListener('keydown', key); el.addEventListener('focusout', blur); el.addEventListener('wheel', wheel, { passive: false });
  const unInfo = wireInfo(el, () => o.resized?.()), unWidth = watchWidth(el, () => o.resized?.());
  const apply = (next: Reminder[]) => { list = next; render(); o.changed(); };
  void bridge.reminders().then(apply).catch(err => o.report(String(err)));
  const stop = bridge.onReminders(apply);
  // The list's "Bugün/Yarın" and a countdown's time left move on; the editor's summary too.
  const timer = setInterval(() => { if (tab === 'countdown' && !form) render(); else if (!form && Date.now() % 30_000 < 1000) render(); summary(); }, 1000);
  render();
  return {
    /** The height this page needs now (CSS px): what it shows, at its natural height. */
    height(): number | null { return pageNeeds(root); },
    /** A reminder rings now (the closed island shows it). */
    get ringing() { return list.some(r => r.ringing); },
    /** Opens the alarm editor (from the focus page's "Alarm kur"). */
    newAlarm() { openForm('alarm'); },
    dispose() { clearInterval(timer); unInfo(); unWidth(); q('.alarm-editor').removeEventListener('submit', submit); el.removeEventListener('click', click); el.removeEventListener('change', change); el.removeEventListener('input', input); el.removeEventListener('keydown', key); el.removeEventListener('focusout', blur); el.removeEventListener('wheel', wheel); void stop.then(f => f()); },
  };
}
