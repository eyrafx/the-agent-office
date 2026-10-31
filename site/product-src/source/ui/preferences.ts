import { LANGUAGES, type LanguageChoice } from '../i18n';

/** Kept in the page so it opens in the right language before the settings arrive (they decide). */
export interface Preferences { language: LanguageChoice; reducedMotion: boolean; muted: boolean }
const choices = ['system', ...LANGUAGES.map(x => x.id)] as readonly string[];
export function readPreferences(): Preferences {
  const defaults: Preferences = { language: 'system', reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, muted: true };
  try { const value = JSON.parse(localStorage.getItem('agentoffice:ui') || '{}'); return { language: choices.includes(value.language) ? value.language : defaults.language, reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : defaults.reducedMotion, muted: value.muted !== false }; } catch { return defaults; }
}
export function savePreferences(value: Preferences) { try { localStorage.setItem('agentoffice:ui', JSON.stringify(value)); } catch { /* Preferences remain in memory when storage is unavailable. */ } }
