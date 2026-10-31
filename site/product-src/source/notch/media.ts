import { fromApp } from '../i18n';
import type { Translate } from '../i18n';
import type { Bridge, Lyrics, MediaSession } from '../shared/contract';
import { escapeHtml as e } from '../ui/state';
import { icon } from '../ui/icons';

/** The session the user picked last (by app id), when there are several. */
const PICK_KEY = 'agentoffice-media-pick';
/** Whether the lyrics column is open (the user's choice, kept). */
const LYRICS_KEY = 'agentoffice-media-lyrics';
/** How far the skip buttons move (ms). */
const SKIP_MS = 10_000;

export const mmss = (ms: number) => { const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; };
/** Where a playing session is now: its last reading moved on by the time since, never past the end. */
export const positionNow = (s: MediaSession, now = Date.now()) => s.positionMs === undefined || s.positionMs === null ? null : Math.min(s.durationMs ?? Infinity, s.positionMs + (s.status === 'playing' ? Math.max(0, now - s.readAt) * (s.rate || 1) : 0));
/** A paused session not seen playing for this long is no longer "what plays now". */
export const STALE_MS = 30 * 60_000;
/** Played lately (or plays now): a browser keeps a paused tab's session for days. */
export const recent = (s: MediaSession, now = Date.now()) => s.status === 'playing' || (!!s.lastPlayed && now - s.lastPlayed < STALE_MS);
/** The session shown: what really plays wins over anything paused. Among those playing: the one
 *  the user picked, else Windows' current one, else the one that started playing last. Nothing
 *  plays: one paused lately (the one picked, else the current one, else the first). A paused tab
 *  not played lately is shown only when the user picks it here. */
export function pick(list: MediaSession[], picked: string | null, chosen: string | null = null, now = Date.now()): MediaSession | undefined {
  const playing = list.filter(s => s.status === 'playing').sort((a, b) => (b.playingSince ?? 0) - (a.playingSince ?? 0));
  if (playing.length) return playing.find(s => s.id === picked) ?? playing.find(s => s.current) ?? playing[0];
  const lately = list.filter(s => recent(s, now) || s.id === chosen);
  return lately.find(s => s.id === chosen) ?? lately.find(s => s.id === picked) ?? lately.find(s => s.current) ?? lately[0];
}
/** Paused at its very end (a short clip played to the end): playing it again is the app's own business. */
export const ended = (s: MediaSession) => s.status !== 'playing' && !!s.durationMs && s.positionMs != null && s.durationMs - s.positionMs < 1000;
/** The line being sung at `at` (ms): the last one whose time has come; -1 before the first. */
export const lineAt = (lines: { t: number }[], at: number) => { let i = -1; for (let k = 0; k < lines.length && lines[k].t <= at; k++) i = k; return i; };
/** A song (not a stream, not a silent clip): a title, an artist and a known length. */
const isSong = (s: MediaSession) => !!s.title && !!s.artist && !!s.durationMs && s.durationMs > 30_000;

/**
 * The media page: what really plays on the computer (Windows' media sessions), with its picture,
 * title, app and state; only the controls the app really offers (play/pause, previous/next, ten
 * seconds back and on where it can seek, stop where it has one); a timeline only when the app
 * gives one (a live stream shows none). Synced lyrics open beside it on request: from what is kept
 * on this computer, or, once the user allowed it, from LRCLIB; a line is clicked to go there.
 */
export function createMediaPage(el: HTMLElement, bridge: Bridge, o: { l: Translate; changed: () => void; report: (text: string) => void; resized?: () => void }) {
  const { l } = o;
  // `chosen`: a session the user picked here in this run (an old paused one is shown only then).
  let list: MediaSession[] = [], picked: string | null = null, chosen: string | null = null, seeking = false, lyricsOpen = false;
  try { picked = localStorage.getItem(PICK_KEY); lyricsOpen = localStorage.getItem(LYRICS_KEY) === '1'; } catch { /* A convenience only. */ }
  el.innerHTML = `<div class="media-page"><div class="media-empty" hidden>${icon('music', 20)}<span>${e(l('media.nothing_is_playing'))}</span><small>${e(l('media.spotify_youtube_or_a_music'))}</small><div class="media-old" role="group"></div></div>`
    + `<div class="media-body"><div class="media-main"><div class="media-top"><div class="media-art"><img alt="" hidden><span class="art-none">${icon('music', 24)}</span></div><div class="media-info"><div class="media-sources" role="group" aria-label="${e(l('media.source'))}"></div><b class="media-title"></b><span class="media-artist"></span><span class="media-app"></span></div><button class="media-lyrics-toggle icon-button" aria-pressed="false" hidden>${icon('lyrics', 16)}</button></div>`
    + `<div class="media-line"><span class="media-at"></span><input class="media-seek" type="range" min="0" max="1000" step="1" data-noswipe aria-label="${e(l('media.position'))}"><span class="media-bar" aria-hidden="true"><i></i></span><span class="media-left"></span><small class="media-notime"></small></div>`
    + `<div class="media-controls"><button class="mc small" data-c="back">${icon('back10', 18)}</button><button class="mc" data-c="prev">${icon('prev', 19)}</button><button class="mc play" data-c="toggle">${icon('play', 21)}</button><button class="mc" data-c="next">${icon('next', 19)}</button><button class="mc small" data-c="fwd">${icon('fwd10', 18)}</button><button class="mc small" data-c="stop">${icon('stop', 15)}</button></div></div>`
    + `<aside class="media-lyrics" aria-label="${e(l('media.lyrics'))}" hidden><div class="lyrics-body" data-noswipe></div></aside></div></div>`;
  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const current = () => pick(list, picked, chosen);
  // Lyrics: one track at a time, asked once per track.
  let lyricsKey = '', lyrics: Lyrics | null = null, lyricsBusy = false, lyricsHtml = '', lastLine = -2, userScrolled = 0;
  const trackKey = (s: MediaSession) => `${s.title}\u0001${s.artist}\u0001${s.album}\u0001${Math.round((s.durationMs ?? 0) / 1000)}`;
  const wide = () => lyricsOpen && !!current() && isSong(current()!);
  const loadLyrics = (s: MediaSession, force = false) => {
    const k = trackKey(s); if (!force && (k === lyricsKey || lyricsBusy)) return;
    lyricsKey = k; lyrics = null; lyricsBusy = true; lastLine = -2; renderLyrics();
    void bridge.lyrics({ title: s.title, artist: s.artist, album: s.album, durationMs: s.durationMs ?? 0 })
      .then(found => { if (lyricsKey === k) lyrics = found; })
      .catch(() => { if (lyricsKey === k) lyrics = { status: 'error', lines: [], plain: '' }; })
      .finally(() => { lyricsBusy = false; if (lyricsKey === k) renderLyrics(); });
  };
  function renderLyrics() {
    const s = current(), box = q('.lyrics-body');
    if (!s || !wide()) return;
    let html: string;
    if (lyricsBusy || !lyrics) html = `<p class="lyrics-note">${e(l('media.looking_for_the_lyrics'))}</p>`;
    else if (lyrics.status === 'off') html = `<div class="lyrics-ask"><p>${e(l('media.lyrics_come_from_lrclib_lrclib'))}</p><button class="lyrics-allow">${e(l('media.allow_and_show'))}</button></div>`;
    else if (lyrics.status === 'error') html = `<div class="lyrics-ask"><p>${e(l('media.the_lyrics_could_not_be'))}</p><button class="lyrics-retry">${e(l('media.try_again'))}</button></div>`;
    else if (lyrics.status === 'none') html = `<p class="lyrics-note">${e(l('media.no_lyrics_found_for_this'))}</p>`;
    else if (lyrics.status === 'plain') html = `<p class="lyrics-plain">${e(lyrics.plain)}</p><small class="lyrics-note">${e(l('media.no_timed_lyrics_they_do'))}</small>`;
    else html = lyrics.lines.map((x, i) => `<button class="lyric" data-line="${i}" data-t="${x.t}" ${s.canSeek ? '' : 'tabindex="-1"'}>${e(x.text || '♪')}</button>`).join('');
    if (html !== lyricsHtml) { lyricsHtml = html; box.innerHTML = html; box.classList.toggle('synced', lyrics?.status === 'synced'); box.classList.toggle('can-seek', !!s.canSeek); lastLine = -2; }
    followLine(s);
  }
  // The line being sung is lit and kept in the middle (unless the user scrolled a moment ago).
  const followLine = (s: MediaSession) => {
    if (lyrics?.status !== 'synced') return;
    const at = positionNow(s); if (at === null) return;
    const i = lineAt(lyrics.lines, at + 150); if (i === lastLine) return;
    const box = q('.lyrics-body');
    box.querySelector('.lyric.now')?.classList.remove('now');
    const now = box.querySelector<HTMLElement>(`.lyric[data-line="${i}"]`); now?.classList.add('now');
    lastLine = i;
    if (now && Date.now() - userScrolled > 4000) box.scrollTo({ top: now.offsetTop - box.clientHeight / 2 + now.offsetHeight / 2, behavior: lastLine < 0 ? 'auto' : 'smooth' });
  };
  let wasWide = false;
  function render() {
    const s = current();
    q('.media-empty').hidden = !!s; q('.media-body').hidden = !s;
    // Nothing plays now: the paused ones a browser still keeps, to show one on purpose.
    const old = s ? '' : list.map(x => `<button data-choose="${e(x.id)}" title="${e(l('media.show'))}">${e(l('media.paused'))}: ${e(x.title || fromApp(x.app))} · ${e(fromApp(x.app))}</button>`).join('');
    const ob = q('.media-old'); if (ob.innerHTML !== old) ob.innerHTML = old;
    el.dataset.status = s?.status ?? 'none';
    const isWide = wide();
    if (isWide !== wasWide) { wasWide = isWide; q('.media-lyrics').hidden = !isWide; el.classList.toggle('with-lyrics', isWide); o.resized?.(); }
    if (!s) return;
    // The cover; else the site's own icon, small on the tile; else a plain media sign.
    const img = q<HTMLImageElement>('.media-art img'), pic = s.art ?? s.siteIcon ?? '';
    if ((img.getAttribute('src') ?? '') !== pic) { if (pic) img.src = pic; else img.removeAttribute('src'); }
    img.hidden = !pic; img.classList.toggle('site-icon', !s.art && !!s.siteIcon); q('.art-none').hidden = !!pic;
    const set = (sel: string, text: string) => { const x = q(sel); if (x.textContent !== text) x.textContent = text; };
    set('.media-title', s.title || l('media.untitled'));
    set('.media-artist', [s.artist, s.album].filter(Boolean).join(' · '));
    const state = s.status === 'playing' ? l('media.playing') : s.status === 'paused' ? l('media.paused_2') : s.status === 'stopped' ? l('media.stopped') : l('media.changing');
    const done = ended(s);
    set('.media-app', `${s.site ? `${s.site.replace(/^www\./, '')} · ` : ''}${fromApp(s.app)} · ${done ? l('media.ended') : state}`);
    // Several apps: each one, the shown one marked; what plays has a green dot (and says so).
    const sources = list.length > 1 ? list.map(x => `<button data-pick="${e(x.id)}" aria-pressed="${x.id === s.id}" title="${e(`${fromApp(x.app)}: ${x.title}${x.status === 'playing' ? ` · ${l('media.playing_2')}` : ''}`)}">${e(x.site ? x.site.replace(/^www\./, '') : fromApp(x.app))}${x.status === 'playing' ? '<i></i>' : ''}</button>`).join('') : '';
    const src = q('.media-sources'); if (src.innerHTML !== sources) src.innerHTML = sources;
    // Timeline: only a real one. Seeking only where the app allows it.
    const at = positionNow(s), has = at !== null && !!s.durationMs;
    q('.media-at').hidden = q('.media-left').hidden = !has;
    const seek = q<HTMLInputElement>('.media-seek'), bar = q('.media-bar');
    seek.hidden = !has || !s.canSeek; bar.hidden = !has || s.canSeek;
    set('.media-notime', has ? '' : s.status === 'playing' ? l('media.live_or_open_ended_no') : l('media.no_timeline'));
    if (has) {
      set('.media-at', mmss(at!)); set('.media-left', `-${mmss(s.durationMs! - at!)}`);
      const share = at! / s.durationMs!;
      if (!seeking) seek.value = String(Math.round(share * 1000));
      seek.style.setProperty('--share', `${share * 100}%`); bar.querySelector('i')!.style.width = `${share * 100}%`;
    }
    // Controls: only what this app offers is shown; play/pause stays, off when not offered.
    const playing = s.status === 'playing';
    const b = (c: string) => q<HTMLButtonElement>(`.mc[data-c="${c}"]`);
    const label = (c: string, text: string, ok: boolean, show = true) => { const x = b(c); x.hidden = !show; x.disabled = !ok; x.title = ok ? text : l('media.not_supported_by_this_app'); x.setAttribute('aria-label', x.title); };
    const toggleOk = playing ? s.canPause : s.canPlay;
    const playIcon = icon(playing ? 'pause' : 'play', 21); if (b('toggle').dataset.icon !== (playing ? 'pause' : 'play')) { b('toggle').innerHTML = playIcon; b('toggle').dataset.icon = playing ? 'pause' : 'play'; }
    // A clip paused at its very end is not offered to play from here (it would not play on).
    label('toggle', playing ? l('media.pause') : l('media.play'), toggleOk, !done);
    label('prev', l('media.previous'), s.canPrev, s.canPrev);
    label('next', l('media.next'), s.canNext, s.canNext);
    label('back', l('media.back_10_s'), has && s.canSeek, has && s.canSeek);
    label('fwd', l('media.forward_10_s'), has && s.canSeek, has && s.canSeek);
    label('stop', l('media.stop'), !!s.canStop, !!s.canStop);
    // Lyrics: offered for a song (title, artist, length).
    const t = q<HTMLButtonElement>('.media-lyrics-toggle'); t.hidden = !isSong(s);
    t.setAttribute('aria-pressed', String(isWide)); t.title = isWide ? l('media.hide_lyrics') : l('media.lyrics');
    if (isWide) { loadLyrics(s); renderLyrics(); }
  }
  const control = (s: MediaSession, c: string) => {
    if (c === 'back' || c === 'fwd') {
      const at = positionNow(s); if (at === null || !s.durationMs) return;
      void bridge.mediaSeek(s.id, Math.max(0, Math.min(s.durationMs - 1000, at + (c === 'fwd' ? SKIP_MS : -SKIP_MS)))).catch(err => o.report(String(err)));
      return;
    }
    void bridge.mediaControl(s.id, c as 'toggle' | 'next' | 'prev' | 'stop').then(ok => { if (!ok) o.report(l('media.the_media_control_could_not')); }).catch(err => o.report(String(err)));
  };
  const click = (event: MouseEvent) => {
    const b = (event.target as Element).closest<HTMLButtonElement>('button'); if (!b || b.disabled) return;
    if (b.dataset.choose) { chosen = b.dataset.choose; render(); o.changed(); return; }
    if (b.dataset.pick) { picked = b.dataset.pick; chosen = b.dataset.pick; try { localStorage.setItem(PICK_KEY, picked); } catch { /* A convenience only. */ } render(); o.changed(); return; }
    if (b.matches('.media-lyrics-toggle')) { lyricsOpen = !lyricsOpen; try { localStorage.setItem(LYRICS_KEY, lyricsOpen ? '1' : '0'); } catch { /* A convenience only. */ } render(); return; }
    const s = current(); if (!s) return;
    if (b.matches('.lyrics-allow')) { void bridge.setSettings({ lyricsOnline: true }).then(() => loadLyrics(s, true)).catch(err => o.report(String(err))); return; }
    if (b.matches('.lyrics-retry')) { loadLyrics(s, true); return; }
    if (b.dataset.t !== undefined) { if (s.canSeek) { void bridge.mediaSeek(s.id, Number(b.dataset.t)).catch(err => o.report(String(err))); userScrolled = 0; } return; }
    if (b.dataset.c) control(s, b.dataset.c);
  };
  const seek = q<HTMLInputElement>('.media-seek');
  const seekInput = () => { seeking = true; const s = current(); if (s?.durationMs) { seek.style.setProperty('--share', `${Number(seek.value) / 10}%`); q('.media-at').textContent = mmss(Number(seek.value) / 1000 * s.durationMs); } };
  const seekChange = () => { const s = current(); seeking = false; if (s?.durationMs && s.canSeek) void bridge.mediaSeek(s.id, Math.round(Number(seek.value) / 1000 * s.durationMs)).catch(err => o.report(String(err))); };
  const scrolled = () => { userScrolled = Date.now(); };
  el.addEventListener('click', click); seek.addEventListener('input', seekInput); seek.addEventListener('change', seekChange);
  q('.lyrics-body').addEventListener('wheel', scrolled, { passive: true });
  const apply = (next: MediaSession[]) => { list = next; render(); o.changed(); };
  void bridge.mediaSessions().then(apply).catch(() => {});
  const stop = bridge.onMedia(apply);
  // While something plays, the time (and the sung line) moves on; nothing runs while it is quiet.
  const timer = setInterval(() => { const s = current(); if (s?.status === 'playing') { render(); if (wide()) followLine(s); } }, 500);
  render();
  return {
    /** For the closed island: the picture and whether it plays, while something plays or is paused. */
    compact(): { art?: string; site?: boolean; playing: boolean; title: string } | null {
      const s = current(); if (!s || (s.status !== 'playing' && s.status !== 'paused')) return null;
      return { art: s.art ?? s.siteIcon ?? undefined, site: !s.art && !!s.siteIcon, playing: s.status === "playing", title: s.title };
    },
    /** The lyrics column is open (the page is wider then). */
    wide,
    dispose() { clearInterval(timer); el.removeEventListener('click', click); seek.removeEventListener('input', seekInput); seek.removeEventListener('change', seekChange); void stop.then(f => f()); },
  };
}
