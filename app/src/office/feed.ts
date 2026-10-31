import { fromApp } from '../i18n';
import { locale as localeTag, type MessageKey } from '../i18n';
/** The words the office draws itself (its counts, limit box, board and calendar). */
const OFFICE_WORDS: MessageKey[] = ['ofis.title', 'ofis.coffee', 'ofis.connecting', 'ofis.write_to_manager', 'ofis.hud_working', 'ofis.hud_waiting', 'ofis.hud_idle', 'ofis.hud_unknown', 'ofis.hud_past', 'ofis.hud_chats', 'ofis.limit', 'ofis.limit_renewed', 'ofis.limit_resets_in', 'ofis.limit_updated', 'ofis.limit_stale', 'ofis.prev_month', 'ofis.next_month', 'ofis.open_calendar', 'ofis.prev_day', 'ofis.next_day', 'ofis.back', 'ofis.today', 'ofis.season_spring', 'ofis.season_summer', 'ofis.season_autumn', 'ofis.season_winter', 'office.manager', 'ofis.change_manager', 'ofis.drop_to_make_manager'];
import type { Translate } from '../i18n';
import type { ProviderLimits, WorkEntry } from '../shared/contract';
import { sessionId } from '../shared/contract';
import { shortName, shortTitle, type Person } from '../shared/people';
import { windowLabel } from '../notch/limits';
import type { projectOfficeFrame } from './projection';
type Frame = ReturnType<typeof projectOfficeFrame>;
type L = Translate;

/** The states the user's own office draws, plus "bekliyor" (waiting for you) and "belirsiz" (not verified). */
export type Durum = 'calisiyor' | 'arkada' | 'bekliyor' | 'bosta' | 'uyuyor' | 'belirsiz';
/** After a reply someone rests at the coffee corner for a while, then dozes at their desk. */
export const RESTING_MS = 30 * 60_000;
/** The state a person's plate dot (and the board) shows: the notch's states, by name. */
const NOKTA = { working: 'calisiyor', waiting: 'bekliyor', idle: 'bosta', unverified: 'belirsiz', history: 'gecmis' } as const;

export function durumOf(p: Person, now = Date.now()): Durum {
  if (p.state === 'waiting') return 'bekliyor';
  if (p.state === 'working') return p.session.status === 'working' && p.session.verified !== false ? 'calisiyor' : 'arkada';
  if (p.state === 'idle') return now - p.session.lastActivity < RESTING_MS ? 'bosta' : 'uyuyor';
  // A past chat dozes at its desk; it is on record, not at work.
  if (p.state === 'history') return 'uyuyor';
  return 'belirsiz';
}

/**
 * A chat's own words as a balloon can say them: one line of plain text (no Markdown marks), cut at the
 * end of its first sentence when that fits, else at a word, never in the middle of one and never on a
 * dangling colon or comma ("I committed item 3 as 39d12f2:" says "I committed item 3 as 39d12f2").
 */
export function speech(text: string, max = 48): string {
  const flat = text.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`+|\*\*/g, '').replace(/^\s*(#+|[-*>]|\d+[.)])\s+/gm, '').replace(/\s+/g, ' ').trim();
  const end = (s: string) => s.replace(/[\s:;,–—-]+$/u, '');
  if (flat.length <= max) return end(flat);
  const sentence = flat.match(/^(.+?[.!?…])(?=\s|$)/u);
  if (sentence && sentence[1].length <= max && sentence[1].length >= max / 4) return end(sentence[1]);
  const cut = flat.slice(0, max), space = cut.lastIndexOf(' ');
  return `${end(space > max / 2 ? cut.slice(0, space) : cut).replace(/[.!?]+$/u, '')}…`;
}

/** What someone says in their balloon, and the longer text shown on hover. */
function words(p: Person, durum: Durum, l: L): { balon: string; uzun: string } {
  const w = rawWords(p, durum, l);
  return { balon: speech(w.balon), uzun: speech(w.uzun, 600) };
}
function rawWords(p: Person, durum: Durum, l: L): { balon: string; uzun: string } {
  const r = p.request, helpers = p.helpers.filter(h => h.status === 'working').length;
  if (durum === 'bekliyor' && r) {
    const balon = r.kind === 'question' ? l('board.has_a_question') : r.detail ? `${l('board.asks_permission')}: ${fromApp(r.detail)}` : l('board.asks_permission');
    return { balon, uzun: r.detail ? `${fromApp(r.title)}: ${fromApp(r.detail)}` : fromApp(r.title) };
  }
  if (durum === 'calisiyor') return { balon: p.activity, uzun: p.activity };
  if (durum === 'arkada') { const t = l('board.helpers_working', { n: helpers }); return { balon: t, uzun: p.session.reply ? `${t} · ${p.session.reply}` : t }; }
  if (durum === 'belirsiz') return { balon: l('board.current_state_unknown'), uzun: l('board.no_current_state_came_from') + (p.session.reply ? ` ${l('board.its_last_reply')}: ${p.session.reply}` : '') };
  const said = p.session.reply || l('board.replied');
  return { balon: said, uzun: said };
}

const limitName = (minutes: number, l: L) => minutes === 300 ? l('board.5_hour_limit') : minutes === 10080 ? l('board.weekly') : windowLabel(minutes, l);

/** A day in this computer's time zone, as "2026-10-25": the board's days follow the local clock. */
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** How long the work board keeps its lines (on this computer only). */
export const BOARD_DAYS = 30;
/**
 * The office's work board for one day (all its floors): each line's time, chat and short
 * description as written when it happened, newest first, with the way to its chat. A reply
 * is a reply, not finished work: nothing here is marked done. Also the days that have lines
 * (for the calendar) and the oldest day kept.
 */
export function workBoard(entries: WorkEntry[], day: string | undefined, office: string, l: L, now = Date.now()) {
  const today = dayKey(now), gun = day && day <= today ? day : today;
  const label = (k: WorkEntry['kind']) => ({ reply: l('board.replied'), permission: l('board.asked_permission'), question: l('board.asked_a_question'), error: l('board.error'), stopped: l('board.stopped') })[k] ?? k;
  const locale = localeTag();
  const kayitlar = entries.filter(e => dayKey(e.at) === gun).sort((a, b) => b.at - a.at).map(e => ({
    id: e.id, saat: new Date(e.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }), tarih: new Date(e.at).toLocaleDateString(locale, { day: 'numeric', month: 'long', weekday: 'long' }),
    ad: shortTitle(e.chat), tam: e.chat, metin: e.kind === 'reply' ? e.text : fromApp(e.text), tur: e.kind, etiket: label(e.kind), ofis: office, kaynak: e.provider === 'codex' ? 'Codex' : 'Claude', oturum: e.sessionId,
    git: e.provider === 'codex' ? l('board.open_in_codex') : e.link ? l('board.open_in_claude') : '',
  }));
  const weekday = new Date(`${gun}T12:00:00`).toLocaleDateString(locale, { weekday: 'long' }), date = new Date(`${gun}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  return { gun, bugun: today, kayitlar, gunler: [...new Set(entries.map(e => dayKey(e.at)))], enEski: dayKey(now - (BOARD_DAYS - 1) * 86_400_000), alt: gun === today || gun === dayKey(now - 86_400_000) ? date : weekday, bos: l('board.no_records_for_this_date'), saklama: l('board.records_are_kept_on_this', { BOARD_DAYS }) };
}
export type WorkBoard = ReturnType<typeof workBoard>;

/**
 * The data the user's office renders (its own format): the people on this
 * page at their desks, the shown team's counts, the work board and the
 * limits of the office's provider when they are known.
 */
export function officeFeed(frame: Frame, team: Person[], o: { title: string; limits?: ProviderLimits; now?: number; l: L; manager?: string; board?: WorkBoard }) {
  const now = o.now ?? Date.now(), l = o.l;
  const seats = [...frame.seats].sort((a, b) => a.seat - b.seat);
  // The floor decides its desks (projection): the manager's desk only on the ground floor of an
  // office with a manager, and only the manager at it.
  const desk = new Map<string, number>(seats.map(s => [sessionId(s.person.session.key), s.desk]));
  const sekmeler = seats.map(s => {
    const id = sessionId(s.person.session.key), yon = frame.managerDesk && s.person.session.key.sessionId === o.manager;
    // The manager keeps the big desk whatever is known: without a current state it rests there (its
    // plate's dot still says the state is unknown), never a faded figure.
    const d = yon && durumOf(s.person, now) === 'belirsiz' ? 'uyuyor' : durumOf(s.person, now), w = words(s.person, d, l);
    return { id, ad: shortName(s.person.session), durum: d, nokta: NOKTA[s.person.state as keyof typeof NOKTA] ?? 'belirsiz', balon: w.balon, uzun: w.uzun, koltuk: desk.get(id)!, yas: 0, yon };
  });
  const present = team.filter(p => p.state !== 'ended');
  // The board counts by the same states as the notch; dozing or coffee is only how someone looks.
  const sayilar = { calisiyor: 0, bekliyor: 0, bosta: 0, belirsiz: 0, gecmis: 0 };
  for (const p of present) sayilar[NOKTA[p.state as keyof typeof NOKTA] ?? 'belirsiz']++;
  const windows = (o.limits?.windows || []).filter(w => w.windowMinutes === 300 || w.windowMinutes === 10080).slice(0, 2);
  const limit = o.limits && windows.length ? { pencereler: windows.map(w => ({ ad: w.model ? `${limitName(w.windowMinutes, l)} · ${w.model}` : limitName(w.windowMinutes, l), yuzde: w.usedPercent, sifirlanma: w.resetsAt ? new Date(w.resetsAt).toISOString() : '' })), guncelleme: new Date(o.limits.updatedAt).toISOString() } : null;
  return {
    zaman: Math.floor(now / 1000), sekmeler, zarflar: [] as { id: string; t: number; kimden: string; kime: string }[], sayilar, limit,
    pano: o.board,
    baslik: o.title, digerleri: Math.max(0, present.length - sekmeler.length),
    // Only the floor with the manager's desk draws the big desk and its rug; every other floor,
    // and an office without a manager, an ordinary desk in its place.
    yonetici: frame.managerDesk,
    // The office's own words and the locale it writes dates and numbers in (see design/ofis_aktar.py).
    dil: { locale: localeTag(), soz: Object.fromEntries(OFFICE_WORDS.map(k => [k, l(k)])) },
  };
}
export type OfficeFeed = ReturnType<typeof officeFeed>;
