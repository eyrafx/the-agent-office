import type { PageId, Settings } from './contract';

/** The island's pages in their default order (the agents page is always shown). */
export const PAGE_IDS: PageId[] = ['agents', 'media', 'notes', 'focus', 'alarms', 'water', 'shelf'];

/** The settings as they come (the app checks and saves them; these mirror its defaults, the factory
 *  settings in tests/fixtures/factory-settings.json: the user's own island less what is theirs alone). */
export const DEFAULT_SETTINGS: Settings = {
  notchMode: 'capsule', restDesktop: 'capsule', restApps: 'capsule', restBrowsers: 'hidden', fullscreenRest: 'line', positions: {}, hoverDelay: 0, closeDelay: 60, animationSpeed: 100, alertHold: 10,
  monitor: '', scale: 90, glassDarkness: 0, restLight: true, lightBrightness: 100, breathSpeed: 100, capturable: true,
  reducedMotion: false, language: 'system', muted: false, volume: 100,
  notifyRequest: { open: true, sound: true }, notifyError: { open: true, sound: true }, notifyReply: { open: false, sound: false },
  quietFullscreen: true, quietDnd: true, shortcutOpen: 'Ctrl+Alt+Space', shortcutMute: 'Ctrl+Alt+M', uiMigrated: false, setupDone: false,
  islandTheme: 'glass', pages: PAGE_IDS.map(id => ({ id, on: true })), startPage: 'last', collapsed: 'auto',
  focusMinutes: 25, shortBreak: 5, longBreak: 15, longEvery: 4,
  notifyFocus: { open: true, sound: true }, notifyReminder: { open: true, sound: true },
  askHold: 120, notifyClick: 'source', lyricsOnline: false,
  indicators: ['wifi', 'caps', 'language', 'volume', 'audio'], idleMotion: true, hideMascot: true, statusBattery: true, statusAudio: true, statusWeather: false, weatherPlace: null, weatherCity: '', statusAlarm: true, clockStyle: 'date', lineColor: 'green', alertColors: 'warm', sound: 'double',
};

/** Number settings: their limits, step and unit, as shown beside each control. */
export const RANGES = {
  hoverDelay: { min: 0, max: 1500, step: 50, unit: 'ms' },
  closeDelay: { min: 0, max: 3000, step: 50, unit: 'ms' },
  animationSpeed: { min: 50, max: 200, step: 10, unit: '%' },
  alertHold: { min: 3, max: 60, step: 1, unit: 's' },
  glassDarkness: { min: 0, max: 100, step: 5, unit: '' },
  lightBrightness: { min: 30, max: 100, step: 5, unit: '%' },
  breathSpeed: { min: 50, max: 200, step: 10, unit: '%' },
  volume: { min: 0, max: 100, step: 5, unit: '%' },
  focusMinutes: { min: 1, max: 120, step: 1, unit: 'min' },
  shortBreak: { min: 1, max: 60, step: 1, unit: 'min' },
  longBreak: { min: 1, max: 90, step: 1, unit: 'min' },
  longEvery: { min: 2, max: 8, step: 1, unit: '' },
} as const satisfies Partial<Record<keyof Settings, { min: number; max: number; step: number; unit: string }>>;

/** Which settings each group's "Varsayılana dön" puts back. */
export const SECTIONS = {
  look: ['islandTheme', 'lineColor', 'alertColors', 'clockStyle', 'idleMotion', 'hideMascot', 'statusBattery', 'statusAudio', 'statusWeather', 'weatherPlace', 'weatherCity', 'statusAlarm', 'scale', 'glassDarkness', 'restLight', 'lightBrightness', 'breathSpeed', 'animationSpeed', 'reducedMotion', 'language'],
  behaviour: ['restDesktop', 'restApps', 'restBrowsers', 'fullscreenRest', 'positions', 'hoverDelay', 'closeDelay', 'monitor', 'capturable'],
  pages: ['pages', 'lyricsOnline', 'indicators', 'startPage', 'collapsed', 'focusMinutes', 'shortBreak', 'longBreak', 'longEvery'],
  notify: ['muted', 'sound', 'volume', 'notifyRequest', 'notifyError', 'notifyReply', 'notifyFocus', 'notifyReminder', 'alertHold', 'askHold', 'notifyClick', 'quietFullscreen', 'quietDnd', 'shortcutOpen', 'shortcutMute'],
  advanced: [],
} as const satisfies Record<string, readonly (keyof Settings)[]>;

export function defaultsOf(section: keyof typeof SECTIONS): Partial<Settings> {
  return Object.fromEntries(SECTIONS[section].map(k => [k, DEFAULT_SETTINGS[k]])) as Partial<Settings>;
}

/** A keyboard event as a shortcut ("Ctrl+Alt+K"): it needs Ctrl, Alt or Win and one key
 *  (a letter, a digit, Space or F1–F12); anything else is not a shortcut (null). */
export function shortcutOf(event: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'key' | 'code'>): string | null {
  const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3) : /^Digit\d$/.test(event.code) ? event.code.slice(5) : event.code === 'Space' ? 'Space' : /^F([1-9]|1[0-2])$/.test(event.key) ? event.key : null;
  if (!key || !(event.ctrlKey || event.altKey || event.metaKey)) return null;
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Win', key].filter(Boolean).join('+');
}
