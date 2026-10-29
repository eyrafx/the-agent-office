import { fromApp } from '../i18n';
import { locale } from '../i18n';
import type { Translate } from '../i18n';
import type { HistoryEvent, PendingRequest, Session, SessionKey, Snapshot, WorkEntry } from './contract';
import { sessionId } from './contract';

/** What the office and the notch show for one worker. */
export type PersonState = 'working' | 'waiting' | 'idle' | 'unverified' | 'history' | 'ended';
export interface Person { session: Session; helpers: Session[]; state: PersonState; request?: PendingRequest; activity: string }
export interface Counts { working: number; waiting: number; idle: number; unverified: number; history: number }
/** A chat quiet for longer than this is past ("Geçmiş"): on record, not a worker of now. */
export const HISTORY_MS = 3 * 24 * 3600_000;

type L = Translate;
const open = (r: PendingRequest) => r.status === 'pending' || r.status === 'answering';
const same = (a: SessionKey, b: SessionKey) => sessionId(a) === sessionId(b);

/**
 * Workers are main sessions; a chat's helper agents belong to it and are never
 * counted on their own. A worker waits if it or a helper has an open request,
 * works if it or a helper works (with live evidence: time alone never ends
 * work), is past if nothing came from it for three days, is unverified without
 * live evidence, and is idle otherwise. A finished reply is idle, not done.
 */
export function people(snapshot: Snapshot, l: L, now = Date.now()): Person[] {
  const mains = snapshot.sessions.filter(s => !s.parentKey);
  return mains.map(session => {
    const helpers = snapshot.sessions.filter(h => h.parentKey && same(h.parentKey, session.key));
    const mine = [session, ...helpers];
    const request = snapshot.requests.filter(open).filter(r => mine.some(s => same(s.key, r.key.sessionKey))).sort((a, b) => a.expiresAt - b.expiresAt)[0];
    const live = (s: Session) => s.verified !== false;
    const last = Math.max(...mine.map(s => s.lastActivity));
    const state: PersonState = session.status === 'ended' ? 'ended'
      : request ? 'waiting'
      : mine.some(s => s.status === 'working' && live(s)) ? 'working'
      : now - last > HISTORY_MS ? 'history'
      // Unknown is only for a state nobody can tell: a finished reply on record is idle even
      // before the chat is seen live again; work or a wait that was not seen live is not.
      : session.status === 'unknown' || (!live(session) && (session.status === 'working' || session.status === 'waiting')) ? 'unverified'
      : 'idle';
    return { session, helpers, state, request, activity: activity(session, helpers, state, request, l) };
  });
}

export function counts(list: Person[]): Counts {
  const c: Counts = { working: 0, waiting: 0, idle: 0, unverified: 0, history: 0 };
  for (const p of list) if (p.state !== 'ended') c[p.state]++;
  return c;
}

/** The sources heard from (Claude's hooks, Codex's records); in the demo, all. One
 *  source being connected says nothing of the other. */
export const verifiedProviders = (snapshot: Snapshot) => new Set(snapshot.mode === 'demo' ? ['claude', 'codex'] : snapshot.connections.filter(c => c.status === 'connected').map(c => c.provider));
/** "3 çalışıyor · 1 seni bekliyor" for a scope of sources. Otherwise it says plainly that
 *  nobody works, naming only the sources heard from, or that this cannot be told. */
export function scopeHeadline(c: Counts, l: L, verified: Set<string>, scope: string[]): string {
  const parts = [c.working ? l('people.working', { working: c.working }) : '', c.waiting ? l('people.waiting_for_you', { waiting: c.waiting }) : ''].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  const heard = scope.filter(p => verified.has(p));
  if (!heard.length) return l('people.source_not_verified');
  if (c.unverified) return l('people.with_unknown_current_state', { unverified: c.unverified });
  if (heard.length < scope.length) return l('people.nobody_working_in', { source: heard[0] });
  return l('people.nobody_is_working_now');
}

const lower = (s: string) => s ? s.charAt(0).toLocaleLowerCase(locale()) + s.slice(1) : s;

/** A short natural phrase for what the worker is doing now. */
function activity(s: Session, helpers: Session[], state: PersonState, request: PendingRequest | undefined, l: L): string {
  if (state === 'waiting') return request?.kind === 'question' ? l('people.has_a_question') : l('people.asks_for_permission');
  if (state === 'unverified') return l('people.no_current_state_from_the');
  if (state === 'history') return l('people.past_chat');
  if (state === 'ended') return l('people.session_closed');
  if (state === 'working') {
    const busyHelpers = helpers.filter(h => h.status === 'working').length;
    const own = s.status === 'working' && s.summary && !/^(çalışıyor|isteği işliyor|oturum açıldı|yanıt verdi|işini bitirdi|seni bekliyor|izin bekliyor|yardımcı başladı)$/i.test(s.summary) ? lower(fromApp(s.summary)) : l('people.working_2');
    return busyHelpers ? `${own} · ${l('people.helper_count', { n: busyHelpers })}` : own;
  }
  if (s.status === 'idle') return l('people.waiting_for_input');
  return s.reply ? lower(s.reply) : l('people.replied');
}

/** At most `limit` recent, meaningful developments, newest first, one per worker. */
export function developments(snapshot: Snapshot, list: Person[], l: L, limit = 3): { person: Person; text: string; at: number }[] {
  const byKey = new Map(list.map(p => [sessionId(p.session.key), p]));
  const ownerOf = (h: HistoryEvent) => {
    const s = snapshot.sessions.find(x => same(x.key, h.sessionKey));
    return s?.parentKey ? byKey.get(sessionId(s.parentKey)) : byKey.get(sessionId(h.sessionKey));
  };
  const out: { person: Person; text: string; at: number }[] = [];
  const seen = new Set<string>();
  for (const h of [...snapshot.history].sort((a, b) => b.at - a.at)) {
    const person = ownerOf(h);
    if (!person || person.state === 'ended' || seen.has(sessionId(person.session.key))) continue;
    const helper = !same(person.session.key, h.sessionKey);
    const text = h.kind === 'replyEnded' ? (helper ? l('people.a_helper_finished') : person.session.reply ? lower(person.session.reply) : l('people.replied'))
      : h.kind === 'error' ? l('people.hit_an_error')
      : h.kind === 'question' ? l('people.asked_a_question') : l('people.asked_for_permission');
    seen.add(sessionId(person.session.key)); out.push({ person, text, at: h.at });
    if (out.length === limit) break;
  }
  // Without recent events, what the working people are doing now.
  for (const p of list.filter(p => p.state === 'working')) {
    if (out.length === limit) break;
    if (!seen.has(sessionId(p.session.key))) { seen.add(sessionId(p.session.key)); out.push({ person: p, text: p.activity, at: p.session.lastActivity }); }
  }
  return out;
}

const STOP = new Set(['ve', 'ile', 'için', 'and', 'the', 'of', 'a', 'de', 'da']);
const PREFIX = /^(\S{1,14})\s+[-–—:·|]\s+(.+)$/;
/** A short name for desk plates and cards: "Oyun - Mekanlar" → "Mekanlar",
 *  "Maskot tasarımı ve AI bağlantısı" → "Maskot tasarımı". The user's own name stays as given. */
export function shortName(s: Session): string {
  return s.customName || shortTitle(s.name);
}
/** The short form of a chat's name as it was written (a board line keeps the name of its moment). */
export function shortTitle(full: string): string {
  let name = full.trim().replace(/\s+/g, ' ');
  const m = name.match(PREFIX); if (m) name = m[2];
  if (name.length <= 20) return tidyEnd(name) || name;
  // A title written as a list ("Çalışan ajan durumu, Diğer kaldırma, …") is named by its first part.
  const clause = name.match(/^(.{8,22}?)[,;:](?:\s|$)/);
  if (clause) return tidyEnd(clause[1]);
  let out = '';
  for (const w of name.split(' ')) { const next = out ? `${out} ${w}` : w; if (next.length > 20 && out) break; out = next; }
  out = tidyEnd(out);
  return out.length > 22 ? `${tidyEnd(out.slice(0, 21))}…` : out;
}
/** A name never ends on a comma, colon, dash or a dangling "ve"/"and". */
function tidyEnd(s: string): string {
  let out = s;
  for (let before = ''; before !== out;) {
    before = out;
    out = out.replace(/[\s,;:.\-–—·|/]+$/u, '');
    if (out.includes(' ') && STOP.has(out.split(' ').pop()!.toLocaleLowerCase('tr-TR'))) out = out.split(' ').slice(0, -1).join(' ');
  }
  return out;
}
/** Claude's side chat ("Yan sohbet" / "Side chat"): a short errand beside a chat, under its default name. */
export const isSideChat = (s: Pick<Session, 'name' | 'customName'>) => !s.customName && /^(yan sohbet|side ?chat)$/i.test(s.name.trim());
/** The group a chat belongs to: the title's prefix ("Oyun" in "Oyun - Mekanlar") or its folder. */
export function groupName(s: Session): string {
  const m = s.name.trim().match(PREFIX);
  if (m && !s.customName) return m[1];
  return s.project.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
}
/** Today's replies, newest first, as short board lines: only a reply that ended today
 *  (its own moment, seen live), never an older one under a newer activity's date. A reply
 *  is a reply, not a finished project. */
export function todayResults(list: Person[], history: HistoryEvent[], now = Date.now(), limit = 5): string[] {
  const day = new Date(now).toDateString();
  const replied = new Map<string, number>();
  for (const h of history) if (h.kind === 'replyEnded') replied.set(sessionId(h.sessionKey), Math.max(replied.get(sessionId(h.sessionKey)) ?? 0, h.at));
  return list.filter(p => p.state !== 'ended' && p.session.reply && new Date(replied.get(sessionId(p.session.key)) ?? 0).toDateString() === day)
    .sort((a, b) => replied.get(sessionId(b.session.key))! - replied.get(sessionId(a.session.key))!).slice(0, limit)
    .map(p => `${shortName(p.session)}: ${lower(p.session.reply!)}`);
}

/**
 * An office's manager: the chat the user chose for that office, while it is one
 * of the office's people. An office has none unless chosen; a chat's name never
 * makes it one. The choice belongs to that office alone (its key carries the
 * tool and the project). Being the manager is not a state: it works, waits,
 * rests or is unverified like anyone.
 */
export function managerOf(snapshot: Snapshot, office: { key: string; people: Person[] }): Person | undefined {
  const id = snapshot.managers?.[office.key];
  return id ? office.people.find(p => p.session.key.sessionId === id && !p.session.parentKey && p.state !== 'ended') : undefined;
}
const MANAGER = /\b(y[öo]netici|manager)\b/i;
/** Once, when managers become per office: the former single manager, or else a chat
 *  named "Yönetici", stays its office's manager; no other office gets one. */
export function carriedManagers(snapshot: Snapshot, offices: ProjectOffice[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of offices) {
    const mains = o.people.filter(p => !p.session.parentKey);
    const chosen = mains.find(p => p.session.key.sessionId === snapshot.manager) ?? mains.filter(p => MANAGER.test(p.session.name)).sort((a, b) => b.session.lastActivity - a.session.lastActivity)[0];
    if (chosen) out[o.key] = chosen.session.key.sessionId;
  }
  return out;
}

/** The office a chat sits in: its tool's project (a Claude and a Codex project in one
 *  folder are two offices); a Codex chat outside any project sits in that app's "Sohbetler". */
export const officeKey = (s: Session) => scratch(s) ? `${s.key.provider}:|sohbetler` : `${s.key.provider}:${(s.root || (s.office ? `|${s.office}` : s.project) || '').replace(/[\\/]+$/, '').replace(/\//g, '\\').toLocaleLowerCase('tr-TR')}`;
/** The office a board line belongs to: the office its chat sat in when the line was written. */
export const entryOfficeKey = (e: WorkEntry) => officeKey({ key: { provider: e.provider, hostId: '', sessionId: e.sessionId }, root: e.root, office: e.office, project: e.project } as Session);
/** An office's name: the one the user gave it, else the app's project name, else its folder's. */
export const officeName = (s: Session, names?: Record<string, string>) => names?.[officeKey(s)] || s.office || (scratch(s) ? 'Sohbetler' : (s.root || s.project || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '—');
/** A Claude chat started without a project lives in the app's own scratch folder: it is no
 *  project of the user's, so it sits with the other chats outside projects ("Sohbetler"). */
const scratch = (s: Session) => !s.office && /[\\/]claude(?:_[a-z0-9]+)?[\\/]scratch-workspaces[\\/]/i.test(s.root || s.project || '');
export interface ProjectOffice { key: string; name: string; provider: string; people: Person[]; waiting: number }
/** The project offices among these people, as the apps list their projects: the latest active first. */
export function projectOffices(list: Person[], names?: Record<string, string>): ProjectOffice[] {
  const map = new Map<string, ProjectOffice & { at: number }>();
  for (const p of list.filter(x => x.state !== 'ended')) {
    const key = officeKey(p.session); let o = map.get(key);
    if (!o) { o = { key, name: officeName(p.session, names), provider: p.session.key.provider, people: [], waiting: 0, at: 0 }; map.set(key, o); }
    o.people.push(p); o.at = Math.max(o.at, p.session.lastActivity); if (p.state === 'waiting') o.waiting++;
  }
  return [...map.values()].sort((a, b) => b.at - a.at || a.name.localeCompare(b.name, 'tr')).map(({ at: _, ...o }) => o);
}
