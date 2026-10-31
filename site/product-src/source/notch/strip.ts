/**
 * The small island's middle: the time, and in turn each status item the user turned on (the
 * battery, headphones in use, the weather with its city, the next alarm), one at a time with a gentle vertical
 * slide (a fade with reduced motion), about five seconds each, the time between every two. It
 * stops while the pointer is on the island. Nothing to add: the time alone, still.
 */
import type { IslandStatus, Reminder, Settings } from '../shared/contract';
import { number, dateTime, type Translate } from '../i18n';
import { icon } from '../ui/icons';

export type ItemId = 'battery' | 'weather' | 'audio' | 'alarm';
export interface StripItem { id: ItemId; forms: string[]; label: string }
type Choice = Pick<Settings, 'statusBattery' | 'statusAudio' | 'statusWeather' | 'statusAlarm' | 'hideMascot'>;

/** The WMO weather code as one of a few pictures. */
export function weatherKind(code: number): 'sun' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' {
  if (code <= 1) return 'sun';
  if (code <= 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';
}

/** Inside the battery ring: a bolt while charging, a small battery otherwise. */
const GLYPH = {
  bolt: '<path class="glyph" d="M12.9 6.2 9.3 12.6h2.6l-.8 5.2 3.8-6.6h-2.6l.6-5Z" fill="currentColor"/>',
  cell: '<rect class="glyph" x="8.2" y="9.6" width="7" height="4.8" rx="1.1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect class="glyph" x="15.6" y="11.1" width="1.1" height="1.8" rx=".5" fill="currentColor"/>',
};
const level = (percent: number) => Math.min(100, Math.max(0, Math.round(percent)));
const tone = (p: number, charging: boolean) => charging ? 'charging' : p <= 20 ? 'low' : 'normal';
/** The battery as a ring filling clockwise with its level: green while charging, neutral, red at 20 % and under. */
export const batteryRing = (percent: number, charging: boolean, size = 18) => {
  const p = level(percent), g = charging ? 'bolt' : 'cell';
  return `<svg class="bat-ring ${tone(p, charging)}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" data-glyph="${g}"><circle class="track" cx="12" cy="12" r="10" fill="none" stroke-width="2.4"/><circle class="arc" cx="12" cy="12" r="10" fill="none" stroke-width="2.4" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - p}" transform="rotate(-90 12 12)"/>${GLYPH[g]}</svg>`;
};
/** The ring in `host` brought to a new level in place, so it sweeps there (at once with reduced motion); drawn if missing. */
export function setRing(host: Element, percent: number, charging: boolean, size = 18) {
  const ring = host.querySelector<SVGSVGElement>('svg.bat-ring');
  if (!ring || ring.getAttribute('width') !== String(size)) { ring?.remove(); host.insertAdjacentHTML('afterbegin', batteryRing(percent, charging, size)); return; }
  const p = level(percent), g = charging ? 'bolt' : 'cell';
  ring.setAttribute('class', `bat-ring ${tone(p, charging)}`);
  ring.querySelector('.arc')!.setAttribute('stroke-dashoffset', String(100 - p));
  if (ring.dataset.glyph !== g) { ring.dataset.glyph = g; ring.querySelectorAll('.glyph').forEach(x => x.remove()); ring.insertAdjacentHTML('beforeend', GLYPH[g]); }
}
const percent = (p: number) => number(p / 100, { style: 'percent', maximumFractionDigits: 0 });
/** The next alarm or reminder that rings within half a day (its time), if any. */
export function nextRing(list: Reminder[], now: number): number | null {
  const times = list.filter(r => r.enabled && (r.kind === 'alarm' || r.kind === 'reminder' || !r.kind)).map(r => r.snoozed ?? r.due).filter((t): t is number => typeof t === 'number' && t > now && t - now <= 12 * 3600_000);
  return times.length ? Math.min(...times) : null;
}

/** Known short names, used before cutting a city's name (the full name stays in the label). */
const SHORT_CITY: Record<string, string> = {
  'new york': 'NYC', 'new york city': 'NYC', 'los angeles': 'LA', 'san francisco': 'SF', 'washington': 'DC', 'rio de janeiro': 'Rio',
  'frankfurt am main': 'Frankfurt', 'sankt petersburg': 'St. Petersburg', 'saint petersburg': 'St. Petersburg', 'mexico city': 'CDMX', 'ciudad de méxico': 'CDMX',
  'buenos aires': 'BA', 'hong kong': 'HK', 'kuala lumpur': 'KL', 'abu dhabi': 'Abu Dhabi',
};
/**
 * A city's name from longest to shortest, for the strip to take the first that fits: in full, its
 * known short name, then its first letters with one period ("İst.", never "…"; the letters as
 * written, so İ stays İ), never fewer than three. Names of four letters or fewer are not cut.
 */
export function cityForms(name: string): string[] {
  const full = name.trim(), out = [full];
  const known = SHORT_CITY[full.toLocaleLowerCase()]; if (known) out.push(known);
  const letters = [...(full.split(/[\s,-]/)[0] ?? full)];
  if (letters.length > 4) for (let n = Math.min(letters.length - 1, 6); n >= 3; n--) { const cut = letters.slice(0, n).join(''); if (/\p{L}$/u.test(cut)) out.push(`${cut}.`); }
  return [...new Set(out)];
}
/** Words a headphone's name carries that say nothing about which one it is. */
const GENERIC = /^(pro|max|plus|mini|lite|stereo|hands-?free|headset|headphones?|earphones?|earbuds|wireless|bluetooth|audio|le|kopfhörer|kulaklık|casque|auriculares|cuffie|fones?)$/iu;
/**
 * A headphone's name from longest to shortest: the system's name without "(Stereo)" and the like
 * and without the generic words at its end ("AirPods Pro" → "AirPods"), then its first word, then
 * the plain word for headphones. Never with a space or "…" at the end.
 */
export function deviceForms(name: string, generic: string): string[] {
  let words = name.replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1 && GENERIC.test(words[words.length - 1])) words = words.slice(0, -1);
  if (words.length === 1 && GENERIC.test(words[0])) words = [];
  const base = words.join(' ').trim(), out = base ? [base] : [];
  if (words.length > 1) out.push(words[0]);
  out.push(generic);
  return [...new Set(out)];
}

/** What the strip shows beside the time, in order, from what the user turned on and what is known.
 *  Each item comes in versions from longest to shortest (`forms`); the strip shows the first that fits. */
export function stripItems(status: IslandStatus, choice: Choice, next: number | null, l: Translate, now = Date.now()): StripItem[] {
  const out: StripItem[] = [];
  const b = status.battery;
  // Without the mascot the battery stands in the small island's left end instead.
  if (choice.statusBattery && b && !choice.hideMascot) out.push({ id: 'battery', forms: [`${batteryRing(b.percent, b.charging, 16)}<span>${percent(b.percent)}</span>`], label: l(b.charging ? 'strip.battery_charging' : 'strip.battery', { percent: percent(b.percent) }) });
  const w = status.weather;
  // Only a current reading with its temperature: a reading older than three hours is not today's
  // weather any more, and the city alone says nothing.
  if (choice.statusWeather && w && now - w.at < 3 * 3600_000 && Number.isFinite(w.temperature)) {
    const t = number(w.temperature, { style: 'unit', unit: 'celsius', maximumFractionDigits: 0 }), pic = icon(weatherKind(w.code), 16);
    const temp = `<span class="cap-temp">${t}</span>`;
    out.push({ id: 'weather', forms: [...(w.place ? cityForms(w.place).map(c => `${pic}<span class="cap-place">${escape(c)}</span>${temp}`) : []), `${pic}${temp}`], label: l('strip.weather', { temperature: t, place: w.place }) });
  }
  const a = status.audio;
  if (choice.statusAudio && a && (a.kind === 'headphones' || a.kind === 'headset')) {
    const forms = deviceForms(a.name, l('strip.headphones_default')), name = forms[0];
    out.push({ id: 'audio', forms: forms.map(n => `${icon('headphones', 14)}<span>${escape(n)}</span>`), label: l(a.kind === 'headset' ? 'strip.headset' : 'strip.headphones', { name }) });
  }
  if (choice.statusAlarm && next !== null) {
    const time = dateTime({ hour: 'numeric', minute: '2-digit' }).format(next);
    out.push({ id: 'alarm', forms: [`${icon('bell', 13)}<span>${time}</span>`], label: l('strip.next_alarm', { time }) });
  }
  return out;
}
const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const STEP_MS = 5000;
/** `wide`: a larger span off the middle, taken when the item's fullest version fits only there. */
type Room = { left: number; width: number; wide?: { left: number; width: number } };
/**
 * Turns the capsule's middle between the time (`clock`, kept as it is) and `extra`. Both stay in the
 * span the island's ends leave free (`room`): an item takes the longest of its versions that fits
 * there; the time stays in the island's middle unless that would touch what is at an end, then it
 * moves into the free span's middle.
 */
export function createStrip(strip: HTMLElement, clock: HTMLElement, extra: HTMLElement, paused: () => boolean, room: () => Room | null = () => null, turned: (onExtra: boolean) => void = () => {}) {
  let items: StripItem[] = [], turn = 0, onExtra = false, timer: ReturnType<typeof setInterval> | undefined;
  const natural = (el: HTMLElement) => { el.classList.add('measure'); const w = el.offsetWidth; el.classList.remove('measure'); return w; };
  const place = (el: HTMLElement, r: Room | null) => {
    el.classList.toggle('placed', !!r);
    if (r) { el.style.setProperty('--extra-left', `${Math.round(r.left)}px`); el.style.setProperty('--extra-room', `${Math.round(r.width)}px`); }
  };
  const placeClock = () => {
    const r = room(), w = natural(clock), mid = strip.clientWidth / 2;
    place(clock, r && (mid - w / 2 < r.left || mid + w / 2 > r.left + r.width) ? r : null);
  };
  const show = (item: StripItem | null) => {
    onExtra = !!item;
    // The ends may change with the turn (the working count steps aside): told first, then measured.
    turned(onExtra);
    if (item) {
      let r = room();
      if (r?.wide) { extra.innerHTML = item.forms[0]; if (natural(extra) > r.width && natural(extra) <= r.wide.width) r = r.wide; }
      const space = r ? r.width : strip.clientWidth;
      place(extra, r);
      let chosen = item.forms[item.forms.length - 1];
      for (const form of item.forms) { extra.innerHTML = form; if (natural(extra) <= space) { chosen = form; break; } }
      if (extra.innerHTML !== chosen) extra.innerHTML = chosen;
      extra.setAttribute('aria-label', item.label); extra.dataset.item = item.id;
    } else placeClock();
    strip.classList.toggle('on-extra', onExtra);
  };
  const tick = () => {
    if (paused() || !items.length) return;
    // The time between every two items: time, item 1, time, item 2, …
    if (onExtra) show(null); else { show(items[turn % items.length]); turn++; }
  };
  return {
    set(next: StripItem[]) {
      const same = next.length === items.length && next.every((x, i) => x.id === items[i].id);
      items = next;
      if (!items.length) { show(null); clearInterval(timer); timer = undefined; return; }
      if (onExtra) { const now = items.find(x => x.id === extra.dataset.item); if (now) show(now); else show(null); }
      if (!timer || !same) { clearInterval(timer); timer = setInterval(tick, STEP_MS); }
    },
    /** What is at the ends changed: the shown item or the time is fitted again. */
    relayout() { if (onExtra) { const now = items.find(x => x.id === extra.dataset.item); if (now) show(now); } else placeClock(); },
    /** Tests: shows one item (or the time, null) now, as the turn would. */
    showItem(id: ItemId | null) { const item = id ? items.find(x => x.id === id) ?? null : null; show(item); return !!item || !id; },
    dispose() { clearInterval(timer); },
  };
}