import { sessionId, type SessionKey } from '../shared/contract';
import { isSideChat, type Person } from '../shared/people';

/** A stable look per worker: colours, hair style and an accessory from its id. */
export function avatarFor(key: SessionKey) {
  let seed = 2166136261;
  for (const char of sessionId(key)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const s = seed >>> 0;
  const colors = ['#75a7b6', '#b084c4', '#df8c71', '#72a98b', '#d7af65', '#889cd2', '#c97a94', '#5fa0a0'];
  return { seed: s, shirt: colors[s % colors.length], hair: ['#4b3434', '#82614b', '#252936', '#bd8d57', '#9a3f2e'][(s >>> 3) % 5], skin: ['#f2c5a5', '#d99a70', '#ad7553', '#e8b98a'][(s >>> 6) % 4], style: (s >>> 9) % 3, accessory: (s >>> 12) % 4 };
}

export const SEATS_PER_PAGE = 14;
/** Desk order of the user's office: from the middle outwards, front row first, so a small
 *  team sits together. Seat 0 is the middle desk (3): on the floor with the manager's desk it
 *  is the big desk on the rug and belongs to the manager alone; elsewhere it is an ordinary desk. */
export const DESK_ORDER = [3, 2, 4, 1, 5, 0, 6, 10, 9, 11, 8, 12, 7, 13];
/** With a manager the big desk (3) stands alone at the head of the room: the team sits in the row in
 *  front of it first (a pair either side of the middle, then outwards), then at the far ends of the
 *  manager's row; the desks right beside the manager are the last ones taken. */
export const MANAGER_DESK_ORDER = [3, 9, 11, 10, 8, 12, 7, 13, 1, 5, 0, 6, 2, 4];
/** A side chat (Claude's "Yan sohbet") is a short errand: once its reply is in, it stays this long, then leaves. */
export const SIDE_CHAT_STAY_MS = 2 * 60_000;

/**
 * Who has a desk in the office: the working, those who wait for the user, the resting and the past
 * (they doze at their desks). Nobody sits there without a known state: a chat whose current state is
 * unknown is counted on the board but not seated (no faded ghost). A side chat leaves a short while
 * after its reply; while it works or waits it sits like anyone. The manager always keeps the big desk.
 */
export function seated(p: Person, now = Date.now(), manager?: string): boolean {
  if (p.state === 'ended') return false;
  if (manager && p.session.key.sessionId === manager) return true;
  if (p.state === 'unverified') return false;
  if (isSideChat(p.session) && (p.state === 'idle' || p.state === 'history')) return now - p.session.lastActivity < SIDE_CHAT_STAY_MS;
  return true;
}

/**
 * Seats stay with their worker: given once (the lowest free seat) and kept
 * across updates, filters and restarts. Each office (all, claude, codex) has
 * its own seating; a seat is freed when its worker leaves the office.
 */
export function seatsFor(scope: string, ids: string[], storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage, capacity = Infinity, reserved?: string): Map<string, number> {
  const key = `agentoffice-seats-${scope}`;
  let saved: Record<string, number> = {};
  try { saved = JSON.parse(storage?.getItem(key) || '{}') || {}; } catch { saved = {}; }
  const present = new Set(ids);
  // A seat past the room's desks (saved by an earlier, larger seating) is given again.
  for (const id of Object.keys(saved)) if (!present.has(id) || !Number.isInteger(saved[id]) || saved[id] >= capacity) delete saved[id];
  // The manager's desk (seat 0) is the manager's alone: whoever had it takes the lowest free seat.
  if (reserved && present.has(reserved)) { for (const id of Object.keys(saved)) if (saved[id] === 0 && id !== reserved) delete saved[id]; saved[reserved] = 0; }
  const used = new Set(Object.values(saved));
  for (const id of ids) if (saved[id] === undefined) { let seat = 0; while (used.has(seat)) seat++; saved[id] = seat; used.add(seat); }
  try { storage?.setItem(key, JSON.stringify(saved)); } catch { /* Seating is a convenience. */ }
  return new Map(Object.entries(saved));
}

/**
 * An office holds 14 desks a floor. With more people than that, the ground
 * floor has the manager, then whoever waits for the user, whoever works, then
 * the latest to speak; the quieter ones sit upstairs.
 */
export function floorOrder(list: Person[], manager?: string, now = Date.now()): Person[] {
  const rank = (p: Person) => p.session.key.sessionId === manager ? 0 : p.state === 'waiting' ? 1 : p.state === 'working' ? 2 : 3;
  return list.filter(p => seated(p, now, manager)).map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || b.p.session.lastActivity - a.p.session.lastActivity || a.i - b.i).map(x => x.p);
}
/** The floor someone sits on (0: ground floor), or -1 when they are not in this office. */
export function floorOf(list: Person[], id: string, manager?: string, now = Date.now()): number {
  const i = floorOrder(list, manager, now).findIndex(p => sessionId(p.session.key) === id);
  return i < 0 ? -1 : Math.floor(i / SEATS_PER_PAGE);
}

/** The workers on one floor of an office, each at a desk that stays theirs while
 *  they are on that floor. `visible` hides workers (search) without moving anyone.
 *  An office with a manager has the manager's desk on its ground floor only, and nobody
 *  else ever sits there (with the manager hidden by a search it stays empty); its other
 *  floors, and an office without a manager, have ordinary desks only. On the manager's floor the team
 *  sits in front of the big desk (MANAGER_DESK_ORDER). */
export function projectOfficeFrame(list: Person[], scope: string, page: number, visible: (p: Person) => boolean = () => true, storage?: Pick<Storage, 'getItem' | 'setItem'>, manager?: string, now = Date.now()) {
  const ordered = floorOrder(list, manager, now);
  const pages = Math.max(1, Math.ceil(ordered.length / SEATS_PER_PAGE));
  const current = Math.max(0, Math.min(pages - 1, Math.floor(page) || 0));
  const floor = ordered.slice(current * SEATS_PER_PAGE, (current + 1) * SEATS_PER_PAGE);
  const boss = current === 0 && manager ? floor.find(p => p.session.key.sessionId === manager) : undefined;
  const seats = seatsFor(current ? `${scope}#${current}` : scope, floor.map(p => sessionId(p.session.key)), storage, SEATS_PER_PAGE, boss ? sessionId(boss.session.key) : undefined);
  const order = boss ? MANAGER_DESK_ORDER : DESK_ORDER;
  return {
    page: current, pages, total: ordered.length, managerDesk: !!boss,
    seats: floor.filter(visible).map(person => { const seat = seats.get(sessionId(person.session.key))!; return { person, seat, index: seat, desk: order[seat % order.length], avatar: avatarFor(person.session.key) }; }),
  };
}

export interface Spot { x: number; y: number; scale: number; gap: number }
/**
 * Desks spread evenly over the floor: up to five in one row, more in two rows
 * of (nearly) equal length, so no row fills while the rest stays empty. Desks
 * get smaller only when a row holds more of them.
 */
export function deskSpots(n: number): Spot[] {
  if (n <= 0) return [];
  const rows = n <= 5 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
  const ys = rows.length === 1 ? [700] : [560, 836];
  const out: Spot[] = [];
  rows.forEach((count, r) => {
    const scale = count <= 4 ? .92 : count === 5 ? .86 : count === 6 ? .8 : .76, gap = 1660 / count;
    for (let i = 0; i < count; i++) out.push({ x: Math.round(130 + gap * (i + .5)), y: ys[r], scale, gap });
  });
  return out;
}
