import { LANGUAGES, number, resolveLanguage } from '../i18n';
import type { Translate } from '../i18n';
import type { Bridge, MonitorInfo, NotifyChoice, Settings, Snapshot, ToolsState } from '../shared/contract';
import { DEFAULT_SETTINGS, RANGES, defaultsOf, shortcutOf, type SECTIONS } from '../shared/settings';
import { escapeHtml as e } from './state';
import { icon } from './icons';
import { connectError } from './first-run';
import { mountCityPicker } from './city-picker';

type L = Translate;
type RangeKey = keyof typeof RANGES;
type NotifyKey = 'notifyRequest' | 'notifyError' | 'notifyReply' | 'notifyFocus' | 'notifyReminder';
type PlaceKey = 'restDesktop' | 'restApps' | 'restBrowsers' | 'fullscreenRest';

/** A tiny picture of the screen's top edge with the island resting on it as chosen: the small
 *  island (with its clock), the thin line, or nothing (an arrow: it opens from the edge). */
const restPicture = (look: string) => `<svg class="rest-pic" viewBox="0 0 64 26" aria-hidden="true"><rect x="1" y="1" width="62" height="24" rx="4" class="rp-screen"/>${
  look === 'capsule' ? '<path d="M20 1h24v7a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4Z" class="rp-island"/><rect x="29" y="5" width="6" height="2" rx="1" class="rp-clock"/>'
  : look === 'line' ? '<rect x="25" y="1" width="14" height="2.6" rx="1.3" class="rp-line"/>'
  : '<path d="M32 13V5m-3 3 3-3 3 3" class="rp-arrow"/>'}</svg>`;

/**
 * The settings, on their own panel (the gear in the office or in the notch): four groups,
 * short labels with their limits and units, each group with "Varsayılana dön". Every control
 * saves at once through the app, which applies it in both windows; a failed save puts the
 * control back and says why. Controls are updated in place, so a change keeps the panel's
 * scroll and the keyboard focus.
 */
export function createSettingsPanel(host: HTMLElement, bridge: Bridge, o: { l: () => L; toast: (text: string) => void; snapshot: () => Snapshot | undefined; setDemo: (on: boolean) => Promise<void>; setClaudeHooks: (on: boolean) => Promise<void> }) {
  let signs: string[] = [], tools: ToolsState | null = null;
  // The Claude Code connection as it is now: what it says, and the one or two steps it offers.
  const refreshTools = async () => { tools = await bridge.toolsState().catch(() => null); showTools(); };
  const showTools = () => {
    const l = o.l(), said = panel.querySelector('[data-claude-state]'), actions = panel.querySelector('[data-claude-actions]');
    if (!said || !actions) return;
    const state = tools?.claude.state, reason = tools?.claude.reason;
    said.classList.toggle('warn', state === 'broken' || state === 'unreadable');
    said.textContent = !tools ? l('settings.desktop_only') : state === 'absent' ? l('settings.tool_not_found') : state === 'on' ? l('settings.events_are_forwarded_here_its') : state === 'off' ? l('settings.claude_not_connected')
      : state === 'unreadable' ? l('link.unreadable') : reason === 'helper_missing' ? l('link.broken_helper_missing') : reason === 'old_path' ? l('link.broken_old_path') : l('link.broken_partial');
    // From the Store, removing the app cannot take its entries out of Claude Code: said while connected.
    if (tools?.packaged && state === 'on') said.textContent += `${/[\p{L}\p{N})]$/u.test(said.textContent ?? '') ? '.' : ''} ${l('settings.store_remove_first')}`;
    const button = (act: string, text: string, danger = false) => `<button class="set-small${danger ? ' danger' : ''}" data-claude="${act}">${e(text)}</button>`;
    // A tool's own hooks (Codex, Cursor): what they give, the one step in the tool (Codex: trust them
    // once), whether their events arrive, and Connect / Repair / Remove.
    for (const id of ['codex', 'cursor']) {
      const p = tools?.providers?.find(x => x.id === id), st = panel.querySelector(`[data-hooks-state="${id}"]`), act = panel.querySelector(`[data-hooks-actions="${id}"]`);
      if (!st || !act) continue;
      const s = p?.link.state, arriving = !!p && (p.capabilities.liveWaitingPermission || (id === 'cursor' && p.capabilities.liveWorking));
      st.classList.toggle('warn', s === 'broken' || s === 'unreadable');
      st.textContent = !p ? '' : !p.present ? (id === 'cursor' ? l('settings.tool_not_found') : '') : s === 'on' ? (arriving ? l('settings.hooks_receiving') : l(id === 'codex' ? 'settings.codex_hooks_trust' : 'settings.cursor_hooks_waiting'))
        : s === 'off' ? l(id === 'codex' ? 'settings.codex_hooks_off' : 'settings.cursor_hooks_off') : s === 'unreadable' ? l('settings.hooks_file_unreadable', { tool: p.name }) : l('settings.hooks_broken');
      const b = (a: string, text: string) => `<button class="set-small" data-hooks="${id}:${a}">${e(text)}</button>`;
      const html = !p?.present ? '' : s === 'on' ? b('off', l('settings.disconnect')) : s === 'off' ? b('on', l('settings.connect_hooks')) : s === 'broken' ? b('repair', l('link.repair')) + b('off', l('settings.disconnect')) : '';
      if (act.innerHTML !== html) act.innerHTML = html;
    }
    const html = state === 'on' ? button('off', l('settings.disconnect')) : state === 'off' ? button('on', l('link.connect')) : state === 'broken' ? button('repair', l('link.repair')) + button('off', l('settings.disconnect')) : '';
    if (actions.innerHTML !== html) actions.innerHTML = html;
  };
  let city: ReturnType<typeof mountCityPicker> | null = null;
  let current: Settings = { ...DEFAULT_SETTINGS }, monitors: MonitorInfo[] = [], held: boolean[] | null = null, quiet: string | null = null, recording: 'shortcutOpen' | 'shortcutMute' | null = null;
  const panel = document.createElement('aside');
  panel.className = 'settings-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'settings-title');
  host.append(panel);

  // Seconds and minutes in the language's own abbreviation; ms and % are the same everywhere.
  const unitText = (unit: string) => unit === 's' ? o.l()('settings.unit_seconds') : unit === 'min' ? o.l()('settings.unit_minutes') : unit;
  const range = (k: RangeKey, label: string, hint = '') => { const r = RANGES[k]; return `<div class="set-row"><label for="set-${k}"><b>${e(label)}</b><small>${e(hint ? `${hint} · ` : '')}${number(r.min)}–${number(r.max)}${r.unit ? ` ${unitText(r.unit)}` : ''}</small></label><span class="set-range"><input id="set-${k}" type="range" data-k="${k}" min="${r.min}" max="${r.max}" step="${r.step}"><output data-out="${k}"></output></span></div>`; };
  const toggle = (k: keyof Settings, label: string, hint = '', invert = false) => `<div class="set-row"><label for="set-${k}"><b>${e(label)}</b>${hint ? `<small>${e(hint)}</small>` : ''}</label><input id="set-${k}" type="checkbox" class="switch" data-k="${k}"${invert ? ' data-invert' : ''}></div>`;
  const group = (id: keyof typeof SECTIONS, title: string, body: string, reset = true) => `<section class="set-group" aria-labelledby="sg-${id}"><header><h3 id="sg-${id}">${e(title)}</h3>${reset ? `<button class="set-reset" data-reset="${id}">${e(o.l()('settings.reset_to_defaults'))}</button>` : ''}</header>${body}</section>`;

  function build() {
    const lookName = (v: string) => ({ capsule: o.l()('settings.small_island'), line: o.l()('settings.thin_line'), hidden: o.l()('settings.hidden') } as Record<string, string>)[v] ?? v;
    const l = o.l(), scroll = panel.querySelector('.sp-body')?.scrollTop ?? 0, focused = (document.activeElement as HTMLElement | null)?.dataset?.k;
    const seg = (k: keyof Settings, options: [string, string][], label: string, hint: string) => `<div class="set-row wide"><span class="set-label"><b>${e(label)}</b><small data-hint="${k}">${e(hint)}</small></span><span class="set-seg" role="radiogroup" aria-label="${e(label)}">${options.map(([v, t]) => `<button role="radio" data-k="${k}" data-v="${v}">${e(t)}</button>`).join('')}</span></div>`;
    const notifyRow = (k: NotifyKey, label: string) => `<tr><th scope="row">${e(label)}</th><td><input type="checkbox" class="switch" data-n="${k}" data-f="open" aria-label="${e(`${label}: ${l('settings.open_the_notch')}`)}"></td><td><input type="checkbox" class="switch" data-n="${k}" data-f="sound" aria-label="${e(`${label}: ${l('settings.sound')}`)}"></td></tr>`;
    // One row per place: the same three looks, each with its picture; the chosen one is said below.
    const place = (k: PlaceKey, label: string, looks: string[]) => `<div class="set-row wide place-row"><span class="set-label"><b>${e(label)}</b><small data-hint="${k}"></small></span><span class="set-seg looks" role="radiogroup" aria-label="${e(label)}">${looks.map(v => `<button role="radio" data-k="${k}" data-v="${v}" title="${e(lookName(v))}">${restPicture(v)}<span>${e(lookName(v))}</span></button>`).join('')}</span></div>`;
    const shortcut = (k: 'shortcutOpen' | 'shortcutMute', label: string, i: number) => `<div class="set-row"><span class="set-label"><b>${e(label)}</b><small data-held="${i}"></small></span><button class="set-key" data-key="${k}" aria-label="${e(`${label}: ${l('settings.click_to_change')}`)}"></button></div>`;
    panel.innerHTML = `<header class="sp-head"><h2 id="settings-title">${e(l('settings.settings'))}</h2><button class="sp-close" data-close-settings aria-label="${e(l('settings.close'))}">${icon('close', 18)}</button></header><div class="sp-body">`
      + group('behaviour', l('settings.visibility'),
        `<p class="set-note">${e(l('settings.at_rest_the_island_can'))}</p>`
        + place('restDesktop', l('settings.on_the_desktop'), ['hidden', 'line', 'capsule'])
        + place('restApps', l('settings.over_apps'), ['hidden', 'line', 'capsule'])
        + place('restBrowsers', l('settings.over_browsers'), ['hidden', 'line', 'capsule'])
        + place('fullscreenRest', l('settings.in_full_screen'), ['hidden', 'line'])
        + `<p class="set-note">${e(l('settings.full_screen_is_only_a'))}</p>`
        + `<div class="set-row"><span class="set-label"><b>${e(l('settings.position'))}</b><small data-position></small></span><button class="set-small" data-center>${e(l('settings.centre'))}</button></div>`
        + `<div class="set-row"><label for="set-autostart"><b>${e(l('settings.start_with_windows'))}</b><small>${e(l('settings.start_with_windows_hint'))}</small></label><input id="set-autostart" type="checkbox" class="switch" data-autostart></div>`
        + range('hoverDelay', l('settings.open_delay'), l('settings.pointer_resting_on_it'))
        + range('closeDelay', l('settings.close_delay'), l('settings.after_the_pointer_leaves'))
        + `<div class="set-row"><label for="set-monitor"><b>${e(l('settings.screen'))}</b><small data-monitor-hint>${e(l('settings.the_monitor_the_island_is'))}</small></label><select id="set-monitor" data-k="monitor"></select><span class="set-value" data-monitor-one hidden></span></div>`

        + `<p class="set-note">${e(l('settings.keeping_the_small_island_shown'))}</p>`)
      + group('look', l('settings.look'),
        seg('islandTheme', [['glass', l('settings.glass')], ['dark', l('settings.dark')]], l('settings.island_look'), l('settings.glass_softens_what_is_behind'))
        + toggle('capturable', l('settings.show_in_screenshots'), l('settings.windows_cannot_both_capture_a'))
        + seg('lineColor', [['amber', l('settings.amber')], ['blue', l('settings.blue')], ['green', l('settings.green')], ['pink', l('settings.pink')], ['white', l('settings.white')]], l('settings.thin_line_colour'), l('settings.the_resting_line_s_light'))
        + seg('alertColors', [['warm', l('settings.warm')], ['cool', l('settings.cool')], ['contrast', l('settings.high_contrast')]], l('settings.notification_colours'), l('settings.a_question_and_a_permission'))
        + seg('clockStyle', [['time', l('settings.time')], ['date', l('settings.day_and_time')]], l('settings.small_island_clock'), '')
        + toggle('hideMascot', l('settings.hide_the_mascot'), l('settings.no_mascot_on_the_small'))
        // The small island's status strip: what it shows in turn beside the time.
        + toggle('statusBattery', l('settings.status_battery'), l('settings.status_battery_hint'))
        + toggle('statusAudio', l('settings.status_audio'), l('settings.status_audio_hint'))
        + toggle('statusAlarm', l('settings.status_alarm'), l('settings.status_alarm_hint'))
        + toggle('statusWeather', l('settings.status_weather'), l('settings.status_weather_hint'))
        + `<div class="set-row city-row"><label for="set-weatherCity"><b>${e(l('settings.weather_city'))}</b><small id="city-said" class="city-said"></small></label><span class="city-box" data-city></span></div>`
        + toggle('idleMotion', l('settings.mascot_idle_moves'), l('settings.blinking_and_a_wave_now'))
        + seg('scale', [['90', l('settings.compact')], ['100', l('settings.normal')], ['110', l('settings.large')]], l('settings.size'), '90 · 100 · 110 %')
        + range('glassDarkness', l('settings.glass_darkness'), l('settings.50_is_the_default_look'))
        + toggle('restLight', l('settings.resting_light'), l('settings.a_waiting_request_still_shows'))
        + range('lightBrightness', l('settings.light_brightness'))
        + range('breathSpeed', l('settings.breathing_speed'), l('settings.100_is_normal'))
        + range('animationSpeed', l('settings.animation_speed'), l('settings.100_is_normal'))
        + toggle('reducedMotion', l('settings.reduce_motion'), l('settings.turns_animations_off'))
        + `<div class="set-row"><label for="set-language"><b>${e(l('settings.language'))}</b></label><select id="set-language" data-k="language">${[['system', l('settings.language_system', { name: LANGUAGES.find(x => x.id === resolveLanguage('system'))!.name })] as const, ...LANGUAGES.map(x => [x.id, x.name] as const)].map(([v, name]) => `<option value="${v}"${v === 'system' ? '' : ` lang="${LANGUAGES.find(x => x.id === v)!.locale}"`}>${e(name)}</option>`).join('')}</select></div>`)
      + group('pages', l('settings.modules'),
        `<p class="set-note">${e(l('settings.turn_pages_on_or_off'))}</p>` +
        `<ul class="set-pages" aria-label="${e(l('settings.pages_and_their_order'))}"></ul>`
        + `<div class="set-row wide"><span class="set-label"><b>${e(l('settings.system_signs'))}</b><small>${e(l('settings.shown_briefly_on_the_closed'))}</small></span><span class="set-signs" data-signs></span></div>`
        + toggle('lyricsOnline', l('settings.get_lyrics_from_lrclib'), l('settings.when_lyrics_are_opened_on'))
        + `<div class="set-row"><label for="set-startPage"><b>${e(l('settings.start_page'))}</b></label><select id="set-startPage" data-k="startPage"></select></div>`
        + seg('collapsed', [['auto', l('settings.automatic')], ['agents', l('settings.agents')], ['media', l('settings.media')], ['focus', l('settings.focus')]], l('settings.when_closed'), l('settings.automatic_a_waiting_request_a'))
        + range('focusMinutes', l('settings.focus_length')) + range('shortBreak', l('settings.short_break')) + range('longBreak', l('settings.long_break')) + range('longEvery', l('settings.long_break_every'), l('settings.after_how_many_focus_rounds')))
      + group('notify', l('settings.notifications'),
        toggle('muted', l('settings.sound_2'), '', true)
        + seg('sound', [['soft', l('settings.soft')], ['bell', l('settings.bell')], ['pop', l('settings.pop')], ['double', l('settings.double')]], l('settings.notification_sound'), l('settings.a_sample_plays_only_with'))
        + `<div class="set-row"><label for="set-volume"><b>${e(l('settings.volume'))}</b><small>${e(`${number(0)}–${number(100)} %`)}</small></label><span class="set-range"><input id="set-volume" type="range" data-k="volume" min="0" max="100" step="5"><output data-out="volume"></output><button class="set-small" data-sample>${e(l('settings.test_sound'))}</button></span></div>`
        + `<table class="set-table"><thead><tr><th></th><th scope="col">${e(l('settings.open_notch'))}</th><th scope="col">${e(l('settings.sound_2'))}</th></tr></thead><tbody>${notifyRow('notifyRequest', l('settings.questions_and_permissions'))}${notifyRow('notifyError', l('settings.errors'))}${notifyRow('notifyReply', l('settings.replies'))}${notifyRow('notifyFocus', l('settings.focus_period_ended'))}${notifyRow('notifyReminder', l('settings.reminders'))}</tbody></table>`
        + range('alertHold', l('settings.stays_open_for'), l('settings.not_while_the_pointer_is'))
        + toggle('quietFullscreen', l('settings.quiet_in_full_screen'), l('settings.nothing_opens_or_sounds_light'))
        + toggle('quietDnd', l('settings.quiet_with_do_not_disturb'), l('settings.windows_focus_assist'))
        + `<p class="set-status" data-quiet></p>`
        + shortcut('shortcutOpen', l('settings.open_notch_shortcut'), 0)
        + shortcut('shortcutMute', l('settings.mute_shortcut'), 1)
        + seg('notifyClick', [['office', l('settings.show_the_agent_in_the')], ['source', l('settings.open_the_chat_directly')]], l('settings.clicking_a_notification_or_a'), l('settings.the_chat_opens_in_the'))
        + seg('askHold', [['0', l('settings.off')], ['30', l('settings.30_s')], ['120', l('settings.2_min')], ['600', l('settings.10_min')]], l('settings.answer_claude_questions_here'), l('settings.for_this_long_the_question'))
        + `<p class="set-note">${e(l('settings.seeing_a_notification_or_opening'))}</p>`)
      + `<details class="set-advanced"><summary>${e(l('settings.advanced_connections_demo_office_reset'))}</summary>`
      + group('advanced', l('settings.connections_and_advanced'),
        `<div class="set-row"><label for="set-demo"><b>${e(l('settings.demo_office'))}</b><small>${e(l('settings.shows_demo_data_instead_of'))}</small></label><input id="set-demo" type="checkbox" class="switch" data-demo></div>`
        + `<p class="set-note">${e(l('settings.work_board_records_stay_on'))}</p>`
        + `<div class="set-row"><span class="set-label"><b>Claude Code</b><small data-claude-state>${e(l('settings.events_are_forwarded_here_its'))}</small></span><span class="set-buttons" data-claude-actions></span></div>`
        + `<div class="set-row"><span class="set-label"><b>Codex</b><small data-codex></small><small data-hooks-state="codex"></small></span><span class="set-buttons" data-hooks-actions="codex"></span></div>`
      + `<div class="set-row"><span class="set-label"><b>Cursor</b><small data-hooks-state="cursor"></small></span><span class="set-buttons" data-hooks-actions="cursor"></span></div>`
        + `<div class="set-row"><span class="set-label"><b>${e(l('settings.all_settings'))}</b><small>${e(l('settings.office_names_managers_and_the'))}</small></span><button class="set-small danger" data-reset-all>${e(l('settings.reset'))}</button></div>`, false) + `</details>`
      + `</div>`;
    const body = panel.querySelector<HTMLElement>('.sp-body')!; body.scrollTop = scroll;
    city?.dispose(); city = mountCityPicker(panel.querySelector<HTMLElement>('[data-city]')!, panel.querySelector<HTMLElement>('#city-said')!, { bridge, l: o.l, settings: () => current, save });
    sync(current);
    if (focused) panel.querySelector<HTMLElement>(`[data-k="${focused}"]`)?.focus();
    void refreshTools();
    void bridge.autostart().then(on => { const el = panel.querySelector<HTMLInputElement>('[data-autostart]'); if (el) el.checked = on; }).catch(() => { const el = panel.querySelector<HTMLInputElement>('[data-autostart]'); if (el) el.disabled = true; });
  }

  // Controls show the settings as saved (never a value that did not save).
  function sync(s: Settings) {
    const l = o.l();
    current = s;
    panel.querySelectorAll<HTMLInputElement>('input[type=range][data-k]').forEach(el => { const k = el.dataset.k as RangeKey; el.value = String(s[k]); const out = panel.querySelector(`[data-out="${k}"]`); if (out) out.textContent = `${number(s[k] as number)}${(RANGES as Record<string, { unit: string }>)[k]?.unit ? ` ${unitText((RANGES as Record<string, { unit: string }>)[k].unit)}` : ''}`; });
    city?.sync();
    panel.querySelectorAll<HTMLInputElement>('input[type=checkbox][data-k]').forEach(el => { const v = Boolean(s[el.dataset.k as keyof Settings]); el.checked = el.hasAttribute('data-invert') ? !v : v; });
    panel.querySelectorAll<HTMLInputElement>('input[data-n]').forEach(el => { el.checked = (s[el.dataset.n as NotifyKey] as NotifyChoice)[el.dataset.f as keyof NotifyChoice]; });
    panel.querySelectorAll<HTMLButtonElement>('.set-seg button').forEach(b => { const on = String(s[b.dataset.k as keyof Settings]) === b.dataset.v; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    for (const k of ['restDesktop', 'restApps', 'restBrowsers', 'fullscreenRest'] as PlaceKey[]) {
      const hint = panel.querySelector(`[data-hint="${k}"]`);
      if (hint) hint.textContent = ({ capsule: l('settings.small_island_the_clock_and'), line: l('settings.thin_line_opens_on_hover'), hidden: l('settings.hidden_nothing_shows_opens_when') } as Record<string, string>)[s[k]] ?? '';
    }
    const position = panel.querySelector('[data-position]'), screenName = s.monitor || monitors.find(m => m.primary)?.name || '';
    const share = s.positions[screenName];
    if (position) position.textContent = share === undefined ? l('settings.in_the_middle_drag_the') : l('settings.from_the_left_kept_for', { round: Math.round(share * 100) });
    const monitor = panel.querySelector<HTMLSelectElement>('[data-k="monitor"]');
    const one = panel.querySelector<HTMLElement>('[data-monitor-one]');
    if (monitor && one) {
      const single = monitors.length <= 1;
      monitor.hidden = single; one.hidden = !single;
      one.textContent = single ? l('settings.one_screen', { v: monitors[0] ? ` · ${monitors[0].label.replace(/^Ekran \d+ /, '').replace(/[()]/g, '')}` : '' }) : '';
      // One entry per screen: the main screen is the automatic choice (it follows whichever
      // screen is the main one), not a second entry for the same screen.
      if (!single) { monitor.innerHTML = monitors.map(m => `<option value="${m.primary ? '' : e(m.name)}">${e(m.label)}${m.primary ? e(l('settings.main_screen_automatic')) : ''}</option>`).join(''); monitor.value = monitors.some(m => m.name === s.monitor && !m.primary) ? s.monitor : ''; }
    }
    const language = panel.querySelector<HTMLSelectElement>('[data-k="language"]'); if (language) language.value = s.language;
    const signBox = panel.querySelector('[data-signs]');
    const signName = (k: string) => ({ volume: l('settings.volume_2'), caps: 'Caps Lock', language: l('settings.keyboard_language'), battery: l('settings.battery_and_charging'), wifi: 'Wi-Fi', audio: l('settings.headphones_sound_output') } as Record<string, string>)[k] ?? k;
    if (signBox) { const html = signs.length ? signs.map(k => `<label><input type="checkbox" class="switch" data-sign="${k}" ${s.indicators.includes(k as never) ? 'checked' : ''}>${e(signName(k))}</label>`).join('') : `<small>${e(l('settings.reading'))}</small>`; if (signBox.innerHTML !== html) signBox.innerHTML = html; }
    const pageName = (id: string) => ({ water: l('settings.water'), shelf: l('settings.file_shelf'), agents: l('settings.agents'), media: l('settings.media'), notes: l('settings.notes_and_to_dos'), focus: l('settings.focus_and_timer'), alarms: l('settings.reminders_and_alarms') } as Record<string, string>)[id] ?? id;
    const pages = panel.querySelector('.set-pages');
    if (pages) pages.innerHTML = s.pages.map((p, i) => `<li><label><input type="checkbox" class="switch" data-page-on="${p.id}" ${p.on ? 'checked' : ''} ${p.id === 'agents' ? 'disabled title="' + e(l('settings.agents_is_always_on_questions')) + '"' : ''}><b>${e(pageName(p.id))}</b></label><span class="set-move"><button data-page-move="${p.id}" data-by="-1" ${i === 0 ? 'disabled' : ''} aria-label="${e(l('settings.up'))}">↑</button><button data-page-move="${p.id}" data-by="1" ${i === s.pages.length - 1 ? 'disabled' : ''} aria-label="${e(l('settings.down'))}">↓</button></span></li>`).join('');
    const start = panel.querySelector<HTMLSelectElement>('[data-k="startPage"]');
    if (start) { start.innerHTML = `<option value="last">${e(l('settings.last_used'))}</option>${s.pages.filter(p => p.on).map(p => `<option value="${p.id}">${e(pageName(p.id))}</option>`).join('')}`; start.value = s.startPage === 'last' || s.pages.some(p => p.on && p.id === s.startPage) ? s.startPage : 'last'; }
    panel.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(b => { const k = b.dataset.key as 'shortcutOpen' | 'shortcutMute'; b.textContent = recording === k ? l('settings.press_keys_esc_cancel') : s[k].replace('Space', l('settings.space')); b.classList.toggle('recording', recording === k); });
    panel.querySelectorAll<HTMLElement>('[data-held]').forEach(el => { const i = Number(el.dataset.held); el.textContent = held === null ? '' : held[i] ? l('settings.working') : l('settings.taken_by_another_app_not'); el.classList.toggle('warn', held !== null && !held[i]); });
    const q = panel.querySelector('[data-quiet]'); if (q) q.textContent = quiet === 'fullscreen' ? l('settings.full_screen_now_notifications_are') : quiet === 'dnd' ? l('settings.do_not_disturb_is_on') : l('settings.notifications_are_on_now');
    const demo = panel.querySelector<HTMLInputElement>('[data-demo]'); if (demo) demo.checked = o.snapshot()?.mode === 'demo';
    const codex = panel.querySelector('[data-codex]'); const c = o.snapshot()?.connections.find(x => x.provider === 'codex'); if (codex) codex.textContent = tools && !tools.tools.codex ? l('settings.tool_not_found') : c?.status === 'connected' ? l('settings.reading_its_session_records') : l('settings.no_records_read_yet');
    showTools();
  }

  const save = async (patch: Partial<Settings>) => {
    try { sync(await bridge.setSettings(patch)); }
    catch (err) { o.toast(String(err instanceof Error ? err.message : err)); sync(current); }
    void refreshStatus();
  };
  const refreshStatus = async () => {
    held = await bridge.shortcuts().catch(() => null);
    quiet = (await bridge.notifyPrefs().catch(() => null))?.quiet ?? null;
    if (!panel.hidden) sync(current);
  };

  const click = (event: MouseEvent) => {
    const t = event.target as HTMLElement, b = t.closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.hasAttribute('data-close-settings')) close();
    else if (b.dataset.v !== undefined && b.dataset.k) { const k = b.dataset.k as keyof Settings; void save({ [k]: k === 'scale' || k === 'askHold' ? Number(b.dataset.v) : b.dataset.v } as Partial<Settings>); }
    else if (b.dataset.reset) void save(defaultsOf(b.dataset.reset as keyof typeof SECTIONS));
    else if (b.hasAttribute('data-reset-all')) void save({ ...defaultsOf('look'), ...defaultsOf('behaviour'), ...defaultsOf('pages'), ...defaultsOf('notify') });
    else if (b.hasAttribute('data-center')) void bridge.notchMove('center').then(refreshStatus).catch(err => o.toast(String(err)));
    else if (b.hasAttribute('data-sample')) void bridge.playChime(Number(panel.querySelector<HTMLInputElement>('[data-k="volume"]')?.value ?? current.volume), current.sound).catch(err => o.toast(String(err)));
    else if (b.dataset.pageMove) { const list = [...current.pages]; const at = list.findIndex(p => p.id === b.dataset.pageMove), to = at + Number(b.dataset.by); if (at >= 0 && to >= 0 && to < list.length) { [list[at], list[to]] = [list[to], list[at]]; void save({ pages: list }); } }
    else if (b.dataset.key) { recording = recording === b.dataset.key ? null : b.dataset.key as typeof recording; sync(current); b.focus(); }
    else if (b.dataset.hooks) {
      const [id, act] = b.dataset.hooks.split(':'); b.disabled = true;
      void (act === 'off' ? bridge.disconnectHooks(id) : bridge.connectHooks(id)).then(() => { if (act !== 'off') o.toast(o.l()(act === 'repair' ? 'link.repaired' : 'link.connected')); }).catch(err => o.toast(connectError(err, o.l()))).finally(() => void refreshTools());
    }
    else if (b.dataset.claude) {
      // Connect and repair are one step (the helper in place, the entries written again); removing takes only ours.
      const act = b.dataset.claude; b.disabled = true;
      // Removed on purpose: the office's line does not offer it back.
      if (act === 'off') { try { localStorage.setItem('agentoffice-link-offer-dismissed', '1'); } catch { /* It may offer it once. */ } }
      const work = act === 'off' ? o.setClaudeHooks(false) : bridge.connectTools().then(() => o.toast(o.l()(act === 'repair' ? 'link.repaired' : 'link.connected')));
      void work.catch(err => o.toast(connectError(err, o.l()))).finally(() => void refreshTools());
    }
  };
  const change = (event: Event) => {
    const el = event.target as HTMLInputElement;
    if (el.hasAttribute('data-demo')) { void o.setDemo(el.checked).catch(err => o.toast(String(err))); return; }
    // Windows' own entry is the setting: the switch shows what Windows will do.
    if (el.hasAttribute('data-autostart')) { void bridge.setAutostart(el.checked).then(on => { el.checked = on; }).catch(err => { const why = String(err); o.toast(/disabled_by_(user|policy)/.test(why) ? o.l()(why.includes('policy') ? 'settings.startup_off_by_policy' : 'settings.startup_off_in_task_manager') : why); void bridge.autostart().then(on => { el.checked = on; }); }); return; }
    if (el.dataset.sign) { const k = el.dataset.sign as Settings['indicators'][number]; void save({ indicators: el.checked ? [...current.indicators.filter(x => x !== k), k] : current.indicators.filter(x => x !== k) }); return; }
    if (el.dataset.pageOn) { void save({ pages: current.pages.map(p => p.id === el.dataset.pageOn ? { ...p, on: el.checked } : p) }); return; }
    if (el.dataset.n) { const k = el.dataset.n as NotifyKey; void save({ [k]: { ...current[k], [el.dataset.f!]: el.checked } } as Partial<Settings>); return; }
    const k = el.dataset.k as keyof Settings | undefined; if (!k) return;
    if (el.type === 'checkbox') void save({ [k]: el.hasAttribute('data-invert') ? !el.checked : el.checked } as Partial<Settings>);
    else if (el.type === 'range') void save({ [k]: Number(el.value) } as Partial<Settings>);
    else void save({ [k]: el.value } as Partial<Settings>);
  };
  // A range shows its value while it moves; it saves when let go.
  const input = (event: Event) => { const el = event.target as HTMLInputElement; if (el.type === 'range' && el.dataset.k) { const out = panel.querySelector(`[data-out="${el.dataset.k}"]`); const unit = (RANGES as Record<string, { unit: string }>)[el.dataset.k]?.unit; if (out) out.textContent = `${number(Number(el.value))}${unit ? ` ${unitText(unit)}` : ''}`; } };
  const keydown = (event: KeyboardEvent) => {
    if (!recording) { if (event.key === 'Escape' && !panel.hidden) { event.stopPropagation(); close(); } return; }
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') { recording = null; sync(current); return; }
    const combo = shortcutOf(event); if (!combo) return;
    const k = recording; recording = null; void save({ [k]: combo } as Partial<Settings>);
  };
  panel.addEventListener('click', click); panel.addEventListener('change', change); panel.addEventListener('input', input); panel.addEventListener('keydown', keydown);

  const stopSettings = bridge.onSettings(s => { current = s; if (!panel.hidden) sync(s); });
  void bridge.getSettings().then(s => { current = s; }).catch(() => {});

  function open() { panel.hidden = false; build(); void bridge.indicatorsSupported().then(list => { signs = list; sync(current); }).catch(() => {}); void bridge.listMonitors().then(m => { monitors = m; sync(current); }).catch(() => {}); void refreshStatus(); panel.querySelector<HTMLElement>('.sp-close')?.focus(); }
  function close() { panel.hidden = true; recording = null; city?.dispose(); city = null; }
  return {
    open, close, get isOpen() { return !panel.hidden; },
    /** After a language change, the panel is built again in the new language (same scroll). */
    relabel() { if (!panel.hidden) build(); },
    refresh() { if (!panel.hidden) sync(current); },
    dispose() { void stopSettings.then(off => off()); city?.dispose(); panel.remove(); },
  };
}
