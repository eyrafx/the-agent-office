import type { LanguageChoice } from '../i18n';
export type Provider = 'claude' | 'codex';
export interface SessionKey { provider: Provider; hostId: string; sessionId: string }
export type SessionStatus = 'working' | 'waiting' | 'replyEnded' | 'idle' | 'interrupted' | 'error' | 'ended' | 'unknown';
export interface Session { /** How it opens from the office, as its provider says: the chat itself, its tool's window, or (none) no button. */ open?: 'exact' | 'app'; key: SessionKey; name: string; project: string; status: SessionStatus; lastActivity: number; summary: string; parentKey?: SessionKey; source: 'demo' | 'hook' | 'record' | 'transcript'; files: FileChange[]; title?: string; customName?: string; agentType?: string; reply?: string; link?: string; root?: string; office?: string; verified?: boolean; startedAt?: number;
  /** When its last reply really ended (the reply event itself, not a later tool or helper). */
  repliedAt?: number }
export interface FileChange { path: string; additions: number; deletions: number; before?: string; after?: string }
export interface RequestKey { sessionKey: SessionKey; requestId: string }
export interface PendingRequest { key: RequestKey; version: number; turnId?: string; kind: 'permission' | 'question'; title: string; detail: string; options: string[]; expiresAt: number; status: 'pending' | 'answering' | 'resolved' | 'expired' | 'cancelled'; canAnswer: boolean;
  /** The asking tool call, and the question in full (one to four, each with its options). */
  toolId?: string; questions?: Question[];
  /** While it can be answered here: when it passes to the chat's own window (ms). */
  holdUntil?: number;
  /** How it ended as far as AgentOffice knows: answered here, in the chat itself, passed to the chat, or not handed over. */
  outcome?: 'delivered' | 'elsewhere' | 'released' | 'failed' }
export interface Question { question: string; header: string; options: { label: string; description: string }[]; multiSelect: boolean }
export interface HistoryEvent { id: string; sessionKey: SessionKey; kind: 'replyEnded' | 'question' | 'permission' | 'error'; title: string; at: number }
export interface Connection { provider: Provider; status: 'unverified' | 'connected' | 'disconnected'; detail: string; verifiedVersion?: string }
export interface Snapshot { schemaVersion: 1; revision: number; mode: 'demo' | 'live'; sessions: Session[]; requests: PendingRequest[]; history: HistoryEvent[]; connections: Connection[]; limits?: ProviderLimits[];
  /** Before managers were per office: the one manager chosen (carried over once). */
  manager?: string;
  /** Each office's manager the user chose (office key → session id); absent until set up. */
  managers?: Record<string, string>;
  /** Names the user gave offices (office key → name); the key stays the project's identity. */
  officeNames?: Record<string, string> }
export interface LimitWindow { windowMinutes: number; usedPercent: number; resetsAt?: number; model?: string }
export interface ProviderLimits { provider: string; plan?: string; windows: LimitWindow[]; updatedAt: number; source: string; note?: string; credits?: { unlimited: boolean; balance: number }; resetsAvailable?: number }
/** One line of an office's work board, written when it happened: which chat, its office then
 *  (folder or app project), what kind of moment and a short description; kept 30 days. */
export interface WorkEntry { id: string; at: number; provider: Provider; sessionId: string; chat: string; root?: string; office?: string; project: string; kind: 'reply' | 'permission' | 'question' | 'error' | 'stopped'; text: string; link?: string }
/** Whether a new request opens the notch, whether sound is muted, and why it is quiet now. */
export interface NotifyPrefs { alerts: boolean; muted: boolean; quiet: 'fullscreen' | 'dnd' | null }
/** Whether a kind of notification opens the notch, and whether it sounds. */
export interface NotifyChoice { open: boolean; sound: boolean }
/** The user's settings: one record for the notch and the office, kept by the app. */
export interface Settings {
  /** Before the three places: one rest look for all (kept only to carry it over). */
  notchMode: 'capsule' | 'line' | 'hidden';
  /** The rest look over the desktop, over an app and over a browser; over a real full screen. */
  restDesktop: RestLook; restApps: RestLook; restBrowsers: RestLook; fullscreenRest: 'line' | 'hidden';
  /** Where the island sits along the top edge, per screen: its centre as a share of the width. */
  positions: Record<string, number>;
  hoverDelay: number; closeDelay: number; animationSpeed: number; alertHold: number;
  monitor: string; scale: number; glassDarkness: number; restLight: boolean; lightBrightness: number; breathSpeed: number; capturable: boolean;
  reducedMotion: boolean; language: LanguageChoice; muted: boolean; volume: number;
  notifyRequest: NotifyChoice; notifyError: NotifyChoice; notifyReply: NotifyChoice; quietFullscreen: boolean; quietDnd: boolean;
  shortcutOpen: string; shortcutMute: string; uiMigrated: boolean; setupDone: boolean;
  islandTheme: 'glass' | 'dark'; pages: PageChoice[]; startPage: 'last' | PageId; collapsed: 'auto' | 'agents' | 'media' | 'focus';
  focusMinutes: number; shortBreak: number; longBreak: number; longEvery: number;
  notifyFocus: NotifyChoice; notifyReminder: NotifyChoice;
  /** Seconds a Claude question waits here to be answered before it passes to Claude (0: never). */
  askHold: number;
  /** A click on a notification or a waiting question: show the agent in its office, or open its chat. */
  notifyClick: 'office' | 'source';
  /** The user allowed asking LRCLIB for lyrics (a song's title, artist, album and length are sent). */
  lyricsOnline: boolean;
  /** System signs shown briefly on the closed island (none at first). */
  indicators: SignKind[];
  /** The mascot's idle moves; the small island's clock ("time": 14:05, "date": Sal 14:05). */
  idleMotion: boolean; hideMascot: boolean; statusBattery: boolean; statusAudio: boolean; statusWeather: boolean; weatherPlace: WeatherPlace | null; weatherCity: string; statusAlarm: boolean; clockStyle: 'time' | 'date';
  /** The thin line's colour; the colours of what waits; the notification sound. */
  lineColor: 'amber' | 'blue' | 'green' | 'pink' | 'white'; alertColors: 'warm' | 'cool' | 'contrast'; sound: 'soft' | 'bell' | 'pop' | 'double';
}
export type SignKind = 'volume' | 'caps' | 'language' | 'battery' | 'wifi' | 'audio';
/** A system sign to show briefly (volume, Caps Lock, keyboard language, battery, Wi-Fi, sound output). */
/** What the small island's status strip can show beside the time (values; the page says them). */
/** The weather's place, picked from Open-Meteo's geocoder (its name in the user's language then). */
export interface WeatherPlace { name: string; admin1: string; country: string; countryCode: string; latitude: number; longitude: number; timezone: string }
export interface IslandStatus { battery?: { percent: number; charging: boolean } | null; audio?: { kind: 'headphones' | 'headset' | 'speakers' | 'other'; name: string; bluetooth: boolean } | null; weather?: { temperature: number; code: number; place: string; at: number } | null }
export interface Sign { kind: SignKind; text: string; value?: number | null; on?: boolean | null }
/** A file on the shelf as it is now (it may have been moved or deleted since). */
export interface ShelfFile { path: string; name: string; exists: boolean; folder: boolean; size: number; modified: number }
/** A song's lyrics: timed lines, plain words, none found, not allowed yet ("off"), or not reachable now ("error"). */
export interface Lyrics { status: 'synced' | 'plain' | 'none' | 'off' | 'error'; lines: { t: number; text: string }[]; plain: string }
/** How the closed island rests: the small island (clock and a short state), a thin line, or nothing. */
export type RestLook = 'capsule' | 'line' | 'hidden';
/** The island's pages. */
export type PageId = 'agents' | 'media' | 'notes' | 'focus' | 'alarms' | 'water' | 'shelf';
export interface PageChoice { id: PageId; on: boolean }
export interface MonitorInfo { name: string; label: string; primary: boolean }
export type AnswerResult = 'delivered' | 'stale' | 'unsupported' | 'disconnected' | 'failed';
export type MascotState = 'idle' | 'working' | 'waiting' | 'replyEnded' | 'error' | 'resting' | 'dragged';
export type Unsubscribe = () => void;
/** The island's own records, kept by the app. */
export type DocName = 'notes' | 'focus' | 'water' | 'shelf';
/** What a notification of the island's own did: opened the notch, sounded, or stayed quiet (and why). */
export interface NotifyResult { opened: boolean; sounded: boolean; quiet: 'fullscreen' | 'dnd' | null }
/** Something playing on the computer (a Windows media session). Times in ms; no timeline: undefined. */
export interface MediaSession { id: string; app: string; title: string; artist: string; album: string; status: 'playing' | 'paused' | 'stopped' | 'changing' | 'closed'; canPlay: boolean; canPause: boolean; canNext: boolean; canPrev: boolean; canSeek: boolean; positionMs?: number | null; durationMs?: number | null; readAt: number; rate: number; art?: string | null; /** A browser's: the website it plays from (only when certain) and that site's own icon. */ site?: string | null; siteIcon?: string | null; current: boolean;
  /** It can be stopped; when it last started playing (ms; 0 if not seen start). */
  canStop?: boolean; playingSince?: number;
  /** When AgentOffice last saw it playing (ms; 0: not since it started). */
  lastPlayed?: number }
/** An alarm or reminder as the app keeps it (times in ms; `at` is the local "YYYY-MM-DDTHH:MM"). */
/** An alarm, a reminder, a countdown or a to-do's reminder, as the app keeps and rings it. A
 *  countdown ends at `ends` (ms); paused, it keeps what is `left` (ms). */
export interface Reminder { id: string; title: string; at: string; repeat: 'once' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | `days:${string}`; enabled: boolean; due: number; snoozed?: number | null; rung?: number | null; ringing: boolean; missed: boolean; kind?: ReminderKind; ends?: number | null; left?: number | null; total?: number | null }
export type ReminderKind = 'reminder' | 'alarm' | 'countdown' | 'todo';
export interface ReminderInput { id?: string; title: string; at: string; repeat: Reminder['repeat']; enabled: boolean; kind?: ReminderKind; ends?: number | null; left?: number | null; total?: number | null }
/** The supported tools found on this computer and the Claude Code connection (Codex is only read). */
export interface ToolsState { tools: { claude: boolean; codex: boolean }; claude: { state: 'absent' | 'off' | 'on' | 'broken' | 'unreadable'; reason?: string }; packaged?: boolean; providers?: ProviderState[] }
export interface Capabilities { history: boolean; liveWorking: boolean; liveIdle: boolean; liveWaitingPermission: boolean; liveWaitingInput: boolean; answerQuestion: boolean; answerPermission: boolean; openChatExact: boolean; openApp: boolean; usageLimits: boolean }
export interface ProviderState { id: string; name: string; present: boolean; link: { state: string; reason?: string }; capabilities: Capabilities }
export interface Bridge { autostart(): Promise<boolean>; setAutostart(on: boolean): Promise<boolean>; toolsState(): Promise<ToolsState>; connectTools(): Promise<ToolsState>; connectHooks(tool: string): Promise<ToolsState>; disconnectHooks(tool: string): Promise<ToolsState>; status(): Promise<IslandStatus>; searchPlaces(query: string): Promise<WeatherPlace[]>; onStatus(callback: (status: IslandStatus) => void): Promise<Unsubscribe>; reminders(): Promise<Reminder[]>; onReminders(callback: (list: Reminder[]) => void): Promise<Unsubscribe>; saveReminder(reminder: ReminderInput): Promise<Reminder[]>; deleteReminder(id: string): Promise<Reminder[]>; snoozeReminder(id: string, minutes: number): Promise<Reminder[]>; dismissReminder(id: string): Promise<Reminder[]>; mediaSessions(): Promise<MediaSession[]>; onMedia(callback: (sessions: MediaSession[]) => void): Promise<Unsubscribe>; mediaControl(id: string, action: 'play' | 'pause' | 'toggle' | 'next' | 'prev' | 'stop'): Promise<boolean>; mediaSeek(id: string, positionMs: number): Promise<boolean>; lyrics(track: { title: string; artist: string; album: string; durationMs: number }): Promise<Lyrics>; loadDoc<T>(name: DocName): Promise<T | null>; saveDoc(name: DocName, doc: unknown): Promise<void>; onDoc(callback: (change: { name: DocName; doc: unknown }) => void): Promise<Unsubscribe>; notify(kind: 'focus' | 'reminder' | 'water'): Promise<NotifyResult>; shelfInfo(paths: string[]): Promise<ShelfFile[]>; shelfOpen(path: string): Promise<void>; shelfReveal(path: string): Promise<void>; shelfDrag(paths: string[]): Promise<boolean>; shelfPick(): Promise<string[]>; shelfOpenWith(path: string): Promise<void>; indicatorsSupported(): Promise<SignKind[]>; onSign(callback: (sign: Sign) => void): Promise<Unsubscribe>; getSnapshot(): Promise<Snapshot>; subscribe(callback: (snapshot: Snapshot) => void): Promise<Unsubscribe>; setDemo(enabled: boolean): Promise<void>; answer(key: RequestKey, version: number, answers: Record<string, string>): Promise<AnswerResult>; releaseRequest(key: RequestKey): Promise<boolean>; openOffice(key?: SessionKey): Promise<void>; resizeNotch(expanded: boolean): Promise<void>; showNotch(): Promise<void>; pinNotch(pinned: boolean): Promise<void>; onNotchReveal(callback: (reveal: { holdMs: number; inside: boolean; alert?: boolean; page?: PageId | null }) => void): Promise<Unsubscribe>; onNotchPointer(callback: (inside: boolean) => void): Promise<Unsubscribe>; onNotchPinned(callback: (pinned: boolean) => void): Promise<Unsubscribe>; setLimitsPanel(open: boolean): Promise<void>; notchShape(rects: { x: number; y: number; w: number; h: number; r: number; flush: boolean; s?: number }[], moving?: boolean, area?: { x: number; y: number; w: number; h: number; r: number; flush: boolean }): Promise<void>; onNotchLayout(callback: (layout: { side: 'left' | 'right' }) => void): Promise<Unsubscribe>; onNotchDock(callback: (mode: RestLook) => void): Promise<Unsubscribe>; notchMove(action: 'start' | 'end' | 'center'): Promise<void>; notchAutoHide(): Promise<boolean | null>; setNotchAutoHide(enabled: boolean): Promise<void>; notchInScreenshots(): Promise<boolean | null>; setNotchInScreenshots(enabled: boolean): Promise<void>; onLimitsPanel(callback: (state: { open: boolean; side: 'left' | 'right' }) => void): Promise<Unsubscribe>; renameSession(sessionId: string, name: string | null): Promise<void>; openInSource(sessionId: string): Promise<boolean>; claudeHooksStatus(): Promise<boolean | null>; setClaudeHooks(enable: boolean): Promise<boolean>; setMuted(muted: boolean): Promise<void>; getSettings(): Promise<Settings>; setSettings(patch: Partial<Settings>): Promise<Settings>; onSettings(callback: (settings: Settings) => void): Promise<Unsubscribe>; playChime(volume?: number, sound?: Settings['sound']): Promise<void>; listMonitors(): Promise<MonitorInfo[]>; openSettings(): Promise<void>; onOpenSettings(callback: () => void): Promise<Unsubscribe>; getWorkLog(): Promise<WorkEntry[]>; onWorkLog(callback: (entries: WorkEntry[]) => void): Promise<Unsubscribe>; notifyPrefs(): Promise<NotifyPrefs | null>; setNotchAlerts(enabled: boolean): Promise<void>; onChime(callback: () => void): Promise<Unsubscribe>; setOfficeManagers(managers: Record<string, string>): Promise<void>; setOfficeName(office: string, name: string | null): Promise<void>; shortcuts(): Promise<boolean[] | null> }
export const sessionId = (key: SessionKey): string => JSON.stringify([key.provider, key.hostId, key.sessionId]);
export const requestId = (key: RequestKey): string => JSON.stringify([sessionId(key.sessionKey), key.requestId]);
export function mascotState(snapshot: Snapshot): MascotState { if (snapshot.requests.some(r => r.status === 'pending')) return 'waiting'; if (snapshot.sessions.some(s => s.status === 'error')) return 'error'; if (snapshot.sessions.some(s => s.status === 'working')) return 'working'; return 'idle'; }
