// The demo bridge: the app's Bridge (shared/contract.ts) answered from the page's demo world
// (hub.ts) instead of the Tauri shell. It does what the app's own browser preview does
// (shared/bridge.ts), shared between frames and kept in memory. Nothing real is touched:
// no agent is answered, no file is opened, no sound plays.
import type { Bridge, DocName, IslandStatus, MediaSession, PageId, Reminder, SessionKey, Settings, Snapshot, ToolsState, WeatherPlace } from '@app/shared/contract';
import { requestId, sessionId } from '@app/shared/contract';
import { getHub } from './hub';
import { TRACKS } from './fixture';

export interface FrameHooks {
  /** Opens or closes the island as if pinned (the feature demos keep it open). */
  pin(on: boolean): void;
  /** Opens the island the way a notification does. */
  reveal(r: { holdMs: number; inside: boolean; alert?: boolean; page?: PageId | null }): void;
}

const clone = <T,>(v: T): T => structuredClone(v);

export function createDemoBridge(frame: string): { bridge: Bridge; hooks: FrameHooks } {
  const hub = getHub();
  const offs: (() => void)[] = [];
  const sub = (topic: Parameters<typeof hub.on>[0], cb: (p: never) => void) => { const off = hub.on(topic, cb as (p: unknown) => void); offs.push(off); return async () => off; };
  // A frame that goes away takes its listeners with it.
  addEventListener('pagehide', () => offs.splice(0).forEach(off => off()));
  const pinListeners = new Set<(pinned: boolean) => void>();
  const revealListeners = new Set<(r: { holdMs: number; inside: boolean; alert?: boolean; page?: PageId | null }) => void>();
  const hooks: FrameHooks = {
    pin: on => pinListeners.forEach(cb => cb(on)),
    reveal: r => revealListeners.forEach(cb => cb(r)),
  };
  const pending = (s: Snapshot) => new Set(s.requests.filter(r => r.status === 'pending').map(r => requestId(r.key)));
  let announced = pending(hub.snapshot);
  // A new question opens the island as the app does (unless this frame is told not to).
  sub('snapshot', (s: Snapshot) => { const now = pending(s); const fresh = [...now].some(id => !announced.has(id)); announced = now; if (fresh && frame === 'hero') hooks.reveal({ holdMs: 6000, inside: false, alert: true }); });
  const saveMedia = () => hub.emit('media', hub.media);
  const position = (m: MediaSession) => m.positionMs == null ? null : Math.min(m.durationMs ?? Infinity, m.positionMs + (m.status === 'playing' ? (Date.now() - m.readAt) * (m.rate || 1) : 0));
  const remDue = (at: string) => { const [d, t] = at.split('T'); const [y, mo, da] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, mo - 1, da, h, mi).getTime(); };
  const writeRem = (list: Reminder[]) => { hub.reminders = list; hub.emit('reminders', clone(list)); return clone(list); };
  const desktopOnly = async () => { throw new Error('Bu, masaüstü uygulamasında çalışır; tanıtım sayfasında yalnız gösteriliyor.'); };

  // Both tools found and connected: the first-run screen and the repair notice stay away.
  const tools: ToolsState = { tools: { claude: true, codex: true }, claude: { state: 'on' } };
  const places: WeatherPlace[] = [
    { name: 'İstanbul', admin1: 'İstanbul', country: 'Türkiye', countryCode: 'TR', latitude: 41.01, longitude: 28.97, timezone: 'Europe/Istanbul' },
    { name: 'İzmir', admin1: 'İzmir', country: 'Türkiye', countryCode: 'TR', latitude: 38.42, longitude: 27.14, timezone: 'Europe/Istanbul' },
    { name: 'Ankara', admin1: 'Ankara', country: 'Türkiye', countryCode: 'TR', latitude: 39.93, longitude: 32.86, timezone: 'Europe/Istanbul' },
  ];
  const bridge: Bridge = {
    toolsState: async () => clone(tools),
    connectTools: async () => clone(tools),
    status: async () => clone(hub.status),
    onStatus: async cb => sub('status', (st: IslandStatus) => cb(clone(st))),
    searchPlaces: async query => { const q = query.trim().toLocaleLowerCase('tr-TR'); return clone(places.filter(p => !q || p.name.toLocaleLowerCase('tr-TR').startsWith(q))); },
    getSnapshot: async () => clone(hub.snapshot),
    subscribe: async cb => { const off = hub.on('snapshot', s => cb(clone(s as Snapshot))); offs.push(off); return off; },
    setDemo: async () => {},
    answer: async (key, version, answers) => {
      const r = hub.snapshot.requests.find(x => requestId(x.key) === requestId(key));
      if (!r || r.version !== version || r.status !== 'pending') return 'stale';
      const answer = Object.values(answers)[0] ?? '';
      if (!answer) return 'failed';
      r.status = 'resolved'; r.outcome = 'delivered'; r.version++;
      const s = hub.snapshot.sessions.find(x => sessionId(x.key) === sessionId(key.sessionKey));
      if (s) { s.status = 'working'; s.summary = `Yanıt: ${answer} · tema uygulanıyor`; s.lastActivity = Date.now(); }
      hub.publish(); hub.emit('answered', { session: key.sessionKey.sessionId, answer });
      return 'delivered';
    },
    releaseRequest: async () => false,
    lyrics: async () => ({ status: 'off', lines: [], plain: '' }),
    openOffice: async (key?: SessionKey) => { hub.emit('open-office', key ? clone(key) : null); },
    resizeNotch: async () => {},
    showNotch: async () => {},
    pinNotch: async pinned => hooks.pin(pinned),
    onNotchReveal: async cb => { revealListeners.add(cb); return () => revealListeners.delete(cb); },
    onNotchPointer: async () => () => {},
    onNotchPinned: async cb => { pinListeners.add(cb); return () => pinListeners.delete(cb); },
    setLimitsPanel: async () => {},
    // The outline is followed by the island frame itself (island.ts), so the shell's region call is not needed.
    notchShape: async () => {},
    onNotchLayout: async () => () => {},
    onNotchDock: async () => () => {},
    notchMove: async () => {},
    notchAutoHide: async () => null,
    setNotchAutoHide: desktopOnly,
    notchInScreenshots: async () => null,
    setNotchInScreenshots: desktopOnly,
    onLimitsPanel: async () => () => {},
    renameSession: async (id, name) => { const s = hub.snapshot.sessions.find(x => x.key.sessionId === id); if (s) { s.customName = name || undefined; s.name = name || s.name; hub.publish(); } },
    // "Open in Claude / Codex": the desktop app would open the chat; the page says so.
    openInSource: async () => { hub.emit('open-source', frame); return true; },
    setMuted: async () => {},
    getWorkLog: async () => clone(hub.worklog),
    onWorkLog: async cb => sub('worklog', cb as never),
    notifyPrefs: async () => ({ alerts: true, muted: true, quiet: null }),
    setNotchAlerts: async () => {},
    onChime: async () => () => {},
    getSettings: async () => clone(hub.settings),
    setSettings: async (patch: Partial<Settings>) => { hub.settings = { ...hub.settings, ...patch }; hub.emit('settings', clone(hub.settings)); return clone(hub.settings); },
    onSettings: async cb => sub('settings', (s: Settings) => cb(clone(s))),
    playChime: async () => {},
    shelfInfo: async paths => paths.map(path => ({ path, name: path.split(/[\\/]/).pop() || path, exists: true, folder: !/\.[a-z0-9]{1,5}$/i.test(path), size: 18_000 + (path.length * 7919) % 2_400_000, modified: Date.now() - (path.length % 9) * 3_600_000 })),
    shelfOpen: desktopOnly,
    shelfReveal: desktopOnly,
    shelfDrag: async () => false,
    shelfPick: async () => { hub.emit('frame', { type: 'shelf-pick', frame }); return []; },
    shelfOpenWith: desktopOnly,
    indicatorsSupported: async () => [],
    onSign: async () => () => {},
    listMonitors: async () => [{ name: 'DEMO1', label: 'Ekran 1', primary: true }],
    openSettings: async () => { hub.emit('open-settings', frame); },
    onOpenSettings: async () => () => {},
    setOfficeManagers: async managers => { hub.snapshot.managers = managers; hub.publish(); },
    setOfficeName: async (office, name) => { const names = { ...(hub.snapshot.officeNames ?? {}) }; if (name?.trim()) names[office] = name.trim(); else delete names[office]; hub.snapshot.officeNames = names; hub.publish(); },
    shortcuts: async () => null,
    claudeHooksStatus: async () => null,
    setClaudeHooks: desktopOnly,
    loadDoc: async <T,>(name: DocName) => clone((hub.docs[name] ?? null) as T | null),
    saveDoc: async (name, doc) => { hub.docs[name] = clone(doc); hub.emit('doc', { name, doc: clone(doc) }); },
    onDoc: async cb => sub('doc', (c: { name: DocName; doc: unknown }) => cb(clone(c))),
    notify: async kind => { if (kind === 'water' || kind === 'focus' || kind === 'reminder') hooks.reveal({ holdMs: 5000, inside: false, alert: false, page: kind === 'focus' ? 'focus' : kind === 'water' ? 'water' : 'alarms' }); return { opened: true, sounded: false, quiet: null }; },
    reminders: async () => clone(hub.reminders),
    onReminders: async cb => sub('reminders', (list: Reminder[]) => cb(clone(list))),
    saveReminder: async r => {
      const list = [...hub.reminders]; const id = r.id || `r${Date.now()}`;
      const due = r.kind === 'countdown' && r.ends ? r.ends : remDue(r.at);
      if (r.enabled && r.repeat === 'once' && r.kind !== 'countdown' && due < Date.now()) throw new Error('Bu zaman geçti; ileri bir zaman seç.');
      const item: Reminder = { id, title: r.title.trim() || 'Hatırlatıcı', at: r.at, repeat: r.repeat, enabled: r.enabled, kind: r.kind, due: r.enabled ? due : 0, snoozed: null, rung: null, ringing: false, missed: false, ends: r.ends ?? null, left: r.left ?? null, total: r.total ?? null };
      const at = list.findIndex(x => x.id === id); if (at >= 0) list[at] = item; else list.push(item);
      return writeRem(list);
    },
    deleteReminder: async id => writeRem(hub.reminders.filter(x => x.id !== id)),
    snoozeReminder: async (id, minutes) => writeRem(hub.reminders.map(x => x.id === id ? { ...x, ringing: false, missed: false, snoozed: Date.now() + minutes * 60_000 } : x)),
    dismissReminder: async id => writeRem(hub.reminders.map(x => x.id === id ? { ...x, ringing: false, missed: false, snoozed: null, enabled: x.repeat === 'once' ? false : x.enabled } : x)),
    mediaSessions: async () => clone(hub.media),
    onMedia: async cb => sub('media', (m: typeof hub.media) => cb(clone(m))),
    mediaControl: async (id, action) => {
      const m = hub.media.find(x => x.id === id); if (!m) return false;
      const at = position(m);
      if (action === 'toggle' || action === 'play' || action === 'pause') { const play = action === 'toggle' ? m.status !== 'playing' : action === 'play'; m.status = play ? 'playing' : 'paused'; m.positionMs = at; if (play) m.playingSince = Date.now(); }
      else if (action === 'next' || action === 'prev') {
        const i = TRACKS.findIndex(t => t.title === m.title), back = action === 'prev' && (at ?? 0) > 3000;
        const t = back ? TRACKS[i] : TRACKS[(i + (action === 'next' ? 1 : -1) + TRACKS.length) % TRACKS.length];
        Object.assign(m, { title: t.title, artist: t.artist, album: t.album, durationMs: t.durationMs, art: t.art, positionMs: 0 });
      } else if (action === 'stop') { m.status = 'stopped'; }
      m.readAt = Date.now(); saveMedia(); return true;
    },
    mediaSeek: async (id, positionMs) => { const m = hub.media.find(x => x.id === id); if (!m) return false; m.positionMs = Math.max(0, Math.min(m.durationMs ?? positionMs, positionMs)); m.readAt = Date.now(); saveMedia(); return true; },
  };
  return { bridge: failSafe(bridge, frame), hooks };
}

/**
 * The app grows: a call this demo does not know yet answers with a harmless default (a listener
 * that does nothing, else null) and leaves one warning, so a new app feature never blanks the page.
 */
function failSafe(bridge: Bridge, frame: string): Bridge {
  const warned = new Set<string>();
  return new Proxy(bridge, {
    get(target, name, receiver) {
      if (typeof name !== 'string' || name in target || name === 'then') return Reflect.get(target, name, receiver);
      if (!warned.has(name)) { warned.add(name); console.warn(`[AgentOffice demo] "${name}" bu tanıtım sayfasında yok; zararsız bir boş yanıt verildi (${frame}).`); }
      return /^on[A-Z]/.test(name) ? async () => () => {} : async () => null;
    },
  });
}
