/**
 * The weather's city, picked rather than typed: as the user types (two letters or more, a moment
 * after the last key) Open-Meteo's geocoder is asked through the app, and its places come in a list
 * in the app's dropdown look: the city, its region and country, the country's code. Only a picked
 * place is saved (its name, country, coordinates and time zone), so a typo or one of several Parises
 * is never guessed. Under the label the state is said: saved (with a check), searching, nothing
 * found, offline. The × clears the place and turns the weather off: an empty field asks nothing.
 * A city typed before the picker is looked up once when the settings open; the user picks from it.
 *
 * Keys, as a combobox: Down / Up move in the list (opening it), Enter picks, Escape closes the list
 * and then puts back the saved name; leaving the field without a pick also puts it back.
 */
import { locale, type Translate } from '../i18n';
import type { Bridge, Settings, WeatherPlace } from '../shared/contract';
import { placeDetail, placeTitle } from '../shared/places';
import { escapeHtml as e } from './state';

const WAIT_MS = 300, GAP = 4, MARGIN = 8;
const CHECK = '<svg class="city-ok" viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><path d="M3 7.2 5.8 10 11 4.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
type State = 'idle' | 'searching' | 'results' | 'none' | 'offline';

export function mountCityPicker(box: HTMLElement, said: HTMLElement, o: { bridge: Bridge; l: () => Translate; settings: () => Settings; save: (patch: Partial<Settings>) => Promise<void> }) {
  box.innerHTML = `<input id="set-weatherCity" type="text" class="set-text city-input" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="city-list" maxlength="80" autocomplete="off" spellcheck="false"><span class="city-spin" aria-hidden="true" hidden></span><button type="button" class="city-clear" hidden>×</button>`;
  const input = box.querySelector<HTMLInputElement>('input')!, spin = box.querySelector<HTMLElement>('.city-spin')!, clear = box.querySelector<HTMLButtonElement>('.city-clear')!;
  said.setAttribute('aria-live', 'polite'); input.setAttribute('aria-describedby', said.id ||= 'city-said');
  const pop = document.createElement('div');
  pop.id = 'city-list'; pop.className = 'dd-pop city-pop'; pop.setAttribute('popover', 'manual'); pop.setAttribute('role', 'listbox');
  document.body.append(pop);
  let state: State = 'idle', found: WeatherPlace[] = [], active = -1, asked = 0, timer: ReturnType<typeof setTimeout> | undefined, editing = false, legacyAsked = '';

  const shown = () => pop.matches(':popover-open');
  const say = () => {
    const l = o.l(), s = o.settings();
    spin.hidden = state !== 'searching';
    clear.hidden = !(s.weatherPlace || s.weatherCity || input.value);
    clear.setAttribute('aria-label', l('settings.city_clear')); clear.title = l('settings.city_clear'); input.placeholder = l('settings.weather_city_placeholder');
    said.classList.toggle('warn', state === 'none' || state === 'offline' || (!editing && !s.weatherPlace && !!s.weatherCity));
    said.classList.toggle('ok', !editing && state !== 'none' && state !== 'offline' && !!s.weatherPlace);
    if (state === 'searching') said.textContent = l('settings.city_searching');
    else if (state === 'none') said.textContent = l('settings.city_not_found');
    else if (state === 'offline') said.textContent = l('settings.city_offline');
    else if (state === 'results') said.textContent = !editing && s.weatherCity && !s.weatherPlace ? l('settings.city_choose', { city: s.weatherCity }) : l('settings.city_pick_one');
    else if (s.weatherPlace) said.innerHTML = `${CHECK}${e(l('settings.city_saved', { place: placeTitle(s.weatherPlace, locale()) }))}`;
    else said.textContent = l('settings.weather_city_hint');
  };
  const close = () => { if (shown()) pop.hidePopover(); pop.classList.remove('dd-in'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const place = () => {
    const t = input.getBoundingClientRect();
    pop.style.minWidth = `${Math.max(t.width, 260)}px`; pop.style.maxWidth = `${Math.min(380, innerWidth - 2 * MARGIN)}px`;
    const below = innerHeight - MARGIN - (t.bottom + GAP), above = t.top - GAP - MARGIN;
    const natural = pop.getBoundingClientRect().height, down = natural <= below || below >= above;
    pop.style.maxHeight = `${Math.max(80, down ? below : above)}px`;
    const height = Math.min(natural, Math.max(80, down ? below : above)), width = pop.getBoundingClientRect().width;
    pop.style.left = `${Math.max(MARGIN, Math.min(t.left, innerWidth - MARGIN - width))}px`;
    pop.style.top = `${down ? t.bottom + GAP : t.top - GAP - height}px`;
    pop.classList.toggle('dd-up', !down);
  };
  const highlight = (i: number) => {
    active = i;
    pop.querySelectorAll('.dd-opt.active').forEach(x => x.classList.remove('active'));
    const el = pop.querySelector<HTMLElement>(`#city-opt-${i}`);
    if (el) { el.classList.add('active'); input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  };
  const open = () => {
    if (!found.length) { close(); return; }
    const saved = o.settings().weatherPlace, here = locale();
    pop.innerHTML = found.map((p, i) => {
      const on = !!saved && saved.latitude === p.latitude && saved.longitude === p.longitude;
      return `<div class="dd-opt city-opt${on ? ' on' : ''}" role="option" id="city-opt-${i}" data-i="${i}" aria-selected="${on}"><span class="city-code">${e(p.countryCode || '··')}</span><span class="city-names"><b>${e(p.name)}</b><small>${e(placeDetail(p, here))}</small></span></div>`;
    }).join('');
    pop.classList.toggle('dd-calm', !!box.closest('.reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!shown()) pop.showPopover();
    place(); input.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => pop.classList.add('dd-in'));
    highlight(active >= 0 && active < found.length ? active : -1);
  };
  const search = async (text: string, show: boolean) => {
    const n = ++asked;
    state = 'searching'; say();
    try {
      const list = await o.bridge.searchPlaces(text);
      if (n !== asked) return;
      found = list; state = list.length ? 'results' : 'none'; active = -1;
      if (show) open(); else close();
    } catch {
      if (n !== asked) return;
      found = []; state = 'offline'; close();
    }
    say();
  };
  // What the field shows when it is not being edited: the saved place, or the old typed city.
  const settle = () => { const s = o.settings(); input.value = s.weatherPlace?.name ?? s.weatherCity; };
  const pick = async (i: number) => {
    const p = found[i]; if (!p) return;
    close(); clearTimeout(timer); asked++; editing = false; state = 'idle'; found = [];
    input.value = p.name;
    await o.save({ weatherPlace: p, weatherCity: '', statusWeather: true });
    settle(); say();
  };

  input.addEventListener('input', () => {
    // What was found for the earlier text goes at once (never a stale list to click).
    editing = true; clearTimeout(timer); asked++; found = []; close(); const text = input.value.trim();
    if (text.length < 2) { state = 'idle'; say(); return; }
    state = 'searching';
    timer = setTimeout(() => void search(text, true), WAIT_MS);
    say();
  });
  input.addEventListener('focus', () => { if (found.length) open(); });
  input.addEventListener('keydown', event => {
    const k = event.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') { event.preventDefault(); if (!shown()) open(); if (found.length) highlight(k === 'ArrowDown' ? (active + 1) % found.length : (active <= 0 ? found.length : active) - 1); }
    else if (k === 'Enter') { if (shown() && found.length) { event.preventDefault(); void pick(active >= 0 ? active : 0); } }
    else if (k === 'Escape') {
      // The list first, then the edit; only then does Escape reach the panel (which closes).
      if (shown()) { event.preventDefault(); event.stopPropagation(); close(); }
      else if (editing) { event.preventDefault(); event.stopPropagation(); editing = false; asked++; state = 'idle'; found = []; settle(); say(); }
    }
  });
  input.addEventListener('blur', () => { if (!document.hasFocus()) return; close(); if (editing) { editing = false; clearTimeout(timer); asked++; state = 'idle'; found = []; settle(); say(); } });
  // A press in the list keeps the focus in the field (as the dropdown does).
  pop.addEventListener('pointerdown', event => event.preventDefault());
  pop.addEventListener('click', event => { const opt = (event.target as Element).closest<HTMLElement>('[data-i]'); if (opt) void pick(Number(opt.dataset.i)); });
  pop.addEventListener('pointermove', event => { const opt = (event.target as Element).closest<HTMLElement>('[data-i]'); if (opt && Number(opt.dataset.i) !== active) highlight(Number(opt.dataset.i)); });
  clear.addEventListener('click', () => { clearTimeout(timer); asked++; editing = false; state = 'idle'; found = []; close(); input.value = ''; void o.save({ weatherPlace: null, weatherCity: '', statusWeather: false }).then(() => { settle(); say(); }); });
  const outside = (event: PointerEvent) => { if (shown() && !pop.contains(event.target as Node) && !box.contains(event.target as Node)) close(); };
  // A scroll (also the panel bringing the focused field into view) moves the list with the field;
  // it closes only once the field is out of its scrolling box.
  const scrolled = (event: Event) => {
    if (!shown() || pop.contains(event.target as Node)) return;
    const t = input.getBoundingClientRect(), b = (box.closest('.sp-body') ?? document.documentElement).getBoundingClientRect();
    if (t.bottom < b.top || t.top > b.bottom) close(); else place();
  };
  addEventListener('pointerdown', outside, true); addEventListener('scroll', scrolled, true); addEventListener('resize', close);

  return {
    /** The settings as saved (another window, or this one after a save). */
    sync() {
      const s = o.settings();
      if (!editing && document.activeElement !== input) settle();
      // A city typed before the picker: looked up once (the user opened the settings), for a pick.
      if (!s.weatherPlace && s.weatherCity && legacyAsked !== s.weatherCity && !editing) { legacyAsked = s.weatherCity; void search(s.weatherCity, false); }
      say();
    },
    dispose() { clearTimeout(timer); asked++; close(); pop.remove(); removeEventListener('pointerdown', outside, true); removeEventListener('scroll', scrolled, true); removeEventListener('resize', close); },
  };
}
