import type { Translate } from '../i18n';
import type { Bridge } from '../shared/contract';
import { escapeHtml as e } from '../ui/state';
import { icon } from '../ui/icons';
import { emptyState, iconButton, info, pageNeeds, primary, quiet, tabs, watchWidth, wireInfo } from './kit';

/** One line of the page: a to-do of one's own (with its check, and optionally a time and a
 *  reminder) or a plain note. A to-do is a personal list item: it sends no work to any agent. */
export interface NoteItem { id: string; text: string; kind: 'task' | 'note'; done: boolean; created: number; updated: number;
  /** A to-do's local date and time ("2026-10-28T09:00"), and whether it reminds then. */
  due?: string; remind?: boolean }
export interface NotesDoc { items: NoteItem[] }
export const MAX_ITEMS = 500, MAX_TEXT = 500;
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
/** The tab the user looked at last (a convenience, kept in this browser). */
const TAB_KEY = 'agentoffice-notes-tab';

/** A saved record as the page can trust it: known fields only, texts trimmed, at most 500 lines. */
export function cleanNotes(raw: unknown): NoteItem[] {
  const items = (raw as NotesDoc | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.filter(x => x && typeof x.id === 'string' && typeof x.text === 'string').slice(0, MAX_ITEMS).map(x => {
    const task = x.kind !== 'note', due = task && typeof x.due === 'string' && AT.test(x.due) ? x.due : undefined;
    return { id: x.id, text: x.text.slice(0, MAX_TEXT), kind: task ? 'task' : 'note', done: !!x.done && task, created: Number(x.created) || Date.now(), updated: Number(x.updated) || Number(x.created) || Date.now(), ...(due ? { due, remind: !!x.remind } : {}) };
  });
}
/** A to-do's reminder: one record in the app's reminders, named after the to-do. */
export const todoReminderId = (id: string) => `todo-${id.replace(/[^A-Za-z0-9-]/g, '').slice(0, 30)}`;

const pad = (n: number) => String(n).padStart(2, '0');
const localAt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Notes and to-dos, two tabs of one personal list. Empty, it offers the two ways to start (a
 * to-do to keep track of the day's work, a note to keep an idea), each with an example. A to-do
 * is a line with a check, a time that can remind (the reminder is the same record: changed, done
 * or deleted with it), edit and delete; done ones gather under "Tamamlananlar". A note is a card
 * to read, edited in place. Typing is never interrupted, and a save that fails puts the list back
 * as it was and says why.
 */
export function createNotesPage(el: HTMLElement, bridge: Bridge, o: { l: Translate; locale: string; report: (text: string) => void; resized?: () => void }) {
  const { l } = o;
  let items: NoteItem[] = [], tab: 'task' | 'note' = 'task', composing = false, editing: string | null = null, loaded = false, timing: string | null = null;
  try { if (localStorage.getItem(TAB_KEY) === 'note') tab = 'note'; } catch { /* A convenience only. */ }
  const dayFormat = new Intl.DateTimeFormat(o.locale, { weekday: 'short', day: 'numeric', month: 'short' }), timeFormat = new Intl.DateTimeFormat(o.locale, { hour: '2-digit', minute: '2-digit' }), dateFormat = new Intl.DateTimeFormat(o.locale, { day: 'numeric', month: 'short' });
  el.innerHTML = `<div class="pg notes-page"><div class="pg-bar notes-bar"></div><form class="notes-compose pg-card" data-noswipe hidden></form><div class="notes-body"></div></div>`;
  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const root = q('.notes-page');
  const act = (p: Promise<unknown>) => void p.catch(err => o.report(err instanceof Error ? err.message : String(err)));
  // A to-do's reminder follows it: on while it has a time, reminds and is not done; gone otherwise.
  const syncReminder = (before: NoteItem | undefined, after: NoteItem | undefined) => {
    const id = todoReminderId((after ?? before)!.id);
    const wants = (x?: NoteItem) => !!x && x.kind === 'task' && !x.done && !!x.due && !!x.remind;
    if (wants(after)) { if (!wants(before) || before!.due !== after!.due || before!.text !== after!.text) act(bridge.saveReminder({ id, title: after!.text, at: after!.due!, repeat: 'once', enabled: true, kind: 'todo' })); }
    else if (wants(before)) act(bridge.deleteReminder(id));
  };
  const save = (next: NoteItem[]) => {
    const before = items; items = next; render();
    const was = new Map(before.map(x => [x.id, x])), now = new Map(next.map(x => [x.id, x]));
    for (const id of new Set([...was.keys(), ...now.keys()])) if (JSON.stringify(was.get(id)) !== JSON.stringify(now.get(id))) syncReminder(was.get(id), now.get(id));
    void bridge.saveDoc('notes', { items: next }).catch(err => { items = before; render(); o.report(`${l('notes.not_saved')}: ${err instanceof Error ? err.message : String(err)}`); });
  };
  const dueText = (at: string) => {
    const d = new Date(`${at}:00`), today = new Date(), tomorrow = new Date(Date.now() + 86_400_000);
    const day = d.toDateString() === today.toDateString() ? l('notes.today') : d.toDateString() === tomorrow.toDateString() ? l('notes.tomorrow') : dayFormat.format(d);
    return `${day} ${timeFormat.format(d)}`;
  };
  const setTab = (next: 'task' | 'note') => { tab = next; try { localStorage.setItem(TAB_KEY, next); } catch { /* A convenience only. */ } };

  // The composer: a line for a to-do, a few lines for a note.
  const openCompose = (kind: 'task' | 'note') => {
    setTab(kind); composing = true; editing = null; timing = null;
    const f = q<HTMLFormElement>('.notes-compose');
    f.innerHTML = kind === 'task'
      ? `<span class="compose-kind k-task">${icon('check', 14)}${e(l('notes.new_to_do'))}</span><input class="compose-text" maxlength="${MAX_TEXT}" autocomplete="off" spellcheck="true" placeholder="${e(l('notes.what_needs_doing_e_g'))}" aria-label="${e(l('notes.to_do'))}"><div class="compose-actions"><small>${e(l('notes.enter_adds_it_add_a'))}</small>${quiet('compose-cancel', l('notes.cancel'))}<button type="submit" class="pg-primary">${icon('plus', 15)}<span>${e(l('notes.add'))}</span></button></div>`
      : `<span class="compose-kind k-note">${icon('note', 14)}${e(l('notes.new_note'))}</span><textarea class="compose-text" rows="3" maxlength="${MAX_TEXT}" spellcheck="true" placeholder="${e(l('notes.write_down_your_idea'))}" aria-label="${e(l('notes.note'))}"></textarea><div class="compose-actions"><small>${e(l('notes.ctrl_enter_saves'))}</small>${quiet('compose-cancel', l('notes.cancel'))}<button type="submit" class="pg-primary">${icon('check', 15)}<span>${e(l('notes.save'))}</span></button></div>`;
    render(); f.querySelector<HTMLElement>('.compose-text')!.focus({ preventScroll: true });
  };
  const closeCompose = () => { composing = false; q('.notes-compose').innerHTML = ''; render(); };

  const taskRow = (x: NoteItem) => {
    const late = x.due && !x.done && new Date(`${x.due}:00`).getTime() < Date.now();
    const due = x.due ? `<button type="button" class="note-due${late ? ' late' : ''}" title="${e(l('notes.change_the_time'))}">${icon(x.remind ? 'bell' : 'calendar', 12)}${e(dueText(x.due))}</button>` : '';
    const li = document.createElement('li'); li.dataset.id = x.id; li.className = `todo${x.done ? ' done' : ''}`;
    li.innerHTML = `<button type="button" class="todo-check" role="checkbox" aria-checked="${x.done}" aria-label="${e(x.done ? l('notes.mark_not_done') : l('notes.mark_done'))}" title="${e(x.done ? l('notes.mark_not_done') : l('notes.mark_done'))}">${icon('check', 13)}</button><span class="todo-text" tabindex="0" title="${e(l('notes.click_to_edit'))}">${e(x.text)}</span>${due}<span class="row-actions">${x.done ? '' : iconButton('todo-time', 'bell', x.due ? l('notes.change_the_time_and_reminder') : l('notes.add_a_date_time_and'))}${iconButton('todo-edit', 'edit', l('notes.edit'))}${iconButton('todo-del', 'trash', l('notes.delete'))}</span>`;
    if (timing === x.id) li.append(timeForm(x));
    return li;
  };
  const noteCard = (x: NoteItem) => {
    const li = document.createElement('li'); li.dataset.id = x.id; li.className = 'note-card';
    li.innerHTML = `<p class="note-body" tabindex="0" title="${e(l('notes.click_to_edit'))}">${e(x.text)}</p><span class="note-foot"><small>${e(dateFormat.format(new Date(x.updated)))}</small><span class="row-actions">${iconButton('note-edit', 'edit', l('notes.edit'))}${iconButton('note-del', 'trash', l('notes.delete'))}</span></span>`;
    return li;
  };
  function render() {
    const tasks = items.filter(x => x.kind === 'task'), notes = items.filter(x => x.kind === 'note'), open = tasks.filter(x => !x.done), done = tasks.filter(x => x.done);
    const start = loaded && !items.length && !composing;
    root.classList.toggle('is-start', start);
    // The bar: the two tabs, the "i" and the one main action (hidden while adding).
    const bar = start ? '' : `${tabs(l('notes.list'), [{ id: 'task', text: l('notes.to_dos'), count: open.length, on: tab === 'task' }, { id: 'note', text: l('notes.notes'), count: notes.length, on: tab === 'note' }])}<span class="pg-spacer"></span>${info(l('notes.what_is_this_list'), l('notes.this_list_is_just_for'))}${composing ? '' : primary('notes-new', tab === 'task' ? l('notes.to_do') : l('notes.note'), 'plus')}`;
    const b = q('.notes-bar'); if (b.innerHTML !== bar) b.innerHTML = bar; b.hidden = start;
    q('.notes-compose').hidden = !composing;
    const body = q('.notes-body');
    body.hidden = false;
    if (!loaded) { body.replaceChildren(); return; }
    if (start) {
      body.innerHTML = `<div class="notes-start"><button type="button" class="start-card k-task" data-start="task"><span class="pg-art">${icon('check', 20)}</span><b>${e(l('notes.add_a_to_do'))}</b><span>${e(l('notes.keep_track_of_today_s'))}</span><small>${e(l('notes.e_g_pay_the_bill'))}</small></button><button type="button" class="start-card k-note" data-start="note"><span class="pg-art">${icon('note', 20)}</span><b>${e(l('notes.write_a_note'))}</b><span>${e(l('notes.keep_an_idea_you_have'))}</span><small>${e(l('notes.e_g_a_book_tip'))}</small></button></div><p class="pg-foot">${icon('lock', 12)}${e(l('notes.your_own_list_kept_on'))}</p>`;
      o.resized?.(); return;
    }
    // An item being edited keeps its field (and the caret) across updates.
    const keep = editing ? body.querySelector<HTMLLIElement>(`li[data-id="${CSS.escape(editing)}"]`) : null;
    const reuse = (x: NoteItem, make: (x: NoteItem) => HTMLLIElement) => keep && x.id === editing ? keep : make(x);
    if (tab === 'task') {
      const byTime = (a: NoteItem, b: NoteItem) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || (a.due ?? '').localeCompare(b.due ?? '') || b.updated - a.updated;
      const parts: HTMLElement[] = [];
      if (open.length) { const ul = document.createElement('ul'); ul.className = 'todo-list'; ul.setAttribute('role', 'list'); ul.append(...[...open].sort(byTime).map(x => reuse(x, taskRow))); parts.push(ul); }
      else if (!composing) { const d = document.createElement('div'); d.innerHTML = emptyState({ ic: 'check', tone: '#7fdca4', title: done.length ? l('notes.all_done') : l('notes.no_open_to_dos'), text: l('notes.press_to_do_to_add') }); parts.push(d.firstElementChild as HTMLElement); }
      if (done.length) {
        const h = document.createElement('div'); h.className = 'done-head'; h.innerHTML = `<span>${e(l('notes.done', { length: done.length }))}</span>${quiet('notes-clear', l('notes.clear'), 'trash', `title="${e(l('notes.delete_the_done_ones_from'))}"`)}`;
        const ul = document.createElement('ul'); ul.className = 'todo-list done-list'; ul.setAttribute('role', 'list'); ul.append(...[...done].sort((a, b) => b.updated - a.updated).map(x => reuse(x, taskRow)));
        parts.push(h, ul);
      }
      body.replaceChildren(...parts);
    } else {
      if (notes.length) { const ul = document.createElement('ul'); ul.className = 'note-grid'; ul.setAttribute('role', 'list'); ul.append(...[...notes].sort((a, b) => b.updated - a.updated).map(x => reuse(x, noteCard))); body.replaceChildren(ul); }
      else body.innerHTML = composing ? '' : emptyState({ ic: 'note', tone: '#ffc04d', title: l('notes.no_notes_yet'), text: l('notes.keep_an_idea_a_link') });
    }
    body.hidden = !body.childElementCount;
    o.resized?.();
  }
  // The time of a to-do: two quick choices, or a date and time; and whether it reminds.
  const timeForm = (x: NoteItem) => {
    const f = document.createElement('form'); f.className = 'todo-timeform'; f.setAttribute('data-noswipe', '');
    const at = x.due ?? localAt(new Date(Math.ceil((Date.now() + 3_600_000) / 3_600_000) * 3_600_000));
    const quick = (label: string, d: Date) => `<button type="button" class="pg-chip" data-at="${localAt(d)}">${e(label)}</button>`;
    const evening = new Date(); evening.setHours(18, 0, 0, 0); const morning = new Date(Date.now() + 86_400_000); morning.setHours(9, 0, 0, 0);
    f.innerHTML = `<div class="tf-row">${evening.getTime() > Date.now() ? quick(l('notes.today_18_00'), evening) : ''}${quick(l('notes.tomorrow_09_00'), morning)}<input type="date" class="tf-date" value="${at.slice(0, 10)}" aria-label="${e(l('notes.date'))}"><input type="time" class="tf-time" value="${at.slice(11)}" aria-label="${e(l('notes.time'))}"></div><div class="tf-row"><label class="tf-remind"><input type="checkbox" class="pg-switch" ${x.due ? (x.remind ? 'checked' : '') : 'checked'}><span>${e(l('notes.remind_me_then'))}</span></label><span class="pg-spacer"></span>${x.due ? quiet('tf-clear', l('notes.remove_time')) : ''}${quiet('tf-cancel', l('notes.cancel'))}<button type="submit" class="pg-primary"><span>${e(l('notes.save'))}</span></button></div>`;
    return f;
  };
  const edit = (li: HTMLLIElement) => {
    const id = li.dataset.id!, item = items.find(x => x.id === id); if (!item) return;
    editing = id; timing = null;
    const note = item.kind === 'note';
    const field = document.createElement(note ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement;
    field.className = note ? 'note-editfield' : 'todo-editfield'; field.value = item.text; field.maxLength = MAX_TEXT; field.setAttribute('data-noswipe', ''); field.setAttribute('aria-label', l('notes.edit'));
    if (note) (field as HTMLTextAreaElement).rows = Math.min(6, Math.max(3, item.text.split('\n').length + 1));
    li.classList.add('editing');
    li.querySelector(note ? '.note-body' : '.todo-text')!.replaceWith(field); field.focus({ preventScroll: true }); if (!note) field.select();
    o.resized?.();
    let finished = false;
    const done = (keepIt: boolean) => {
      if (finished) return; finished = true; editing = null;
      const text = field.value.trim();
      if (keepIt && text && text !== item.text) save(items.map(x => x.id === id ? { ...x, text, updated: Date.now() } : x));
      else if (keepIt && !text) save(items.filter(x => x.id !== id));
      else render();
    };
    field.addEventListener('keydown', ev => { const k = ev as KeyboardEvent; if (k.key === 'Enter' && (!note || k.ctrlKey)) { k.preventDefault(); done(true); } else if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); done(false); } });
    field.addEventListener('blur', () => done(true));
  };
  const submit = (ev: Event) => {
    ev.preventDefault(); if (!loaded) return;
    const form = ev.target as HTMLFormElement;
    if (form.matches('.todo-timeform')) {
      const id = form.closest<HTMLElement>('li')!.dataset.id!, date = form.querySelector<HTMLInputElement>('.tf-date')!.value, time = form.querySelector<HTMLInputElement>('.tf-time')!.value;
      if (!date || !time) { o.report(l('notes.pick_a_date_and_time')); return; }
      const remind = form.querySelector<HTMLInputElement>('.tf-remind input')!.checked, due = `${date}T${time}`;
      if (remind && new Date(`${due}:00`).getTime() <= Date.now()) { o.report(l('notes.that_time_has_passed_pick')); return; }
      timing = null; save(items.map(x => x.id === id ? { ...x, due, remind, updated: Date.now() } : x)); return;
    }
    const field = form.querySelector<HTMLInputElement | HTMLTextAreaElement>('.compose-text'); if (!field) return;
    const text = field.value.trim(); if (!text) { field.focus({ preventScroll: true }); return; }
    if (items.length >= MAX_ITEMS) { o.report(l('notes.at_most_500_lines_are')); return; }
    const now = Date.now();
    save([{ id: `n${now}${Math.random().toString(36).slice(2, 6)}`, text: text.slice(0, MAX_TEXT), kind: tab, done: false, created: now, updated: now }, ...items]);
    // A to-do: the field stays for the next one; a note is done.
    if (tab === 'task') { field.value = ''; delete field.dataset.typed; field.focus({ preventScroll: true }); } else closeCompose();
  };
  const click = (ev: MouseEvent) => {
    const t = ev.target as Element;
    const start = t.closest<HTMLElement>('[data-start]'); if (start) { openCompose(start.dataset.start as 'task' | 'note'); return; }
    const tb = t.closest<HTMLElement>('[data-tab]'); if (tb) { setTab(tb.dataset.tab as 'task' | 'note'); timing = null; if (composing) closeCompose(); else render(); return; }
    if (t.closest('.notes-new')) { openCompose(tab); return; }
    if (t.closest('.compose-cancel')) { closeCompose(); return; }
    if (t.closest('.notes-clear')) { save(items.filter(x => !(x.kind === 'task' && x.done))); return; }
    const li = t.closest<HTMLLIElement>('li.todo, li.note-card'); if (!li || !loaded) return;
    const id = li.dataset.id!;
    const quickAt = t.closest<HTMLElement>('[data-at]'); if (quickAt) { const f = li.querySelector('.todo-timeform')!; f.querySelector<HTMLInputElement>('.tf-date')!.value = quickAt.dataset.at!.slice(0, 10); f.querySelector<HTMLInputElement>('.tf-time')!.value = quickAt.dataset.at!.slice(11); return; }
    if (t.closest('.tf-cancel')) { timing = null; render(); return; }
    if (t.closest('.tf-clear')) { timing = null; save(items.map(x => x.id === id ? { ...x, due: undefined, remind: undefined, updated: Date.now() } : x)); return; }
    if (t.closest('.todo-timeform') || li.classList.contains('editing')) return;
    if (t.closest('.todo-check')) save(items.map(x => x.id === id ? { ...x, done: !x.done, updated: Date.now() } : x));
    else if (t.closest('.todo-del, .note-del')) save(items.filter(x => x.id !== id));
    else if (t.closest('.todo-time, .note-due')) { timing = timing === id ? null : id; render(); el.querySelector<HTMLInputElement>('.todo-timeform .tf-time')?.focus({ preventScroll: true }); }
    else if (t.closest('.todo-text, .todo-edit, .note-body, .note-edit')) edit(li);
  };
  const key = (ev: KeyboardEvent) => {
    const t = ev.target as HTMLElement;
    if (t.matches('.todo-text, .note-body') && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); edit(t.closest('li')!); return; }
    if (t.matches('textarea.compose-text') && ev.key === 'Enter' && ev.ctrlKey) { ev.preventDefault(); q<HTMLFormElement>('.notes-compose').requestSubmit(); return; }
    if (ev.key === 'Escape' && timing) { ev.stopPropagation(); timing = null; render(); return; }
    if (ev.key === 'Escape' && composing) { ev.stopPropagation(); closeCompose(); }
  };
  el.addEventListener('submit', submit); el.addEventListener('click', click); el.addEventListener('keydown', key);
  const unInfo = wireInfo(el, () => o.resized?.()), unWidth = watchWidth(el, () => o.resized?.());
  void bridge.loadDoc<NotesDoc>('notes').then(doc => { items = cleanNotes(doc); loaded = true; render(); }).catch(err => { loaded = true; o.report(String(err)); render(); });
  const stop = bridge.onDoc(c => { if (c.name === 'notes' && !editing && !timing) { items = cleanNotes(c.doc); render(); } });
  // A to-do's time passing turns it "late"; looked at once a minute.
  const minute = setInterval(() => { if (!editing && !timing && items.some(x => x.due && !x.done)) render(); }, 60_000);
  render();
  return {
    /** The height this page needs now (CSS px): what it shows, at its natural height. */
    height(): number | null { return pageNeeds(root); },
    dispose() { clearInterval(minute); unInfo(); unWidth(); el.removeEventListener('submit', submit); el.removeEventListener('click', click); el.removeEventListener('keydown', key); void stop.then(f => f()); },
  };
}
