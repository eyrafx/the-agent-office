/**
 * The app's languages: one keyed catalog per locale (locales/*.json), English the fallback for a
 * key a catalog lacks. Messages are ICU-style: `{name}` puts in a value, `{n, plural, one {# file}
 * other {# files}}` follows the locale's CLDR plural rules (Intl.PluralRules; `=0` and the like
 * match exactly, `#` is the number in the locale's digits), `{x, select, a {…} other {…}}` picks by
 * value. Apostrophes are plain text (Turkish uses them in every other word); a literal brace is
 * written `'{'` or `'}'`. Dates, times, numbers and units go through Intl in the same locale.
 */
import en from './locales/en.json';
import tr from './locales/tr.json';
import es from './locales/es.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import ptBR from './locales/pt-BR.json';
import it from './locales/it.json';
import ru from './locales/ru.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import zhHans from './locales/zh-Hans.json';

export type MessageKey = keyof typeof en;
export type Vars = Record<string, string | number>;
/** The translator every module is handed (`l('island.working')`). */
export type Translate = (key: MessageKey, vars?: Vars) => string;

/** The languages offered, each by its own name; `locale` is the BCP 47 tag Intl formats with. */
export const LANGUAGES = [
  { id: 'tr', name: 'Türkçe', locale: 'tr-TR' },
  { id: 'en', name: 'English', locale: 'en-US' },
  { id: 'es', name: 'Español', locale: 'es-ES' },
  { id: 'de', name: 'Deutsch', locale: 'de-DE' },
  { id: 'fr', name: 'Français', locale: 'fr-FR' },
  { id: 'pt-BR', name: 'Português (Brasil)', locale: 'pt-BR' },
  { id: 'it', name: 'Italiano', locale: 'it-IT' },
  { id: 'ru', name: 'Русский', locale: 'ru-RU' },
  { id: 'ja', name: '日本語', locale: 'ja-JP' },
  { id: 'ko', name: '한국어', locale: 'ko-KR' },
  { id: 'zh-Hans', name: '简体中文', locale: 'zh-CN' },
] as const;
export type LanguageId = typeof LANGUAGES[number]['id'];
/** The setting: a language, or "system" (the system's language when it is one of these, else English). */
export type LanguageChoice = LanguageId | 'system';

export const CATALOGS: Record<LanguageId, Partial<Record<MessageKey, string>>> = { en, tr, es, de, fr, 'pt-BR': ptBR, it, ru, ja, ko, 'zh-Hans': zhHans };

/** The language for a choice: "system" follows the system's languages in order (navigator.languages:
 *  "pt-PT" finds Portuguese, "zh-TW" finds Chinese), falling back to English. */
export function resolveLanguage(choice: string | undefined, system: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): LanguageId {
  const known = LANGUAGES.map(x => x.id) as readonly string[];
  if (choice && choice !== 'system' && known.includes(choice)) return choice as LanguageId;
  for (const tag of system) {
    const lower = tag.toLowerCase();
    if (lower === 'pt-br' || lower.startsWith('pt')) return 'pt-BR';
    if (lower.startsWith('zh')) return 'zh-Hans';
    const base = lower.split('-')[0];
    if (known.includes(base)) return base as LanguageId;
  }
  return 'en';
}

let current: LanguageId = 'en';
/** The locale tag of the current language (for Intl and for toLocaleLowerCase/UpperCase: Turkish İ/ı). */
export const locale = () => LANGUAGES.find(x => x.id === current)!.locale;
export const language = () => current;
export function setLanguage(id: LanguageId) { current = id; if (typeof document !== 'undefined') document.documentElement.lang = locale(); }

const plurals = new Map<string, Intl.PluralRules>();
const pluralOf = (n: number) => { const tag = locale(); let p = plurals.get(tag); if (!p) { p = new Intl.PluralRules(tag); plurals.set(tag, p); } return p.select(n); };

/** The text of `key` in the current language (English if that catalog lacks it), with its values. */
export const t: Translate = (key, vars) => {
  const text = CATALOGS[current][key] || (en as Record<string, string>)[key] || key;
  return format(text, vars ?? {});
};

/** ICU message formatting (the subset above), in the current locale. */
export function format(text: string, vars: Vars): string {
  let out = '', i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'" && (text[i + 1] === '{' || text[i + 1] === '}') && text[i + 2] === "'") { out += text[i + 1]; i += 3; continue; }
    if (c !== '{') { out += c; i++; continue; }
    const end = closing(text, i);
    out += argument(text.slice(i + 1, end), vars);
    i = end + 1;
  }
  return out;
}
/** The brace that closes the one at `open` (nested choices inside). */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "'" && (text[i + 1] === '{' || text[i + 1] === '}') && text[i + 2] === "'") { i += 2; continue; }
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return text.length;
}
function argument(body: string, vars: Vars): string {
  const comma = body.indexOf(',');
  const name = (comma < 0 ? body : body.slice(0, comma)).trim();
  const value = vars[name];
  if (comma < 0) return value === undefined ? `{${name}}` : typeof value === 'number' ? number(value) : value;
  const rest = body.slice(comma + 1), comma2 = rest.indexOf(',');
  const kind = rest.slice(0, comma2).trim(), options = choices(rest.slice(comma2 + 1));
  if (kind === 'plural') {
    const n = Number(value);
    const chosen = options.get(`=${n}`) ?? options.get(pluralOf(n)) ?? options.get('other') ?? '';
    return format(chosen.replace(/#/g, number(n)), vars);
  }
  return format(options.get(String(value)) ?? options.get('other') ?? '', vars);
}
function choices(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i); if (open < 0) break;
    const label = text.slice(i, open).trim(), end = closing(text, open);
    out.set(label, text.slice(open + 1, end)); i = end + 1;
  }
  return out;
}

/**
 * A text the app's native side wrote (an agent's state, a request's title, an error, a system
 * sign) in the current language. That side writes its fixed Turkish wording, kept in the saved
 * office too; each wording is an `app.*` (or `tray.*`) message, its values found by position. A
 * text it does not know (an agent's own words, a file name) is returned as it is.
 */
export function fromApp(text: string | undefined | null): string {
  if (!text) return text ?? '';
  const index = appIndex();
  const exact = index.exact.get(text);
  if (exact) return t(exact);
  for (const p of index.patterns) { const m = p.re.exec(text); if (m) return t(p.key, Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]]))); }
  return text;
}
let appIndexCache: { exact: Map<string, MessageKey>; patterns: { key: MessageKey; re: RegExp; names: string[] }[] } | undefined;
function appIndex() {
  if (appIndexCache) return appIndexCache;
  const exact = new Map<string, MessageKey>(), patterns: { key: MessageKey; re: RegExp; names: string[] }[] = [];
  for (const [key, text] of Object.entries(tr as Record<string, string>)) {
    if (!/^(app|tray)\./.test(key)) continue;
    const names = [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    if (!names.length) { exact.set(text, key as MessageKey); continue; }
    const re = new RegExp(`^${text.split(/\{\w+\}/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)')}$`, 's');
    patterns.push({ key: key as MessageKey, re, names });
  }
  return (appIndexCache = { exact, patterns });
}

/** A number in the current locale ("2,3" in Turkish, "2.3" in English). */
export const number = (n: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale(), options).format(n);
/** A date or time in the current locale (its own 12- or 24-hour clock). */
export const dateTime = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale(), options);
/** "3 minutes ago", "in 2 hours" in the current locale. */
export const relative = (value: number, unit: Intl.RelativeTimeFormatUnit, options: Intl.RelativeTimeFormatOptions = { numeric: 'auto' }) => new Intl.RelativeTimeFormat(locale(), options).format(value, unit);
/** How long ago `at` was ("5 minutes ago", "yesterday", "now"), in a unit fitting its size. */
export function ago(at: number, now = Date.now(), style: Intl.RelativeTimeFormatStyle = 'long'): string {
  const m = Math.round((now - at) / 60000), options = { numeric: 'auto' as const, style };
  if (m < 1) return relative(0, 'second', options);
  if (m < 60) return relative(-m, 'minute', options);
  const h = Math.round(m / 60);
  return h < 48 ? relative(-h, 'hour', options) : relative(-Math.round(h / 24), 'day', options);
}
/** A length of time in its two largest units, the locale's short form ("2 hr, 14 min"; "2 sa. 14 dk."). */
export function span(minutes: number): string {
  const m = Math.max(0, Math.round(minutes)), h = Math.floor(m / 60), d = Math.floor(h / 24);
  const parts = m < 60 ? { minutes: m } : h < 48 ? { hours: h, minutes: m % 60 } : { days: d, hours: h % 24 };
  const shown = Object.fromEntries(Object.entries(parts).filter(([, v], i) => i === 0 || v)) as Record<string, number>;
  const Duration = (Intl as unknown as { DurationFormat?: new (l: string, o: object) => { format(d: object): string } }).DurationFormat;
  if (Duration) return new Duration(locale(), { style: 'short' }).format(shown);
  const unit = { days: 'day', hours: 'hour', minutes: 'minute' } as Record<string, string>;
  return Object.entries(shown).map(([k, v]) => number(v, { style: 'unit', unit: unit[k], unitDisplay: 'short' })).join(' ');
}
/** A count of a unit, short ("5 min", "5 dk."), as a badge says how long ago. */
export const unitShort = (n: number, unit: 'minute' | 'hour' | 'day') => number(n, { style: 'unit', unit, unitDisplay: 'short' });
/** A list ("Claude and Codex") in the current locale. */
export const list = (items: string[]) => new Intl.ListFormat(locale(), { style: 'long', type: 'conjunction' }).format(items);
/** A file size, its unit by the locale ("2,3 MB" in Turkish, "2.3 MB" in English). */
export const bytes = (n: number) => {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let i = 0, v = n; while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return number(v, { style: 'unit', unit: units[i], unitDisplay: i === 0 ? 'long' : 'short', maximumFractionDigits: i === 0 ? 0 : 1 });
};
/** Lower and upper case by the current language's rules (Turkish İ/i and I/ı). */
export const lower = (s: string) => s.toLocaleLowerCase(locale());
export const upper = (s: string) => s.toLocaleUpperCase(locale());
