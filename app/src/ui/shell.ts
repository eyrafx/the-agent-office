import { ago as relativeAgo, fromApp, language, locale as localeTag, resolveLanguage, setLanguage, t, type MessageKey } from '../i18n';
/** Set just before the window reloads for a new language: the settings open again. */
const REOPEN_SETTINGS = 'agentoffice-reopen-settings';
import type { Bridge, Snapshot, SessionKey, PendingRequest, WorkEntry } from '../shared/contract';
import { isNative } from '../shared/bridge';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { sessionId, requestId } from '../shared/contract';
import { floorOf, projectOfficeFrame } from '../office/projection';
import { carriedManagers, counts as countPeople, entryOfficeKey, groupName, managerChoice, managerOf, officeKey, people, projectOffices, shortName, type Person, type ProjectOffice } from '../shared/people';
import { createOfficeScene, type Ambient, type Rect } from '../office/scene';
import { createStillMascot } from '../mascot/still';
import { BOARD_DAYS, officeFeed, workBoard } from '../office/feed';
import { escapeHtml as e, watchSnapshot } from './state';
import { icon, mark } from './icons';
import { readPreferences, savePreferences } from './preferences';
import { createSettingsPanel } from './settings-panel';
import { mountFirstRun } from './first-run';
import { mountLinkNotice } from './link-notice';
import { mountManagerOffer, wantsOffer } from './manager-offer';
import { createManagerPicker, type ManagerValue } from './manager-picker';
import { createAskForms } from './ask-form';
import type { Settings } from '../shared/contract';
import './styles.css';
import './offices.css';
type Panel = 'sessions' | 'activity' | 'history' | 'diff';

/**
 * The office window: a thin control strip (office, view, projects, list,
 * settings) over a scene that fills the window. Lists, history, changes and
 * settings open in a drawer only when asked for; a worker's details open in a
 * small card next to them.
 */
export function mountOffice(root: HTMLElement, bridge: Bridge): { dispose(): void } {
  const prefs = readPreferences(); let snapshot: Snapshot | undefined, selected: string | undefined, search = '', disposed = false;
  let panel: Panel | undefined;
  if (!isNative()) try { const key = JSON.parse(localStorage.getItem('agentoffice-selection') || 'null'); if (key) selected = sessionId(key); } catch { /* Ignore malformed browser preview selection. */ }
  // One office per project, within one AI tool (or all of them): the offices of the
  // chosen tool are tabs at the bottom right, or side by side.
  type Layout = 'focus' | 'split';
  const stored = (() => { try { return JSON.parse(localStorage.getItem('agentoffice-offices') || '{}'); } catch { return {}; } })();
  let office: string = typeof stored.office === 'string' ? stored.office : '', layout: Layout = stored.layout === 'split' ? 'split' : 'focus';
  const chosenProject: Record<string, string> = stored.projects && typeof stored.projects === 'object' ? stored.projects : {};
  const remember = () => { try { localStorage.setItem('agentoffice-offices', JSON.stringify({ office, layout, projects: chosenProject })); } catch { /* Preference only. */ } };
  // Once per office with agents and no manager: would the user like one (manager-offer.ts).
  let managerOffer: ReturnType<typeof mountManagerOffer> | undefined;
  setLanguage(resolveLanguage(prefs.language)); const l = t;
  // How a chat opens, as its provider says (open): the chat itself, or only its tool's window.
  const openLabel = (s: { key: { provider: string }; open?: 'exact' | 'app' }) => s.open === 'app' ? l('office.show_tool_window', { tool: providerName(s.key.provider) }) : s.key.provider === 'claude' ? l('office.open_in_claude') : s.key.provider === 'codex' ? l('office.open_in_codex') : l('office.open_in_tool', { tool: providerName(s.key.provider) });
  const providerName = (provider: string) => provider === 'codex' ? 'Codex' : provider === 'claude' ? 'Claude' : provider.charAt(0).toLocaleUpperCase(localeTag()) + provider.slice(1);
  // Who works now (green), who waits for the user (orange badge); the rest only in the tooltip.
  const liveCounts = (list: Person[]) => { const working = list.filter(x => x.state === 'working').length, waiting = list.filter(x => x.state === 'waiting').length; return `${working ? ` <small class="live-count" title="${e(l('office.working'))}"><i></i>${working}</small>` : ''}${waiting ? `<i class="strip-badge" title="${e(l('office.waiting_for_you'))}">${waiting}</i>` : ''}`; };
  const countsTitle = (list: Person[]) => { const c = countPeople(list); return [l('office.working_2', { working: c.working }), l('office.waiting', { waiting: c.waiting }), l('office.idle', { idle: c.idle }), c.unverified ? l('office.state_unknown', { unverified: c.unverified }) : '', l('office.past', { history: c.history })].filter(Boolean).join(' · '); };
  const offices = (): string[] => [...new Set<string>([...(snapshot?.connections || []).map(c => c.provider), ...(snapshot?.sessions || []).map(s => s.key.provider)])];
  const statusLabel = (status: string) => ({ working: l('office.working_3'), waiting: l('office.waiting_for_you_2'), idle: l('office.idle_2'), unverified: l('office.current_state_unknown'), history: l('office.past_2'), ended: l('office.closed'), replyEnded: l('office.replied'), interrupted: l('office.interrupted'), error: l('office.error'), unknown: l('office.current_state_unknown') })[status] || status;
  let crowd: Person[] = [], carried = false;
  const personOf = (id: string | undefined) => crowd.find(p => sessionId(p.session.key) === id);
  const requestMap = new Map<string, PendingRequest>(); const sending = new Set<string>();
  // The work board's lines (kept by the app, 30 days), each with the office it was written
  // in; and the day each office's board shows when it is not today.
  const workLog = new Map<string, WorkEntry & { officeKey: string }>(); const boardDay: Record<string, string> = {};
  const addLines = (lines: WorkEntry[]) => { const oldest = Date.now() - BOARD_DAYS * 86_400_000; for (const line of lines) if (line.at >= oldest) workLog.set(line.id, { ...line, officeKey: entryOfficeKey(line) }); };
  const linesOf = (key: string) => [...workLog.values()].filter(line => line.officeKey === key);

  root.innerHTML = `<div class="office-app"><header class="strip"><span class="strip-mascot" title="AgentOffice"></span><div class="strip-seg strip-offices" role="group"></div><div class="strip-seg strip-layout" role="group"><button data-layout="focus"></button><button data-layout="split"></button></div><span class="strip-spacer"></span><span class="strip-mode" hidden></span><button class="strip-icon" data-panel="sessions">${icon('list', 18)}</button><button class="strip-icon" data-open-settings>${icon('gear', 18)}</button></header><main class="stage"><div class="scene-layer"></div><div class="office-grid" hidden></div><div class="empty-office" hidden></div><nav class="office-tabs" hidden></nav><div class="tabs-menu" hidden></div><form class="office-rename" hidden><label></label><input maxlength="40"><button type="submit"></button><button type="button" data-rename-cancel></button></form><article class="person-card" hidden></article></main><aside class="drawer" hidden><header class="drawer-head"><nav class="drawer-tabs"></nav><button class="drawer-close" data-close-drawer aria-label="×">×</button></header><div class="drawer-body"></div></aside><div class="toast" role="status" aria-live="polite" hidden></div></div>`;
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  // The mascot in the corner blinks and waves like the notch's.
  const logo = createStillMascot(q('.strip-mascot'), prefs.reducedMotion);
  const toast = (text: string) => { if (disposed) return; const box = q<HTMLElement>('.toast'); box.textContent = fromApp(text); box.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { box.hidden = true; }, 5000); };
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  // The demo office's changes are refused by the app (its people are not the user's): said plainly.
  const action = async (work: () => Promise<unknown>) => { try { await work(); } catch (err) { toast(String(err) === 'demo' ? l('office.demo_not_kept') : String(err)); } };
  // A waiting question in full, answered here when its hook waits (ask-form.ts); countdowns once a second.
  const askForms = createAskForms({ l: () => l, bridge, report: toast, changed: () => { renderCard(); if (panel === 'activity') renderDrawer(); }, demo: () => snapshot?.mode === 'demo' });
  const askTimer = setInterval(() => askForms.tick(root), 1000);
  const STATE_COLOR: Record<string, string> = { working: '#3fcf7a', waiting: '#ff7a1a', idle: '#7a8cff', unverified: '#a3a6b8', history: '#c9c6d6', ended: '#a3a6b8' };
  // An office's manager as the user sets it: a chat, none ('') or automatic (no entry). Only that office changes.
  const setManager = (home: string, value: ManagerValue) => {
    const next = { ...(snapshot?.managers ?? {}) };
    if (value === null) delete next[home]; else next[home] = value;
    return action(async () => { await bridge.setOfficeManagers(next); toast(value === null ? l('office.manager_now_automatic') : value ? l('office.now_this_office_s_manager') : l('office.this_office_has_no_manager')); });
  };
  const managerPicker = createManagerPicker(root, { l: () => l, name: p => shortName(p.session), color: p => STATE_COLOR[p.state], set: setManager });
  const openManagerPicker = (home: string, at?: Rect) => {
    const o = projectOffices(crowd, snapshot?.officeNames).find(x => x.key === home); if (!o || !snapshot) return;
    selected = undefined; cardAt = undefined; renderCard();
    managerPicker.open(o, managerChoice(snapshot, o), snapshot.managers?.[home] !== undefined, at);
  };
  // The card opens over the wall above the chosen worker; where they are comes from the office itself.
  let cardAt: Rect | undefined;
  const choose = (id: string | undefined, rect?: Rect) => { selected = id; cardAt = rect; render(); if (id && !rect) void locate(id); };
  // In the office: the body (or desk) opens the chat in its own app at once; the balloon opens the
  // card (a waiting question in full, to answer); the right button opens the card with its menu
  // (renaming, manager). Without a known way to the chat, the body opens the card too.
  const pick = (id: string | undefined, rect?: Rect, part?: 'balon' | 'govde' | 'menu') => {
    const p = id ? personOf(id) : undefined;
    if (p && part === 'govde' && p.session.open) {
      selected = undefined; cardAt = undefined; render();
      void action(async () => { if (!await bridge.openInSource(p.session.key.sessionId)) { toast(l('office.this_chat_has_no_known')); choose(id, rect); } });
      return;
    }
    choose(id, rect);
  };
  const locate = async (id: string) => { const p = personOf(id); const rect = p && await sceneOf(p)?.where(id); if (selected === id && rect) { cardAt = rect; renderCard(); } };
  const sceneEvents = { select: pick, escape: () => key(new KeyboardEvent('keydown', { key: 'Escape' })) };

  // Scenes: one per floor of each project office, kept while it exists, so going
  // back to an office, a floor or a tool does not rebuild it. Side by side has its
  // own cells (moving a frame in the page would reload it), one per office.
  type Scene = { card: HTMLElement; scene: ReturnType<typeof createOfficeScene> };
  type Cell = { card: HTMLElement; label: HTMLElement; floors: Map<string, Scene>; shown: string };
  const tabsScenes = new Map<string, Scene>(), grid = new Map<string, Cell>();
  /** The floor shown of each office (0: ground floor). */
  const floors: Record<string, number> = {};
  let shownKey = '', officesNow: ProjectOffice[] = [], moreOpen = false;
  const scopeOf = () => office || 'all';
  const sceneOf = (p: Person) => { const key = officeKey(p.session); return layout === 'split' ? grid.get(key)?.floors.get(String(floors[key] ?? 0))?.scene : tabsScenes.get(shownKey)?.scene; };
  // While the office window is hidden its scenes draw nothing (they ran at full frame rate unseen).
  let officeHidden = false;
  const pauseScenes = (hidden: boolean) => { officeHidden = hidden; if (!hidden) void readAround(); tabsScenes.forEach(x => x.scene.pause(hidden)); grid.forEach(cell => cell.floors.forEach(x => x.scene.pause(hidden))); };
  if (isNative()) { void invoke<boolean>('office_visible').then(v => pauseScenes(!v)).catch(() => {}); void listen<boolean>('office-visible', event => pauseScenes(!event.payload)).then(off => { if (disposed) off(); else stopVisible = off; }); }
  let stopVisible: (() => void) | undefined;
  // The office window's weather and daylight: the island's own weather reading (Open-Meteo, the city
  // in Settings) when it is on and recent, else none (day and night only, never a guess). Read when
  // the office is shown, on settings changes and every ten minutes while it is seen.
  let around: Ambient = { kod: null, enlem: null, boylam: null, sakin: prefs.reducedMotion, etiket: '' };
  const pushAround = () => { tabsScenes.forEach(x => x.scene.ambient(around)); grid.forEach(cell => cell.floors.forEach(x => x.scene.ambient(around))); };
  const sky = (code: number) => code <= 1 ? 'clear' : code === 2 ? 'partly_cloudy' : code === 3 ? 'overcast' : code === 45 || code === 48 ? 'fog' : (code >= 51 && code <= 67) || (code >= 80 && code <= 82) ? 'rain' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : code >= 95 ? 'thunderstorm' : 'clear';
  const readAround = async () => {
    try {
      const [st, s] = await Promise.all([bridge.status(), bridge.getSettings()]);
      const w = s.statusWeather && st.weather && Date.now() - st.weather.at < 3 * 3600_000 ? st.weather : null;
      around = { kod: w ? w.code : null, enlem: s.weatherPlace?.latitude ?? null, boylam: s.weatherPlace?.longitude ?? null, sakin: s.reducedMotion, etiket: w ? l('ofis.window_weather', { place: w.place, sky: l(`ofis.sky_${sky(w.code)}` as MessageKey) }) : '' };
      pushAround();
    } catch { /* Read again later. */ }
  };
  const aroundTimer = setInterval(() => { if (!officeHidden) void readAround(); }, 600_000);
  // Some of the office follows the clock without news from the chats: a side chat leaves a little
  // after its reply, someone resting dozes off, a quiet chat becomes past.
  const clockTimer = setInterval(() => { if (!officeHidden) render(); }, 60_000);
  void readAround();
  // A new reading (or weather turned on or off) shows in the window at once; battery and sound changes come here too, the weather rarely.
  let lastSky = '';
  const stopSky = bridge.onStatus(st => { const now = JSON.stringify(st.weather ?? null); if (now !== lastSky) { lastSky = now; void readAround(); } });
  const sceneIn = (map: Map<string, Scene>, key: string, parent: HTMLElement, cls: string, home: string) => {
    let entry = map.get(key);
    // The wall board asks for another day of its own office; a line's chat opens in its app on a click.
    const board = { day: (day: string | null) => { if (day) boardDay[home] = day; else delete boardDay[home]; renderScenes(); }, source: (id: string) => void action(async () => { if (!await bridge.openInSource(id)) toast(l('office.this_chat_has_no_known_2')); }),
      // The big desk clicked: the picker beside it; a chat dropped on it: that chat is the manager.
      managerDesk: (at?: Rect) => openManagerPicker(home, at), makeManager: (id: string) => { const p = personOf(id); if (p && !p.session.parentKey) void setManager(home, p.session.key.sessionId); } };
    if (!entry) { const card = document.createElement('section'); card.className = cls; parent.append(card); entry = { card, scene: createOfficeScene(card, { ...sceneEvents, ...board }) }; entry.scene.ambient(around); if (officeHidden) entry.scene.pause(true); map.set(key, entry); }
    return entry;
  };
  // A tool's mark; "Tümü" shows both tools' marks.
  const toolTile = (p: string) => p === 'claude' ? `<span class="strip-tile claude">${mark('claude', 12)}</span>` : p === 'codex' ? `<span class="strip-tile codex">${mark('openai', 12)}</span>`
    : `<span class="strip-tile all"><i class="claude">${mark('claude', 9)}</i><i class="codex">${mark('openai', 9)}</i></span>`;

  const matches = (p: Person) => !search || `${p.session.name} ${p.session.project} ${p.activity}`.toLocaleLowerCase(localeTag()).includes(search.toLocaleLowerCase(localeTag()));
  // The limits of the office's provider go on its wall; "Tümü" shows Claude's.
  const limitsOf = (provider: string) => snapshot?.limits?.find(x => x.provider === (provider || 'claude'));
  const teamTitle = (o: ProjectOffice) => l('office.team_named', { name: o.name.toLocaleUpperCase(localeTag()) });
  const ago = (at: number) => relativeAgo(at);

  function renderStrip() {
    if (!snapshot) return;
    const all = offices();
    const tally = (p: string) => crowd.filter(x => (!p || x.session.key.provider === p) && x.state !== 'ended');
    const button = (p: string, name: string) => { const list = tally(p), on = office === p; return `<button class="${on ? 'on' : ''}" data-office="${e(p)}" aria-pressed="${on}" title="${e(countsTitle(list))}">${toolTile(p)}${e(name)}${liveCounts(list)}</button>`; };
    q('.strip-offices').innerHTML = all.map(p => button(p, providerName(p))).join('') + button('', l('office.all'));
    q('[data-layout="focus"]').textContent = l('office.one_office'); q('[data-layout="split"]').textContent = l('office.side_by_side');
    root.querySelectorAll<HTMLElement>('[data-layout]').forEach(b => { b.classList.toggle('on', b.dataset.layout === layout); b.setAttribute('aria-pressed', String(b.dataset.layout === layout)); });
    const mode = q<HTMLElement>('.strip-mode');
    mode.hidden = !(snapshot.mode === 'demo' || !snapshot.connections.some(c => c.status === 'connected'));
    mode.textContent = snapshot.mode === 'demo' ? l('office.demo_office') : l('office.source_not_verified');
    mode.classList.toggle('demo', snapshot.mode === 'demo');
    q('[data-panel="sessions"]').title = l('office.list_requests_and_history'); q('[data-panel="sessions"]').setAttribute('aria-label', l('office.list')); q('[data-open-settings]').title = l('office.settings'); q('[data-open-settings]').setAttribute('aria-label', l('office.settings'));
  }

  // Side by side: columns or rows, whichever gives each office the larger scene.
  function arrange(count: number) {
    const box = q<HTMLElement>('.office-grid'), { width, height } = q('.stage').getBoundingClientRect();
    const n = Math.max(1, count), cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    const fit = (c: number, r: number) => Math.min(width / c / 1920, height / r / 1080);
    const [c, r] = n === 1 ? [1, 1] : fit(cols, rows) >= fit(rows, cols) && fit(cols, rows) > fit(1, n) ? [cols, rows] : fit(1, n) >= fit(n, 1) ? [1, n] : [n, 1];
    box.style.gridTemplateColumns = `repeat(${c},minmax(0,1fr))`; box.style.gridTemplateRows = `repeat(${r},minmax(0,1fr))`;
  }
  // Tabs that do not fit (the bar stays within about two thirds of the window) go
  // into "Diğer"; the office shown always keeps its tab.
  function fitTabs(current?: string) {
    const tabs = q<HTMLElement>('.office-tabs'), menu = q<HTMLElement>('.tabs-menu'), more = q<HTMLElement>('.office-tabs [data-more]');
    const limit = Math.max(360, q('.stage').clientWidth * .64), hidden: ProjectOffice[] = [];
    const buttons = [...tabs.querySelectorAll<HTMLElement>('[data-project]')];
    for (let i = buttons.length - 1; i >= 0 && tabs.scrollWidth > limit; i--) {
      if (buttons[i].dataset.project === current) continue;
      buttons[i].hidden = true; hidden.unshift(officesNow.find(o => o.key === buttons[i].dataset.project)!);
      const waiting = hidden.reduce((n, o) => n + o.waiting, 0);
      more.hidden = false; more.innerHTML = `${l('office.more')} <small>${hidden.length}</small>${waiting ? `<i class="strip-badge">${waiting}</i>` : ''} ▾`;
    }
    if (!hidden.length) moreOpen = false;
    more.classList.toggle('on', moreOpen);
    menu.hidden = !moreOpen;
    menu.innerHTML = hidden.map(o => `<button data-project="${e(o.key)}">${officeLabel(o)}</button>`).join('');
  }
  // How an office is named on its tab: in "Tümü" with its tool's mark; the number is
  // how many work now (the chats on record are in the tooltip, not counted as workers).
  const officeLabel = (o: ProjectOffice) => `${office ? '' : toolTile(o.provider)}${e(o.name)}${liveCounts(o.people)}`;
  function renderScenes() {
    if (!snapshot) return;
    const split = layout === 'split';
    officesNow = projectOffices(crowd.filter(x => !office || x.session.key.provider === office), snapshot.officeNames);
    {
      const done = managerOffer?.asked() ?? [], current = officesNow.find(o => o.key === chosenProject[scopeOf()]) ?? officesNow[0];
      managerOffer?.show((split ? officesNow : [current]).find(o => wantsOffer(o, !!(o && managerOf(snapshot!, o)), snapshot!.mode === 'live', setupDone, done)));
    }
    const layer = q<HTMLElement>('.scene-layer'), box = q<HTMLElement>('.office-grid'), tabs = q<HTMLElement>('.office-tabs');
    const back = (split ? box.hidden : layer.hidden) === true;
    layer.hidden = split; box.hidden = !split;
    // An office of another tool is kept for when the user comes back to that tool.
    const gone = (key: string) => (!office || key.startsWith(`${office}:`)) && !officesNow.some(o => o.key === key);
    const frameOf = (o: ProjectOffice) => { const frame = projectOfficeFrame(o.people, (snapshot!.mode === 'demo' ? 'demo:' : '') + o.key, floors[o.key] ?? 0, matches, undefined, managerOf(snapshot!, o)?.session.key.sessionId); floors[o.key] = frame.page; return frame; };
    type Frame = ReturnType<typeof projectOfficeFrame>;
    const feedFor = (o: ProjectOffice, frame: Frame) => officeFeed(frame, o.people.filter(matches), { title: frame.pages > 1 ? `${teamTitle(o)} · ${frame.page + 1}. ${l('office.floor')}` : teamTitle(o), limits: limitsOf(o.provider), l, manager: managerOf(snapshot!, o)?.session.key.sessionId, board: workBoard(linesOf(o.key), boardDay[o.key], o.name, l) });
    // More people than desks: the office has floors (14 desks each), the ground floor for the most active.
    const floorButtons = (o: ProjectOffice, frame: Frame) => frame.pages > 1 ? `<span class="tabs-floors" title="${e(l('office.people_in_this_office_14', { length: o.people.length }))}">${Array.from({ length: frame.pages }, (_, i) => `<button data-floor="${e(o.key)}|${i}" class="${i === frame.page ? 'on' : ''}" aria-pressed="${i === frame.page}">${i + 1}. ${l('office.floor_2')}</button>`).join('')}</span>` : '';
    const dispose = (map: Map<string, Scene>, k: string) => { const entry = map.get(k)!; entry.scene.dispose(); entry.card.remove(); map.delete(k); };
    if (!split) {
      // The office shown: the one chosen for this tool; without a choice the latest active,
      // which is then kept, so new activity elsewhere never switches the office being viewed
      // (it shows as counts and badges on the tabs).
      const current = officesNow.find(o => o.key === chosenProject[scopeOf()]) ?? officesNow[0];
      if (current && !chosenProject[scopeOf()]) { chosenProject[scopeOf()] = current.key; remember(); }
      const frame = current && frameOf(current), before = shownKey, shown = current && frame ? `${current.key}#${frame.page}` : '';
      for (const k of [...tabsScenes.keys()]) { const [base, floor] = k.split('#'); if (gone(base) || (base === current?.key && Number(floor) >= frame!.pages)) dispose(tabsScenes, k); }
      if (current && frame) {
        const entry = sceneIn(tabsScenes, shown, layer, 'office-cell', current.key);
        // A hidden office is not fed: shown again, it opens as it is now.
        entry.scene.update(feedFor(current, frame), selected ?? glow, back || before !== shown);
        for (const [k, other] of tabsScenes) other.card.hidden = k !== shown;
        // Switching offices (or floors) slides the new one in from the side of its tab.
        const [was, wasFloor] = before.split('#'), from = was === current.key ? Number(wasFloor) : officesNow.findIndex(o => o.key === was);
        if (before && before !== shown && from >= 0) {
          const to = was === current.key ? frame.page : officesNow.indexOf(current);
          entry.card.classList.remove('slide-left', 'slide-right'); void entry.card.offsetWidth; entry.card.classList.add(to > from ? 'slide-left' : 'slide-right');
        }
      }
      shownKey = shown;
      tabs.hidden = !officesNow.length;
      tabs.innerHTML = `<span class="tabs-label">${l('office.offices')}</span>${officesNow.map(o => `<button class="${current === o ? 'on' : ''}" data-project="${e(o.key)}" title="${e(o.people[0]?.session.root || o.people[0]?.session.project || o.name)}">${officeLabel(o)}</button>`).join('')}<button data-more hidden></button>${current ? `<button class="tabs-edit" data-rename-office="${e(current.key)}" title="${e(l('office.rename_this_office'))}" aria-label="${e(l('office.rename_office'))}">${icon('edit', 14)}</button>` : ''}${current && frame ? floorButtons(current, frame) : ''}`;
      fitTabs(current?.key);
    } else {
      tabs.hidden = true; q<HTMLElement>('.tabs-menu').hidden = true; moreOpen = false;
      arrange(officesNow.length);
      for (const [k, cell] of [...grid]) if (gone(k)) { for (const f of [...cell.floors.keys()]) dispose(cell.floors, f); cell.card.remove(); grid.delete(k); }
      for (const [k, cell] of grid) cell.card.hidden = !officesNow.some(o => o.key === k);
      officesNow.forEach((o, i) => {
        let cell = grid.get(o.key);
        if (!cell) { const card = document.createElement('section'), label = document.createElement('nav'); card.className = 'office-cell'; label.className = 'cell-label'; card.append(label); box.append(card); cell = { card, label, floors: new Map(), shown: '' }; grid.set(o.key, cell); }
        // The grid's order follows the offices without moving any frame.
        cell.card.style.order = String(i); cell.card.hidden = false;
        const frame = frameOf(o), floor = String(frame.page);
        for (const f of [...cell.floors.keys()]) if (Number(f) >= frame.pages) dispose(cell.floors, f);
        const entry = sceneIn(cell.floors, floor, cell.card, 'floor-frame', o.key);
        entry.scene.update(feedFor(o, frame), selected ?? glow, back || cell.shown !== floor);
        for (const [f, other] of cell.floors) other.card.hidden = f !== floor;
        cell.shown = floor;
        // Each office says whose and which it is; its name opens it alone.
        cell.label.innerHTML = `<button data-open="${e(o.key)}" title="${e(`${countsTitle(o.people)} · ${l('office.open_as_one_office')}`)}">${toolTile(o.provider)}${e(o.name)}${liveCounts(o.people)}</button>${floorButtons(o, frame)}`;
      });
    }
    const empty = q<HTMLElement>('.empty-office'), nobody = !crowd.some(x => x.state !== 'ended');
    empty.hidden = !nobody;
    empty.innerHTML = `<h2>${l('office.the_office_is_empty')}</h2><p>${l('office.a_chat_takes_its_desk')}</p><button class="primary-button" data-start-demo>${l('office.open_demo_office')}</button>`;
  }

  // What the card says under "Görev": the current work; after a reply, that the next request is awaited.
  const task = (p: Person) => p.state === 'idle' ? l('office.waiting_for_your_next_request') : p.state === 'unverified' ? l('office.no_current_state_from_the') : p.activity;
  // The worker's card: in the scene's own drawing style, over the wall above them.
  function renderCard() {
    const card = q<HTMLElement>('.person-card'), person = personOf(selected);
    if (!person || !cardAt) { card.hidden = true; return; }
    if (!card.hidden && card.querySelector('.rename-form')) return;
    const anchor = cardAt;
    const s = person.session, inClaude = s.key.provider === 'claude', r = person.request;
    const color = STATE_COLOR[person.state];
    const helpers = person.helpers.filter(h => h.status === 'working' || h.status === 'waiting').length;
    const home = officeKey(s), boss = managerChoice(snapshot!, { key: home, people: crowd.filter(x => officeKey(x.session) === home) }), isManager = boss.person === person;
    const typing = askForms.focused();
    card.innerHTML = `<header><i class="card-dot" style="background:${color}"></i><b class="card-name">${e(s.name)}</b><button class="card-close" data-close-card aria-label="${e(l('office.close'))}">×</button></header>`
      + `<p class="card-state">${e(statusLabel(person.state))} · ${isManager ? `${e(l('office.manager'))}${boss.source === 'auto' ? ` (${e(l('office.manager_auto'))})` : ''} · ` : ''}${e(groupName(s) ? `${groupName(s)} · ` : '')}${e(providerName(s.key.provider))}</p>`
      + (r ? (r.questions?.length ? `<div class="card-ask">${askForms.html(r, '')}</div>` : `<div class="card-ask"><b>${e(fromApp(r.title))}</b>${r.detail ? `<code>${e(fromApp(r.detail))}</code>` : ''}<small>${e(inClaude ? l('office.you_answer_in_claude_agentoffice') : l('office.you_answer_in_codex_agentoffice'))}</small></div>`) : '')
      + `<dl><dt>${l('office.task')}</dt><dd>${e(task(person))}</dd>${s.reply ? `<dt>${l('office.latest')}</dt><dd>${e(s.reply)} <span>· ${e(ago(s.lastActivity))}</span></dd>` : `<dt>${l('office.last_seen')}</dt><dd>${e(ago(s.lastActivity))}</dd>`}${helpers ? `<dt>${l('office.helpers')}</dt><dd>${helpers} ${l('office.working')}</dd>` : ''}</dl>`
      + `<div class="card-actions">${s.open ? `<button class="card-primary" data-source="${e(s.key.sessionId)}">${e(openLabel(s))} <span>→</span></button>` : r ? `<small class="card-where">${e(l('office.this_chat_runs_in_a'))}</small>` : ''}<span class="card-links"><button data-rename="${e(s.key.sessionId)}">${l('office.rename')}</button>${isManager ? `<button data-manager-picker="${e(home)}">${l('office.change_manager')}</button>` : `<button class="card-make-manager" data-manager="${e(home)}" data-chat="${e(s.key.sessionId)}" title="${e(l('office.your_main_contact_in_this'))}">★ ${l('office.choose_as_manager')}</button>`}<button data-diff>${l('office.changes')} (${s.files.length})</button></span></div>`;
    askForms.restore(card, typing);
    card.hidden = false;
    const stage = q('.stage').getBoundingClientRect(), width = card.offsetWidth || 320;
    card.style.left = `${Math.round(Math.max(12, Math.min(stage.width - width - 12, anchor.x + anchor.w / 2 - stage.left - width / 2)))}px`;
    card.style.top = '10px';
  }

  function renderRequests(requests: PendingRequest[]) {
    return requests.map(r => {
      const id = requestId(r.key); requestMap.set(id, r); const disabled = !r.canAnswer || r.status !== 'pending' || sending.has(id) || r.expiresAt <= Date.now();
      const who = snapshot?.sessions.find(s => sessionId(s.key) === sessionId(r.key.sessionKey));
      if (r.questions?.length) return `<article class="request-card"><div class="request-kind">${e(who ? shortName(who) : '')}</div>${askForms.html(r, who?.open ? `<button class="card-primary small" data-source="${e(r.key.sessionKey.sessionId)}">${e(openLabel(who))} →</button>` : '')}</article>`;
      return `<article class="request-card"><div class="request-kind">${e(who ? shortName(who) : '')}</div><h3>${e(fromApp(r.title))}</h3>${r.detail ? `<p>${e(fromApp(r.detail))}</p>` : ''}${r.canAnswer && r.options.length ? `<div class="answer-options">${r.options.map(option => `<button data-request="${e(id)}" data-version="${r.version}" data-answer="${e(option)}" ${disabled ? 'disabled' : ''}>${e(option)}</button>`).join('')}</div>` : `<small>${l('office.you_answer_in_the_source')}</small>`}${who?.link ? `<button class="card-primary small" data-source="${e(who.key.sessionId)}">${l('office.open_in_claude')} →</button>` : ''}</article>`;
    }).join('');
  }

  function renderDrawer() {
    const drawer = q<HTMLElement>('.drawer'); drawer.hidden = !panel; if (!panel || !snapshot) return;
    const tabs: [Panel, string][] = [['sessions', l('office.list')], ['activity', l('office.requests')], ['history', l('office.history')], ['diff', l('office.changes')]];
    const waiting = crowd.filter(x => x.state === 'waiting').length;
    q('.drawer-tabs').innerHTML = tabs.map(([key, label]) => `<button data-tab="${key}" class="${panel === key ? 'on' : ''}">${label}${key === 'activity' && waiting ? ` <i class="strip-badge">${waiting}</i>` : ''}</button>`).join('');
    const body = q<HTMLElement>('.drawer-body');
    if (panel === 'sessions') {
      const list = crowd.filter(x => x.state !== 'ended' && (layout === 'split' || !office || x.session.key.provider === office) && matches(x));
      const field = body.querySelector<HTMLInputElement>('.search-field input');
      if (!field) body.innerHTML = `<label class="search-field">${icon('search', 16)}<input type="search" aria-label="${e(l('office.search'))}" placeholder="${e(l('office.search_chats'))}"></label><div class="drawer-list"></div>`;
      body.querySelector('.drawer-list')!.innerHTML = list.map(x => `<button class="list-row ${selected === sessionId(x.session.key) ? 'on' : ''}" data-select="${e(sessionId(x.session.key))}"><i class="card-dot" style="background:${STATE_COLOR[x.state]}"></i><span><b>${e(x.session.name)}</b><small>${e(statusLabel(x.state))} · ${e(x.activity)}</small></span><em>${e(providerName(x.session.key.provider))}</em></button>`).join('') || `<p class="quiet">${l('office.nobody_in_this_view')}</p>`;
      return;
    }
    if (panel === 'activity') body.innerHTML = renderRequests(snapshot.requests.filter(r => r.status === 'pending')) || `<p class="quiet">${l('office.nothing_waits_for_you')}</p>`;
    if (panel === 'history') body.innerHTML = [...snapshot.history].reverse().slice(0, 120).map(event => { const s = snapshot!.sessions.find(x => sessionId(x.key) === sessionId(event.sessionKey)); return `<button class="history-row" data-select="${e(sessionId(event.sessionKey))}"><span class="event-icon">${icon(event.kind === 'replyEnded' ? 'activity' : 'history')}</span><span><b>${e(s ? shortName(s) : event.title)}</b><small>${e(event.kind === 'replyEnded' ? l('office.replied_2') : event.kind === 'error' ? l('office.error_2') : event.kind === 'question' ? l('office.asked') : l('office.asked_for_permission'))}</small></span><time>${new Date(event.at).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })}</time></button>`; }).join('') || `<p class="quiet">${l('office.no_events_yet')}</p>`;
    if (panel === 'diff') {
      const s = personOf(selected)?.session;
      body.innerHTML = `<p class="drawer-note">${e(s ? s.name : l('office.choose_someone_in_the_office'))}</p>${s?.files.map(file => `<details class="file-change"><summary><span>${e(file.path.replace(/^.*[\\/]/, ''))}</span><span><b class="addition">+${file.additions}</b> <b class="deletion">−${file.deletions}</b></span></summary><p>${e(file.path)}</p>${file.before !== undefined ? `<pre class="before-code">${e(file.before)}</pre>` : ''}${file.after !== undefined ? `<pre class="after-code">${e(file.after)}</pre>` : ''}</details>`).join('') || (s ? `<p class="quiet">${l('office.no_file_changes_reported')}</p>` : '')}`;
    }
  }

  function render() {
    if (!snapshot || disposed) return;
    root.classList.toggle('reduce-motion', prefs.reducedMotion); document.documentElement.lang = localeTag();
    crowd = people(snapshot, l);
    if (snapshot.mode === 'live') follow();
    if (snapshot.mode === 'live' && !snapshot.managers && !carried) { carried = true; void bridge.setOfficeManagers(carriedManagers(snapshot, projectOffices(crowd, snapshot.officeNames))).catch(() => { carried = false; }); }
    const all = offices();
    if (office && !all.includes(office)) office = '';
    renderStrip(); renderScenes(); renderCard();
    // Settings are not redrawn by live updates, so a choice in progress is not lost.
    if (panel) { requestMap.clear(); renderDrawer(); }
    settingsPanel.refresh();
  }
  // Where each chat sat: when one moves into another office (a chat begun in Claude's
  // scratch folder that goes on in a project), its manager role and the office chosen
  // here go with it; no second person or office is left behind.
  let placed: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem('agentoffice-placed') || '{}'); } catch { return {}; } })();
  function follow() {
    const next: Record<string, string> = {}, managers = { ...(snapshot!.managers ?? {}) }; let moved = false;
    for (const p of crowd.filter(x => !x.session.parentKey)) {
      const id = sessionId(p.session.key), key = officeKey(p.session), was = placed[id];
      if (was && was !== key) {
        if (managers[was] === p.session.key.sessionId && !managers[key]) { managers[key] = managers[was]; delete managers[was]; moved = true; }
        // The office's own name goes with it when the chat leaves its old office empty.
        const name = snapshot!.officeNames?.[was];
        if (name && !snapshot!.officeNames?.[key] && !crowd.some(x => officeKey(x.session) === was)) void bridge.setOfficeName(key, name).catch(() => {});
        if (!crowd.some(x => officeKey(x.session) === was)) for (const scope of Object.keys(chosenProject)) if (chosenProject[scope] === was) { chosenProject[scope] = key; remember(); }
      }
      next[id] = key;
    }
    placed = next; try { localStorage.setItem('agentoffice-placed', JSON.stringify(next)); } catch { /* Placement memory is a convenience. */ }
    if (moved && snapshot!.managers) void bridge.setOfficeManagers(managers).catch(() => {});
  }
  // A person chosen in the notch: shown in their office with a glowing desk, no card.
  let glow: string | undefined, glowTimer: ReturnType<typeof setTimeout> | undefined;
  // Someone's office (and the floor they sit on) becomes the one shown.
  function goTo(id: string) {
    const target = snapshot?.sessions.find(s => sessionId(s.key) === id);
    if (!target) return;
    if (layout === 'focus' && office && target.key.provider !== office) { office = target.key.provider; }
    const key = officeKey(target), mates = crowd.filter(x => (!office || x.session.key.provider === office) && officeKey(x.session) === key);
    chosenProject[scopeOf()] = key; floors[key] = Math.max(0, floorOf(mates, id, managerOf(snapshot!, { key, people: mates })?.session.key.sessionId)); remember();
  }
  function spotlight(id: string) {
    goTo(id);
    // A search must not hide the one asked for.
    if (search) { search = ''; const field = root.querySelector<HTMLInputElement>('.search-field input'); if (field) field.value = ''; }
    glow = id; clearTimeout(glowTimer); glowTimer = setTimeout(() => { glow = undefined; render(); }, 4000); render();
  }
  function reveal(id: string) {
    goTo(id);
    search = ''; choose(id);
  }

  const click = (event: MouseEvent) => {
    if (askForms.click(event.target as Element)) return;
    // A click anywhere else closes the list of offices that did not fit.
    if (moreOpen && !(event.target as Element).closest('.tabs-menu,[data-more]')) { moreOpen = false; q<HTMLElement>('.tabs-menu').hidden = true; q('.office-tabs [data-more]').classList.remove('on'); }
    const button = (event.target as Element).closest<HTMLElement>('button');
    if (!button) return;
    if (button.dataset.project !== undefined) { chosenProject[scopeOf()] = button.dataset.project; moreOpen = false; selected = undefined; remember(); render(); }
    else if (button.hasAttribute('data-more')) { moreOpen = !moreOpen; renderScenes(); }
    else if (button.dataset.open !== undefined) { layout = 'focus'; chosenProject[scopeOf()] = button.dataset.open; selected = undefined; remember(); render(); }
    else if (button.dataset.office !== undefined) { office = button.dataset.office; remember(); render(); }
    else if (button.dataset.renameOffice !== undefined) {
      // The office's own name; its identity (the project folder) does not change.
      const key = button.dataset.renameOffice, form = q<HTMLFormElement>('.office-rename'), o = officesNow.find(x => x.key === key);
      form.dataset.office = key; form.querySelector('label')!.textContent = l('office.office_name');
      const field = form.querySelector('input')!; field.value = o?.name ?? ''; field.placeholder = o?.people[0] ? (o.people[0].session.root || o.people[0].session.project).split(/[\\/]/).pop() || '' : '';
      form.querySelector('button[type=submit]')!.textContent = l('office.save'); form.querySelector('[data-rename-cancel]')!.textContent = l('office.cancel');
      form.hidden = false; field.focus(); field.select();
    }
    else if (button.hasAttribute('data-rename-cancel')) q<HTMLFormElement>('.office-rename').hidden = true;
    else if (button.dataset.layout) { layout = button.dataset.layout === 'split' ? 'split' : 'focus'; remember(); render(); }
    else if (button.dataset.panel) { const next = button.dataset.panel as Panel; panel = panel === next ? undefined : next; if (panel) settingsPanel.close(); renderDrawer(); }
    else if (button.dataset.tab) { panel = button.dataset.tab as Panel; q('.drawer-body').innerHTML = ''; renderDrawer(); }
    else if (button.hasAttribute('data-close-drawer')) { panel = undefined; renderDrawer(); }
    else if (button.hasAttribute('data-close-card')) choose(undefined);
    else if (button.dataset.floor !== undefined) { const at = button.dataset.floor.lastIndexOf('|'); floors[button.dataset.floor.slice(0, at)] = Number(button.dataset.floor.slice(at + 1)); selected = undefined; render(); }
    else if (button.dataset.select !== undefined) reveal(button.dataset.select);
    else if (button.hasAttribute('data-diff')) { panel = 'diff'; renderDrawer(); }
    else if (button.dataset.managerPicker !== undefined) openManagerPicker(button.dataset.managerPicker, cardAt);
    else if (button.dataset.manager !== undefined) void setManager(button.dataset.manager, button.dataset.chat || '');
    else if (button.dataset.source) { const id = button.dataset.source; void action(async () => { if (!await bridge.openInSource(id)) toast(l('office.this_chat_has_no_known')); }); }
    else if (button.dataset.rename) {
      const id = button.dataset.rename, current = personOf(selected)?.session;
      const name = q('.person-card .card-name');
      name.innerHTML = `<form class="rename-form"><input value="${e(current?.customName || current?.name || '')}" maxlength="60" aria-label="${e(l('office.new_name'))}"><button type="submit">${l('office.save')}</button></form>`;
      const form = name.querySelector('form')!, field = form.querySelector('input')!; field.focus(); field.select();
      form.addEventListener('submit', ev => { ev.preventDefault(); void action(() => bridge.renameSession(id, field.value.trim() || null)); });
    }
    else if (button.matches('[data-start-demo]')) void action(() => bridge.setDemo(true));
    else if (button.hasAttribute('data-open-settings')) { if (settingsPanel.isOpen) settingsPanel.close(); else { panel = undefined; renderDrawer(); settingsPanel.open(); } }
    else if (button.dataset.request) {
      const request = requestMap.get(button.dataset.request); const answer = button.dataset.answer;
      if (!request || answer === undefined || !request.canAnswer || request.status !== 'pending' || sending.has(button.dataset.request) || request.version !== Number(button.dataset.version)) return;
      const id = button.dataset.request; sending.add(id); render();
      void action(async () => { try { const result = await bridge.answer(request.key, request.version, { [request.title]: answer }); toast(result === 'delivered' ? (snapshot?.mode === 'demo' ? l('office.demo_reply_applied_not_sent') : l('office.reply_delivered')) : l('office.reply_not_delivered', { result })); } finally { sending.delete(id); render(); } });
    }
  };
  const key = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; if (settingsPanel.isOpen) settingsPanel.close(); else if (moreOpen) { moreOpen = false; renderScenes(); } else if (selected) choose(undefined); else if (panel) { panel = undefined; renderDrawer(); } };
  const renameOffice = (event: Event) => {
    const form = event.target as HTMLFormElement; if (!form.matches('.office-rename')) return;
    event.preventDefault(); form.hidden = true;
    const name = form.querySelector('input')!.value.trim();
    void action(async () => { await bridge.setOfficeName(form.dataset.office!, name || null); toast(name ? l('office.the_office_is_now', { name }) : l('office.the_office_uses_its_folder')); });
  };
  const input = (event: Event) => { if (askForms.input(event.target as Element)) return; if ((event.target as Element).matches('.search-field input')) { search = (event.target as HTMLInputElement).value; render(); } };
  const resize = () => { if (layout === 'split') arrange(grid.size); if (selected) void locate(selected); };
  root.addEventListener('click', click); root.addEventListener('input', input); root.addEventListener('submit', renameOffice); window.addEventListener('keydown', key); window.addEventListener('resize', resize);
  const stop = watchSnapshot(bridge, incoming => {
    snapshot = incoming;
    if (selected && !snapshot.sessions.some(s => sessionId(s.key) === selected)) selected = undefined;
    render();
  }, toast);
  let stopSelection: (() => void) | undefined, stopMute: (() => void) | undefined;
  const stopLog = bridge.onWorkLog(lines => { addLines(lines); if (!disposed) renderScenes(); });
  void bridge.getWorkLog().then(lines => { addLines(lines); if (!disposed && snapshot) renderScenes(); }).catch(() => {});
  // Settings: the app keeps them for both windows. The office's former preferences (kept in this
  // window only) are carried over once; afterwards language and motion follow the settings.
  const settingsPanel = createSettingsPanel(q('.office-app'), bridge, { l: () => l, toast, snapshot: () => snapshot, setDemo: on => bridge.setDemo(on), setClaudeHooks: async on => { await bridge.setClaudeHooks(on); toast(on ? l('office.claude_code_connected') : l('office.claude_code_disconnected')); } });
  let firstRun: ReturnType<typeof mountFirstRun> | null = null, setupDone = false;
  // The Claude Code connection's line under the header (connect a tool found later, repair a broken link).
  const linkNotice = mountLinkNotice(q('.office-app'), q('.office-app > header')?.nextElementSibling ?? null, bridge, { l: () => l, setupDone: () => setupDone, seen: () => !officeHidden, toast });
  managerOffer = mountManagerOffer(q('.office-app'), q('.link-notice')?.nextElementSibling ?? null, { l: () => l, name: p => shortName(p.session), officeName: o => o.name, choose: (key, chat) => bridge.setOfficeManagers({ ...(snapshot?.managers ?? {}), [key]: chat }).then(() => toast(l('office.now_this_office_s_manager'))).catch(err => toast(String(err))) });
  const applySettings = (s: Settings) => {
    // Another language: the window opens again in it (every word, the office's too), the settings where they were.
    const relabel = resolveLanguage(s.language) !== language();
    prefs.language = s.language; prefs.reducedMotion = s.reducedMotion; prefs.muted = s.muted; savePreferences(prefs);
    if (relabel) { try { sessionStorage.setItem(REOPEN_SETTINGS, '1'); } catch { /* Opens without the settings. */ } location.reload(); return; }
    logo.setReducedMotion(s.reducedMotion); void readAround();
    // The first start just answered (connected or not): the connection line looks again at once.
    if (s.setupDone && !setupDone) void linkNotice.refresh();
    setupDone = s.setupDone; linkNotice.relabel(); managerOffer?.relabel();
    // The first start (a fresh install): one screen over the office until it is answered.
    if (!s.setupDone && !firstRun) firstRun = mountFirstRun(q('.office-app'), bridge, { l: () => l, done: () => { firstRun = null; toast(l('setup.ready')); void linkNotice.refresh(); } });
    else if (s.setupDone && firstRun) { firstRun.dispose(); firstRun = null; }
    if (snapshot) render();
  };
  void bridge.getSettings().then(s => { if (!s.uiMigrated) void bridge.setSettings({ language: prefs.language, reducedMotion: prefs.reducedMotion, uiMigrated: true }).then(applySettings).catch(() => {}); else applySettings(s); }).catch(() => {});
  const stopSettings = bridge.onSettings(applySettings), stopOpenSettings = bridge.onOpenSettings(() => { panel = undefined; renderDrawer(); settingsPanel.open(); });
  try { if (sessionStorage.getItem(REOPEN_SETTINGS)) { sessionStorage.removeItem(REOPEN_SETTINGS); settingsPanel.open(); } } catch { /* No settings to reopen. */ }
  if (isNative()) void listen<boolean>('sound-muted', event => { prefs.muted = event.payload; savePreferences(prefs); if (!disposed) { toast(prefs.muted ? l('office.notification_sound_muted') : l('office.notification_sound_on')); settingsPanel.refresh(); } }).then(unsubscribe => { if (disposed) unsubscribe(); else stopMute = unsubscribe; }).catch(() => {});
  if (isNative()) void listen<SessionKey | null>('select-session', event => { if (disposed) return; choose(undefined); if (!event.payload) return; const id = sessionId(event.payload); spotlight(id);
    // From the notch or a notification: an agent with a waiting question opens with it, ready to answer here.
    const p = personOf(id); if (p?.request) setTimeout(() => { if (!disposed) choose(id); }, 350); }).then(unsubscribe => { if (disposed) unsubscribe(); else stopSelection = unsubscribe; }).catch(error => toast(String(error)));
  const browserSelection = (event: StorageEvent) => { if (event.key !== 'agentoffice-selection' || !event.newValue) return; try { reveal(sessionId(JSON.parse(event.newValue))); } catch { /* Ignore malformed browser preview selection. */ } };
  if (!isNative()) window.addEventListener('storage', browserSelection);
  return { dispose() { disposed = true; firstRun?.dispose(); linkNotice.dispose(); managerOffer?.dispose(); managerPicker.dispose(); clearInterval(askTimer); clearInterval(aroundTimer); clearInterval(clockTimer); void stopSky.then(off => off()); stopVisible?.(); logo.dispose(); stop(); stopSelection?.(); stopMute?.(); void stopLog.then(off => off()); void stopSettings.then(off => off()); void stopOpenSettings.then(off => off()); settingsPanel.dispose(); clearTimeout(toastTimer); clearTimeout(glowTimer); window.removeEventListener('storage', browserSelection); window.removeEventListener('keydown', key); window.removeEventListener('resize', resize); tabsScenes.forEach(entry => entry.scene.dispose()); grid.forEach(cell => cell.floors.forEach(entry => entry.scene.dispose())); root.removeEventListener('click', click); root.removeEventListener('input', input); root.removeEventListener('submit', renameOffice); root.replaceChildren(); } };
}
