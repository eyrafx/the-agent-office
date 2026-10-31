import { dateTime } from '../i18n';
import type { Translate } from '../i18n';
import type { Bridge, Reminder, Settings } from '../shared/contract';
import { escapeHtml as e } from '../ui/state';
import { icon } from '../ui/icons';

/** The countdown's one record among the app's reminders (it rings like them, also with the island closed). */
export const COUNTDOWN_ID = 'countdown';
const pad2 = (n: number) => String(n).padStart(2, '0');
const localAt = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
/** What a countdown has left (ms): running, until its end; paused, what it kept. */
export const countdownLeft = (r: Reminder | null | undefined, now: number) => !r ? 0 : r.enabled && r.ends ? Math.max(0, r.ends - now) : r.left ?? 0;

/**
 * The time tools, told apart in plain sight: Pomodoro (focus and break periods in a cycle), a
 * countdown (one span, e.g. 10 minutes, then it rings) and, a click away, an alarm (a time of
 * day, on the reminders page).
 *
 * The focus timer (Pomodoro): focus, short break, long break. Times are kept as the moment the
 * period ends on the wall clock, never as a count of ticks, so after the computer sleeps or the
 * island reloads it shows what is really left; a period that ended while nobody watched ends
 * once (its end is saved before anything sounds) and only sounds if it ended a moment ago.
 */
export type FocusMode = 'focus' | 'short' | 'long';
export interface FocusState {
  mode: FocusMode; status: 'idle' | 'running' | 'paused';
  /** The time tool shown on the page. */
  tool?: 'pomodoro' | 'countdown';
  /** Running: when it ends (ms, wall clock). Idle or paused: what is left (ms). */
  endsAt?: number; remaining?: number;
  /** Focus rounds finished in this cycle (a long break comes after `longEvery`). */
  round: number;
  /** The last period that ended, and when, for the short "done" line. */
  last?: { mode: FocusMode; at: number };
}
/** A period that ended longer ago than this (asleep, closed) ends without sound or opening. */
export const LATE_MS = 2 * 60_000;

export const durationOf = (mode: FocusMode, s: Pick<Settings, 'focusMinutes' | 'shortBreak' | 'longBreak'>) =>
  (mode === 'focus' ? s.focusMinutes : mode === 'short' ? s.shortBreak : s.longBreak) * 60_000;
export const leftOf = (st: FocusState, s: Pick<Settings, 'focusMinutes' | 'shortBreak' | 'longBreak'>, now: number) =>
  st.status === 'running' ? Math.max(0, (st.endsAt ?? now) - now) : st.remaining ?? durationOf(st.mode, s);
export const clockText = (ms: number) => { const t = Math.ceil(ms / 1000), m = Math.floor(t / 60), sec = t % 60; return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; };

/** What follows a period that ended: after focus a short break (a long one every `longEvery`), after a break focus. */
export function finish(st: FocusState, s: Pick<Settings, 'focusMinutes' | 'shortBreak' | 'longBreak' | 'longEvery'>, at: number): FocusState {
  const round = st.mode === 'focus' ? st.round + 1 : st.mode === 'long' ? 0 : st.round;
  const next: FocusMode = st.mode === 'focus' ? (round % s.longEvery === 0 ? 'long' : 'short') : 'focus';
  return { mode: next, status: 'idle', remaining: durationOf(next, s), round, last: { mode: st.mode, at } };
}

export function createFocusPage(el: HTMLElement, bridge: Bridge, o: { l: Translate; changed: () => void; report: (text: string) => void; newAlarm?: () => void }) {
  const { l } = o;
  let settings: Pick<Settings, 'focusMinutes' | 'shortBreak' | 'longBreak' | 'longEvery'> = { focusMinutes: 25, shortBreak: 5, longBreak: 15, longEvery: 4 };
  let state: FocusState = { mode: 'focus', status: 'idle', round: 0 };
  let loaded = false, timer: ReturnType<typeof setInterval> | undefined;
  // The tool shown (kept with the timer), and the countdown as the app keeps it.
  let tool: 'pomodoro' | 'countdown' = 'pomodoro', countdown: Reminder | null = null;
  const label = (m: FocusMode) => ({ focus: l('focus.focus'), short: l('focus.short_break'), long: l('focus.long_break') })[m];
  el.innerHTML = `<div class="time-tools"><div class="pg-tabs" role="tablist" aria-label="${e(l('focus.time_tools'))}"><button role="tab" data-tool="pomodoro" title="${e(l('focus.focus_and_break_periods_in'))}">${icon('target', 13)}<span>Pomodoro</span></button><button role="tab" data-tool="countdown" title="${e(l('focus.count_a_span_down_ring'))}">${icon('timer', 13)}<span>${e(l('focus.countdown'))}</span></button></div><button class="pg-quiet tool-alarm" title="${e(l('focus.an_alarm_at_a_time'))}">${icon('bell', 13)}<span>${e(l('focus.set_an_alarm'))}</span></button></div><div class="focus-page"><div class="focus-ring" aria-hidden="true"><svg class="ring-svg" viewBox="0 0 128 128"><defs><linearGradient id="focus-ring-grad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" class="ring-stop-a"/><stop offset="1" class="ring-stop-b"/></linearGradient><filter id="focus-ring-glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="2.4"/></filter></defs><g class="ring-rounds"></g><circle class="track-c" cx="64" cy="64" r="50"/><circle class="value-c" cx="64" cy="64" r="50" pathLength="1000"/><g class="ring-cap"><circle class="cap-glow" cx="114" cy="64" r="6"/><circle class="cap-dot" cx="114" cy="64" r="3.6"/></g></svg><span class="ring-in"><span class="ring-icon"></span><small class="ring-round"></small></span></div><div class="cd-main" hidden><div class="focus-line"><b class="cd-label">${e(l('focus.countdown'))}</b><span class="cd-ends"></span></div><span class="cd-time" role="timer" aria-live="off"></span><div class="cd-presets" data-noswipe>${[1, 3, 5, 10, 15, 30, 60].map(m => `<button data-cd-start="${m}">${m} ${e(l('focus.min'))}</button>`).join('')}<form class="cd-custom"><input type="number" min="1" max="600" class="cd-minutes" aria-label="${e(l('focus.minutes'))}" placeholder="${e(l('focus.min'))}"><button type="submit">${e(l('focus.start'))}</button></form></div><div class="cd-actions"><button class="cd-play"></button><button class="focus-pill cd-more">+1 ${e(l('focus.min'))}</button><button class="focus-pill cd-cancel">${e(l('focus.cancel'))}</button></div></div><div class="focus-main"><div class="focus-line"><b class="focus-mode"></b><span class="focus-round"></span></div><div class="focus-time-row"><button class="focus-adjust" data-adjust="-1" aria-label="${e(l('focus.one_minute_less'))}">−</button><span class="focus-time" role="timer" aria-live="off"></span><button class="focus-adjust" data-adjust="1" aria-label="${e(l('focus.one_minute_more'))}">+</button><button class="focus-reset icon-button" aria-label="${e(l('focus.reset'))}" title="${e(l('focus.reset'))}">${icon('reset', 16)}</button></div><small class="focus-sub"></small><div class="focus-actions"><button class="focus-pill" data-mode="short">${icon('cup', 14)}<span>${e(label('short'))}</span></button><button class="focus-play" aria-label="${e(l('focus.start'))}"></button><button class="focus-pill" data-mode="long">${icon('moon', 14)}<span>${e(label('long'))}</span></button><button class="focus-pill" data-mode="focus">${icon('target', 14)}<span>${e(label('focus'))}</span></button></div></div></div>`;
  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;

  const save = (next: FocusState) => { state = next; void bridge.saveDoc('focus', next).catch(err => o.report(String(err))); render(); o.changed(); };
  // A period that ended: saved first, then a sound or opening only if it ended just now.
  const check = () => {
    if (!loaded || state.status !== 'running' || (state.endsAt ?? 0) > Date.now()) return;
    const ended = state.endsAt ?? Date.now(), late = Date.now() - ended > LATE_MS;
    save(finish(state, settings, ended));
    if (!late) void bridge.notify("focus").catch(() => {});
  };
  // The ring: what has passed fills in the period's colour from the top, a dot at its end; the
  // cycle's rounds as fine arcs around it (done full, the one now faint); inside, the period's sign.
  const capOf = q<SVGGElement>('.ring-cap'), roundsOf = q<SVGGElement>('.ring-rounds');
  let ringKey = '';
  const ring = (passed: number, sign: string, roundText: string, done = 0, now = -1) => {
    const share = Math.max(0, Math.min(1, passed));
    q<SVGCircleElement>('.value-c').style.strokeDashoffset = String(1000 * (1 - share));
    capOf.setAttribute('transform', `rotate(${(share * 360).toFixed(2)} 64 64)`); capOf.classList.toggle('moving', share > 0);
    const n = Math.max(1, Math.min(12, settings.longEvery)), key = `${sign}|${roundText}|${n}|${done}|${now}`;
    if (key === ringKey) return; ringKey = key;
    const g = Math.min(0.07, 0.28 / n) / 2, R = 60, pt = (f: number) => `${(64 + R * Math.cos(f * 2 * Math.PI)).toFixed(2)} ${(64 + R * Math.sin(f * 2 * Math.PI)).toFixed(2)}`;
    roundsOf.innerHTML = Array.from({ length: n }, (_, i) => `<path class="${i < done ? 'done' : i === now ? 'now' : ''}" d="M${pt(i / n + g)} A${R} ${R} 0 0 1 ${pt((i + 1) / n - g)}"/>`).join('');
    q('.ring-icon').innerHTML = icon(sign, 24); q('.ring-round').textContent = roundText;
  };
  function renderCountdown(now: number) {
    const left = countdownLeft(countdown, now), running = !!countdown?.enabled && !!countdown.ends;
    q('.cd-time').textContent = clockText(countdown ? left : 0);
    q('.cd-presets').hidden = !!countdown; q('.cd-actions').hidden = !countdown;
    q('.cd-ends').textContent = running ? l('focus.ends', { format: dateTime({ hour: '2-digit', minute: '2-digit' }).format(new Date(countdown!.ends!)) }) : countdown ? l('focus.paused') : l('focus.pick_a_span');
    const play = q('.cd-play'); play.innerHTML = icon(running ? 'pause' : 'play', 18); play.setAttribute('aria-label', running ? l('focus.pause') : l('focus.resume'));
    ring(countdown ? 1 - left / Math.max(1, countdown.total ?? left) : 0, 'timer', '');
  }
  function render() {
    const now = Date.now(), left = leftOf(state, settings, now), total = durationOf(state.mode, settings);
    el.dataset.tool = tool;
    el.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tool === tool)));
    q('.cd-main').hidden = tool !== 'countdown'; q('.focus-main').hidden = tool !== 'pomodoro';
    if (tool === 'countdown') { el.dataset.mode = 'countdown'; renderCountdown(now); return; }
    el.dataset.mode = state.mode; el.dataset.status = state.status;
    q('.focus-mode').textContent = label(state.mode);
    q('.focus-round').textContent = l('focus.round', { min: Math.min(state.round + (state.mode === 'focus' ? 1 : 0), settings.longEvery), longEvery: settings.longEvery });
    const time = clockText(left); const t = q('.focus-time'); if (t.textContent !== time) t.textContent = time;
    const done = state.last && now - state.last.at < 90_000 && state.status === 'idle' ? (state.last.mode === 'focus' ? l('focus.focus_done_break_time') : l('focus.break_over')) : '';
    q('.focus-sub').textContent = done || (state.status === 'paused' ? l('focus.paused') : state.status === 'running' ? (state.mode === 'focus' ? l('focus.focus_time') : l('focus.break_time')) : l('focus.ready'));
    const finished = Math.min(settings.longEvery, state.mode === 'focus' ? state.round % settings.longEvery : state.round || 0);
    ring(1 - left / Math.max(1, total), ({ focus: 'target', short: 'cup', long: 'moon' } as const)[state.mode], `${Math.min(state.round + (state.mode === 'focus' ? 1 : 0), settings.longEvery)}/${settings.longEvery}`, finished, state.mode === 'focus' ? finished : -1);
    const running = state.status === 'running';
    const play = q('.focus-play'); play.innerHTML = icon(running ? 'pause' : 'play', 18); play.setAttribute('aria-label', running ? l('focus.pause') : state.status === 'paused' ? l('focus.resume') : l('focus.start'));
    el.querySelectorAll<HTMLButtonElement>('.focus-pill').forEach(b => { b.hidden = b.dataset.mode === state.mode; });
    el.querySelectorAll<HTMLButtonElement>('.focus-adjust').forEach(b => { b.hidden = state.status !== 'idle'; });
  }
  const act = (p: Promise<unknown>) => void p.catch(err => o.report(err instanceof Error ? err.message : String(err)));
  const startCountdown = (ms: number) => { const now = Date.now(); act(bridge.saveReminder({ id: COUNTDOWN_ID, title: l('focus.countdown'), at: localAt(new Date(now + ms)), repeat: 'once', enabled: true, kind: 'countdown', ends: now + ms, left: null, total: ms })); };
  const click = (event: MouseEvent) => {
    const b = (event.target as Element).closest<HTMLButtonElement>('button'); if (!b || !loaded) return;
    const now = Date.now();
    if (b.dataset.tool) { tool = b.dataset.tool as typeof tool; save({ ...state, tool }); return; }
    if (b.matches('.tool-alarm')) { o.newAlarm?.(); return; }
    if (b.dataset.cdStart) { startCountdown(Number(b.dataset.cdStart) * 60_000); return; }
    if (b.matches('.cd-cancel')) { act(bridge.deleteReminder(COUNTDOWN_ID)); return; }
    if (countdown && b.matches('.cd-play')) {
      const left = countdownLeft(countdown, now), running = countdown.enabled && !!countdown.ends;
      act(bridge.saveReminder(running ? { id: COUNTDOWN_ID, title: countdown.title, at: countdown.at, repeat: 'once', enabled: false, kind: 'countdown', ends: null, left, total: countdown.total } : { id: COUNTDOWN_ID, title: countdown.title, at: localAt(new Date(now + left)), repeat: 'once', enabled: true, kind: 'countdown', ends: now + left, left: null, total: countdown.total }));
      return;
    }
    if (countdown && b.matches('.cd-more')) {
      const running = countdown.enabled && !!countdown.ends, left = countdownLeft(countdown, now) + 60_000;
      act(bridge.saveReminder({ id: COUNTDOWN_ID, title: countdown.title, at: localAt(new Date(now + left)), repeat: 'once', enabled: running, kind: 'countdown', ends: running ? now + left : null, left: running ? null : left, total: (countdown.total ?? 0) + 60_000 }));
      return;
    }
    if (b.matches('.focus-play')) {
      if (state.status === 'running') save({ ...state, status: 'paused', remaining: Math.max(0, (state.endsAt ?? now) - now), endsAt: undefined });
      else save({ ...state, status: 'running', endsAt: now + leftOf(state, settings, now), remaining: undefined });
    } else if (b.matches('.focus-reset')) save({ ...state, status: 'idle', endsAt: undefined, remaining: durationOf(state.mode, settings) });
    else if (b.dataset.mode) { const mode = b.dataset.mode as FocusMode; save({ ...state, mode, status: 'idle', endsAt: undefined, remaining: durationOf(mode, settings) }); }
    else if (b.dataset.adjust) {
      // Changes this period's length in the settings, so it stays the next time.
      const key = state.mode === 'focus' ? 'focusMinutes' : state.mode === 'short' ? 'shortBreak' : 'longBreak';
      const max = key === 'focusMinutes' ? 120 : key === 'shortBreak' ? 60 : 90;
      const value = Math.max(1, Math.min(max, settings[key] + Number(b.dataset.adjust)));
      void bridge.setSettings({ [key]: value }).then(s => { settings = s; save({ ...state, remaining: durationOf(state.mode, s) }); }).catch(err => o.report(String(err)));
    }
  };
  el.addEventListener('click', click);
  const custom = (ev: Event) => { ev.preventDefault(); const m = Number(q<HTMLInputElement>('.cd-minutes').value); if (m >= 1 && m <= 600) { startCountdown(Math.round(m) * 60_000); q<HTMLInputElement>('.cd-minutes').value = ''; } else o.report(l('focus.write_a_span_of_1')); };
  el.addEventListener('submit', custom);
  const takeReminders = (list: Reminder[]) => { countdown = list.find(r => r.id === COUNTDOWN_ID && r.kind === 'countdown' && !r.ringing && !r.missed && (r.enabled || !!r.left)) ?? null; render(); o.changed(); };
  void bridge.reminders().then(takeReminders).catch(() => {});
  const stopReminders = bridge.onReminders(takeReminders);
  void bridge.loadDoc<FocusState>('focus').then(saved => {
    if (saved && ['focus', 'short', 'long'].includes(saved.mode) && ['idle', 'running', 'paused'].includes(saved.status)) state = { ...saved, round: Number(saved.round) || 0 };
    if (saved?.tool === 'countdown') tool = 'countdown';
    loaded = true; check(); render(); o.changed();
  }).catch(err => { loaded = true; o.report(String(err)); render(); });
  timer = setInterval(() => { check(); if (state.status === 'running' || (countdown?.enabled && countdown.ends)) { render(); o.changed(); } }, 1000);
  // Waking from sleep: the next tick may be late; look at once when the page shows again.
  const wake = () => { check(); render(); };
  document.addEventListener('visibilitychange', wake);
  render();
  return {
    applySettings(s: Settings) { const before = durationOf(state.mode, settings); settings = s; if (state.status === 'idle' && (state.remaining === undefined || state.remaining === before)) state = { ...state, remaining: durationOf(state.mode, s) }; render(); },
    /** For the closed island: the time left and how far along, while a period runs or is paused. */
    compact(): { text: string; share: number; mode: FocusMode | 'countdown'; running: boolean } | null {
      if (state.status === 'idle') {
        // A countdown shows on the closed island too, when no focus period runs.
        if (!countdown) return null;
        const left = countdownLeft(countdown, Date.now());
        return { text: clockText(left), share: 1 - left / Math.max(1, countdown.total ?? left), mode: 'countdown', running: !!countdown.enabled && !!countdown.ends };
      }
      const left = leftOf(state, settings, Date.now());
      return { text: clockText(left), share: 1 - left / Math.max(1, durationOf(state.mode, settings)), mode: state.mode, running: state.status === 'running' };
    },
    dispose() { clearInterval(timer); void stopReminders.then(f => f()); el.removeEventListener('submit', custom); el.removeEventListener('click', click); document.removeEventListener('visibilitychange', wake); },
  };
}
