import { locale } from '../i18n';
import type { Translate } from '../i18n';
import type { Bridge, ShelfFile } from '../shared/contract';
import { escapeHtml as e } from '../ui/state';
import { icon } from '../ui/icons';
import { iconButton, pageNeeds, primary, quiet, watchWidth } from './kit';

/** The shelf as kept: the paths dropped on it (references only; the files stay where they are). */
export interface ShelfDoc { items: { path: string; added: number }[] }
export const MAX_SHELF = 60;
export function cleanShelf(raw: unknown): ShelfDoc['items'] {
  const items = (raw as ShelfDoc | null)?.items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  return items.filter(x => x && typeof x.path === 'string' && x.path.length < 1024 && !seen.has(x.path) && seen.add(x.path)).slice(0, MAX_SHELF).map(x => ({ path: x.path, added: Number(x.added) || Date.now() }));
}
/** A file's size in the page's language ("2,3 MB" in Turkish). */
export const sizeText = (n: number, locale = 'tr-TR') => { const f = (x: number, d: number) => x.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d }); return n < 1024 ? `${n} B` : n < 1048576 ? `${f(n / 1024, 0)} KB` : n < 1073741824 ? `${f(n / 1048576, 1)} MB` : `${f(n / 1073741824, 1)} GB`; };
/** A file's kind by its extension: the short label on its tile and the tile's colour. */
export function fileKind(name: string, folder = false): { label: string; tone: string } {
  if (folder) return { label: '', tone: '#ffc04d' };
  const ext = (name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? '').toLowerCase();
  const tone = /^(pdf)$/.test(ext) ? '#ff6b6b' : /^(png|jpe?g|gif|webp|bmp|svg|heic|ico)$/.test(ext) ? '#7fdca4' : /^(docx?|odt|rtf|txt|md)$/.test(ext) ? '#6cb4ff' : /^(xlsx?|csv|ods)$/.test(ext) ? '#4cd38a' : /^(pptx?|key|odp)$/.test(ext) ? '#ff9f5a' : /^(zip|rar|7z|tar|gz)$/.test(ext) ? '#d8b4ff' : /^(mp4|mov|mkv|avi|webm|mp3|wav|m4a|flac)$/.test(ext) ? '#ff7ac6' : '#9aa3b2';
  return { label: ext.toUpperCase().slice(0, 4), tone };
}

/**
 * The file shelf: files kept close at hand to drag into another app (a chat, a mail, a form). The
 * use is shown before anything is on it: drop a file here, switch to the app, drag it from the
 * shelf. Files come by dropping them on the island or with "Dosya seç" (Windows' own dialog); the
 * drop target lights up while files are over it and the page says what was added. A file is a
 * tile with its kind, name and size; dragging it takes it out with Windows' own drag (a copy or a
 * link; the file itself is never moved), a click opens it, the folder button shows it in Explorer.
 * "Raftan kaldır" only takes it off the shelf (the file stays where it is, and the page says so,
 * with a way back). A file moved or deleted since is shown as gone.
 */
export function createShelfPage(el: HTMLElement, bridge: Bridge, o: { l: Translate; report: (text: string) => void; resized?: () => void }) {
  const { l } = o;
  let items: ShelfDoc['items'] = [], info = new Map<string, ShelfFile>(), loaded = false, over = false, picking = false, fresh = new Set<string>();
  let note: { text: string; undo?: ShelfDoc['items']; error?: boolean; openWith?: string } | null = null, noteTimer: ReturnType<typeof setTimeout> | undefined;
  el.innerHTML = `<div class="pg shelf-page"><div class="shelf-intro"><p class="shelf-lead">${e(l('shelf.gather_files_from_different_folders'))}</p>`
    + `<ol class="shelf-flow"><li>${icon('inbox', 16)}<span>${e(l('shelf.drop_your_file'))}</span></li><li aria-hidden="true" class="sf-arrow">${icon('chevR', 14)}</li><li>${icon('window', 16)}<span>${e(l('shelf.switch_to_the_app'))}</span></li><li aria-hidden="true" class="sf-arrow">${icon('chevR', 14)}</li><li>${icon('hand', 16)}<span>${e(l('shelf.drag_it_from_the_shelf'))}</span></li></ol></div>`
    + `<div class="pg-bar shelf-bar"><span class="shelf-count"></span><small class="shelf-hint">${icon('hand', 12)}${e(l('shelf.drag_into_an_app_click'))}</small><span class="pg-spacer"></span>${quiet('shelf-clear', l('shelf.clear_the_shelf'), 'trash', `title="${e(l('shelf.takes_them_all_off_the'))}"`)}</div>`
    + `<ul class="shelf-grid" role="list"></ul><div class="shelf-drop"></div><p class="shelf-note" role="status" hidden></p>`
    + `<p class="pg-foot shelf-foot">${icon('lock', 12)}<span>${e(l('shelf.the_shelf_only_remembers_where'))}</span></p></div>`;
  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const root = q('.shelf-page');
  const save = (next: ShelfDoc['items']) => { const before = items; items = next; render(); void bridge.saveDoc('shelf', { items: next }).catch(err => { items = before; render(); fail(err); }); };
  const refresh = async () => { try { (await bridge.shelfInfo(items.map(x => x.path))).forEach(f => info.set(f.path, f)); } catch { /* shown as unknown */ } render(); };
  // One message at a time, in its own line under the files (it covers nothing): what was done, or
  // what went wrong. It closes by itself after a few seconds or with its ×; the next action replaces it.
  const say = (text: string, undo?: ShelfDoc['items'], error = false) => { note = { text, undo, error }; clearTimeout(noteTimer); noteTimer = setTimeout(() => { note = null; fresh.clear(); render(); }, undo || error ? 6000 : 3500); render(); };
  const fail = (err: unknown) => say(err instanceof Error ? err.message : String(err), undefined, true);
  // The default app could not open it: the reason in full, and another app offered (Windows' "open with").
  const failOpen = (path: string, err: unknown) => { fail(err); if (note && !/bulunamadı/.test(note.text)) { note.openWith = path; clearTimeout(noteTimer); noteTimer = setTimeout(() => { note = null; render(); }, 12000); render(); } };
  const hush = () => { if (note) { clearTimeout(noteTimer); note = null; render(); } };
  const nameOf = (path: string) => info.get(path)?.name ?? path.split(/[\\/]/).pop() ?? path;
  function render() {
    const shown = [...items].sort((a, b) => b.added - a.added), empty = !items.length;
    root.classList.toggle('is-empty', empty); root.classList.toggle('drag-over', over);
    q('.shelf-intro').hidden = !empty; q('.shelf-bar').hidden = empty;
    q('.shelf-count').textContent = l('shelf.file_count', { n: items.length });
    const html = shown.map(x => {
      const f = info.get(x.path), gone = f && !f.exists, name = nameOf(x.path), kind = fileKind(name, f?.folder);
      return `<li class="shelf-tile${gone ? ' gone' : ''}${fresh.has(x.path) ? ' fresh' : ''}" data-path="${e(x.path)}" ${gone ? '' : 'draggable="true"'} title="${e(gone ? x.path : `${x.path}\n${l('shelf.drag_drop_into_an_app')}`)}" style="--tone:${kind.tone}"><span class="st-kind">${f?.folder ? icon('folder', 20) : `${icon('file', 22)}<em>${e(kind.label)}</em>`}</span><span class="st-text"><b>${e(name)}</b><small>${e(gone ? l('shelf.not_found_moved_or_deleted') : f ? (f.folder ? l('shelf.folder') : sizeText(f.size, locale())) : '')}</small></span><span class="st-actions">${gone ? '' : iconButton('st-reveal', 'folder', l('shelf.show_in_its_folder'))}${iconButton('st-remove', 'close', l('shelf.take_off_the_shelf_the'))}</span></li>`;
    }).join('');
    const grid = q('.shelf-grid'); if (grid.innerHTML !== html) grid.innerHTML = html; grid.hidden = empty;
    const drop = over
      ? `<span class="pg-art">${icon('inbox', 22)}</span><b>${e(l('shelf.release_to_add_it'))}</b>`
      : empty
        ? `<span class="pg-art">${icon('file', 22)}</span><b>${e(l('shelf.drop_files_here'))}</b><span class="sd-or">${e(l('shelf.or'))}</span>${primary('shelf-pick', picking ? l('shelf.choosing') : l('shelf.choose_files'), 'plus', picking ? 'disabled' : '')}`
        : `<span class="sd-line">${icon('inbox', 14)}${e(l('shelf.drop_a_file_here_to'))}</span>${quiet('shelf-pick', picking ? l('shelf.choosing') : l('shelf.choose_files'), 'plus', picking ? 'disabled' : '')}`;
    const d = q('.shelf-drop'); if (d.innerHTML !== drop) d.innerHTML = drop;
    const n = q('.shelf-note'); n.hidden = !note; n.classList.toggle('error', !!note?.error);
    const nh = note ? `${icon(note.error ? 'info' : 'check', 13)}<span>${e(note.text)}</span>${note.undo ? `<button type="button" class="shelf-undo">${e(l('shelf.undo'))}</button>` : ''}${note.openWith ? `<button type="button" class="shelf-undo shelf-openwith">${e(l('shelf.open_with_another_app'))}</button>` : ''}<button type="button" class="pg-icon shelf-note-close" title="${e(l('shelf.close'))}" aria-label="${e(l('shelf.close'))}">${icon('close', 12)}</button>` : '';
    if (n.innerHTML !== nh) n.innerHTML = nh;
    o.resized?.();
  }
  /** Files dropped on the island or picked (paths), put on the shelf; the page says how many. */
  const add = (paths: string[]) => {
    const now = Date.now(), have = new Set(items.map(x => x.path));
    const added = [...new Set(paths)].filter(p => p && !have.has(p)).map((path, i) => ({ path, added: now + i }));
    if (!added.length) { if (paths.length) say(l('shelf.that_file_is_on_the')); return; }
    const next = [...added, ...items].slice(0, MAX_SHELF);
    if (items.length + added.length > MAX_SHELF) o.report(l('shelf.the_shelf_keeps_at_most', { MAX_SHELF }));
    fresh = new Set(added.map(x => x.path));
    save(next); say(added.length === 1 ? l('shelf.is_on_the_shelf', { nameOf: nameOf(added[0].path) }) : l('shelf.files_are_on_the_shelf', { length: added.length })); void refresh();
  };
  const pick = () => {
    if (picking) return; picking = true; render();
    hush(); void bridge.shelfPick().then(add).catch(fail).finally(() => { picking = false; render(); });
  };
  const click = (ev: MouseEvent) => {
    const t = ev.target as Element;
    if (t.closest('.shelf-note-close')) { hush(); return; }
    if (t.closest('.shelf-openwith') && note?.openWith) { const p = note.openWith; hush(); picking = true; render(); void bridge.shelfOpenWith(p).catch(fail).finally(() => { picking = false; render(); }); return; }
    if (t.closest('.shelf-pick')) { pick(); return; }
    if (t.closest('.shelf-undo') && note?.undo) { const back = note.undo; note = null; save(back); void refresh(); return; }
    if (t.closest('.shelf-clear')) { const before = items; save([]); say(l('shelf.the_shelf_is_empty_the'), before); return; }
    const li = t.closest<HTMLElement>('.shelf-tile'); if (!li || !loaded) return;
    const path = li.dataset.path!;
    if (t.closest('.st-remove')) { const before = items; save(items.filter(x => x.path !== path)); say(l('shelf.is_off_the_shelf_the', { nameOf: nameOf(path) }), before); }
    else if (t.closest('.st-reveal')) { hush(); void bridge.shelfReveal(path).catch(err => { fail(err); void refresh(); }); }
    else if (!li.classList.contains('gone')) { hush(); void bridge.shelfOpen(path).catch(err => { failOpen(path, err); void refresh(); }); }
  };
  // Dragging a file out: Windows' own drag takes over (the island's own drag is stopped).
  const dragStart = (ev: DragEvent) => {
    const li = (ev.target as Element).closest<HTMLElement>('.shelf-tile'); if (!li || li.classList.contains('gone')) return;
    ev.preventDefault(); li.classList.add('dragging');
    hush(); void bridge.shelfDrag([li.dataset.path!]).then(dropped => { if (dropped) say(l('shelf.was_dropped', { nameOf: nameOf(li.dataset.path!) })); return refresh(); }).catch(fail).finally(() => li.classList.remove('dragging'));
  };
  el.addEventListener('click', click); el.addEventListener('dragstart', dragStart);
  const unWidth = watchWidth(el, () => o.resized?.());
  void bridge.loadDoc<ShelfDoc>('shelf').then(doc => { items = cleanShelf(doc); loaded = true; render(); void refresh(); }).catch(err => { loaded = true; o.report(String(err)); render(); });
  const stop = bridge.onDoc(c => { if (c.name === 'shelf') { items = cleanShelf(c.doc); void refresh(); } });
  render();
  return {
    add,
    /** A drag with files is over the island (the drop target is shown). */
    dragOver(on: boolean) { if (over !== on) { over = on; render(); } },
    /** Seen again: whether each file is still there is looked at again. */
    refresh,
    /** Windows' file dialog (or its "open with") is open from here: the island stays open meanwhile. */
    get picking() { return picking; },
    height(): number | null { return pageNeeds(root); },
    dispose() { clearTimeout(noteTimer); unWidth(); el.removeEventListener('click', click); el.removeEventListener('dragstart', dragStart); void stop.then(f => f()); },
  };
}
