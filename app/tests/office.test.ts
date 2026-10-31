import { setLanguage, t } from '../src/i18n';
import { describe, it, expect } from 'vitest';
import { floorOf, projectOfficeFrame, avatarFor, deskSpots, seated, SIDE_CHAT_STAY_MS } from '../src/office/projection';
import { autoManager, carriedManagers, counts, managerChoice, namesALead, HISTORY_MS, scopeHeadline, managerOf, officeKey, officeName, people as peopleAt, projectOffices, shortName, todayResults } from '../src/shared/people';
import { officeFeed, speech } from '../src/office/feed';
import { acceptSnapshot, watchSnapshot } from '../src/ui/state';
import type { Bridge, Session } from '../src/shared/contract';
import type { Snapshot } from '../src/shared/contract';
import { sessionId } from '../src/shared/contract';
const sample = (count: number): Snapshot => ({ schemaVersion: 1, revision: 1, mode: 'demo', requests: [], history: [], connections: [], sessions: Array.from({ length: count }, (_, i) => ({ key: { provider: 'codex', hostId: 'local', sessionId: String(i) }, name: `Session ${i}`, project: 'Studio', status: i === 25 ? 'unknown' : 'working', lastActivity: 0, summary: '', source: 'demo', files: [] })) });
setLanguage('tr'); const l = t;
// The samples' times are small numbers: people are seen from a moment just after them.
const people = (snapshot: Snapshot, lang: typeof l) => peopleAt(snapshot, lang, 1000);
const memory = () => { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } }; };
const seatOf = (frame: ReturnType<typeof projectOfficeFrame>, id: string) => frame.seats.find(s => s.person.session.key.sessionId === id)?.seat;
describe('office projection', () => {
  it.each([20, 30])('limits seats while counting every one of %i sessions', count => {
    const storage = memory();
    const frame = projectOfficeFrame(people(sample(count), l), 'all', 0, undefined, storage);
    // Session 25's state is unknown: counted by the office, but not given a desk.
    const seatedCount = count > 25 ? count - 1 : count;
    expect(frame.seats).toHaveLength(14); expect(frame.total).toBe(seatedCount); expect(frame.pages).toBe(Math.ceil(seatedCount / 14));
    const next = projectOfficeFrame(people(sample(count), l), 'all', 1, undefined, storage);
    expect(next.seats[0].person.session.key.sessionId).toBe('14');
  });
  it('keeps every worker at the same desk across updates, filters and newcomers', () => {
    const storage = memory(); const snapshot = sample(5);
    const first = projectOfficeFrame(people(snapshot, l), 'all', 0, undefined, storage);
    // Someone leaves, the rest stay put; a newcomer takes the free desk.
    snapshot.sessions.splice(1, 1); snapshot.sessions[2].summary = 'new work';
    const after = projectOfficeFrame(people(snapshot, l), 'all', 0, undefined, storage);
    for (const id of ['0', '2', '3', '4']) expect(seatOf(after, id)).toBe(seatOf(first, id));
    snapshot.sessions.push({ ...snapshot.sessions[0], key: { ...snapshot.sessions[0].key, sessionId: 'new' } });
    expect(seatOf(projectOfficeFrame(people(snapshot, l), 'all', 0, undefined, storage), 'new')).toBe(1);
    // A filter hides people without moving anyone.
    const filtered = projectOfficeFrame(people(snapshot, l), 'all', 0, p => p.session.key.sessionId !== '2', storage);
    expect(seatOf(filtered, '2')).toBeUndefined(); expect(seatOf(filtered, '4')).toBe(seatOf(first, '4'));
  });
  it('keeps avatars stable across floors and metadata updates', () => {
    const snapshot = sample(30); const key = snapshot.sessions[24].key;
    const avatar = avatarFor(key); snapshot.sessions[24].summary = 'Fresh off-page result';
    const list = people(snapshot, l), floor = floorOf(list, sessionId(key));
    expect(floor).toBe(1);
    const seat = projectOfficeFrame(list, 'all', floor, undefined, memory()).seats.find(s => s.person.session.key.sessionId === '24')!;
    expect(seat.avatar).toEqual(avatar); expect(seat.person.session.summary).toBe('Fresh off-page result');
  });
  it('puts the manager, the waiting and the working on the ground floor, the quietest upstairs', () => {
    const snapshot = sample(16);
    snapshot.sessions.forEach((s, i) => { s.status = 'replyEnded'; s.lastActivity = 1000 + i; });
    snapshot.sessions[0].status = 'working'; snapshot.sessions[1].lastActivity = 1;
    const list = people(snapshot, l), storage = memory();
    const ground = projectOfficeFrame(list, 'all', 0, undefined, storage, '1');
    const ids = ground.seats.map(s => s.person.session.key.sessionId);
    expect(ground.pages).toBe(2); expect(ids).toContain('1'); expect(ids).toContain('0'); expect(ids).toContain('15');
    expect(floorOf(list, sessionId(snapshot.sessions[2].key), '1')).toBe(1);
    expect(projectOfficeFrame(list, 'all', 1, undefined, storage, '1').seats.map(s => s.person.session.key.sessionId).sort()).toEqual(['2', '3']);
    expect(floorOf(list, 'nobody')).toBe(-1);
  });
  it('gives a desk again when an earlier seating left someone past the 14 desks', () => {
    const storage = memory(), snapshot = sample(14);
    storage.setItem('agentoffice-seats-all', JSON.stringify({ [sessionId(snapshot.sessions[13].key)]: 14 }));
    const seats = projectOfficeFrame(people(snapshot, l), 'all', 0, undefined, storage).seats.map(s => s.seat);
    expect(new Set(seats).size).toBe(14); expect(Math.max(...seats)).toBe(13);
  });
  it('counts a chat with its helpers once, and a waiting helper makes its chat wait', () => {
    const snapshot = sample(2); const main = snapshot.sessions[0];
    const helper: Session = { ...main, key: { ...main.key, sessionId: '0~a1' }, parentKey: main.key, name: 'Yardımcı', status: 'working' };
    snapshot.sessions.push(helper);
    snapshot.requests.push({ key: { sessionKey: helper.key, requestId: 'r1' }, version: 1, kind: 'permission', title: 'Bash', detail: 'npm test', options: [], expiresAt: 1, status: 'pending', canAnswer: false });
    const list = people(snapshot, l);
    expect(list).toHaveLength(2); expect(list[0].state).toBe('waiting'); expect(list[0].helpers).toHaveLength(1);
    expect(counts(list)).toEqual({ working: 1, waiting: 1, idle: 0, unverified: 0, history: 0 });
  });
  it('spreads desks evenly: one row up to five, then two rows of nearly equal length', () => {
    expect(deskSpots(4).map(s => s.y)).toEqual([700, 700, 700, 700]);
    for (const n of [6, 8, 9, 13, 14]) {
      const spots = deskSpots(n), top = spots.filter(s => s.y === 560).length, bottom = spots.filter(s => s.y === 836).length;
      expect(top + bottom).toBe(n); expect(top - bottom).toBeGreaterThanOrEqual(0); expect(top - bottom).toBeLessThanOrEqual(1);
      // Desks in a row never overlap (desk width 290 at the row's scale).
      const row = spots.filter(s => s.y === 560); for (let i = 1; i < row.length; i++) expect(row[i].x - row[i - 1].x).toBeGreaterThan(290 * row[i].scale);
    }
  });
  it('gives plates short names and keeps the full name for the card', () => {
    const base = sample(1).sessions[0];
    expect(shortName({ ...base, name: 'Bulmaca - Tasarım' })).toBe('Tasarım');
    expect(shortName({ ...base, name: 'Maskot tasarımı ve AI bağlantısı' })).toBe('Maskot tasarımı');
    expect(shortName({ ...base, name: 'Sistem - Tam Ekran Koruması' })).toBe('Tam Ekran Koruması');
    expect(shortName({ ...base, name: 'Bulmaca - Bilgisayar Rakibi' })).toBe('Bilgisayar Rakibi');
    expect(shortName({ ...base, name: 'Uzun ad', customName: 'Benim adım burada uzun' })).toBe('Benim adım burada uzun');
  });
  it("lists today's replies on the board, newest first, and never an old reply under a new activity's date", () => {
    const snapshot = sample(4), now = Date.parse('2026-10-23T15:00:00');
    const replied = (i: number, at: number) => ({ id: `h${i}`, sessionKey: snapshot.sessions[i].key, kind: 'replyEnded' as const, title: '', at });
    snapshot.sessions[0].reply = 'Cep sayfası hazır.'; snapshot.sessions[0].lastActivity = now - 60_000; snapshot.sessions[0].name = 'Bulmaca - Tasarım';
    snapshot.sessions[1].reply = 'Dün bitti.'; snapshot.sessions[1].lastActivity = now - 26 * 3600_000;
    snapshot.sessions[2].reply = 'Yedek bitti.'; snapshot.sessions[2].lastActivity = now - 120_000; snapshot.sessions[2].name = 'Test ve Paket';
    // Active today, but its reply is from yesterday: not today's.
    snapshot.sessions[3].reply = 'Eski yanıt.'; snapshot.sessions[3].lastActivity = now - 30_000;
    const history = [replied(0, now - 60_000), replied(1, now - 26 * 3600_000), replied(2, now - 120_000), replied(3, now - 25 * 3600_000)];
    expect(todayResults(people(snapshot, l), history, now)).toEqual(['Tasarım: cep sayfası hazır.', 'Test ve Paket: yedek bitti.']);
  });
  it("feeds the user's office: states, the manager's desk and the shown team's counts", () => {
    const snapshot = sample(4), now = 1_000_000_000;
    snapshot.sessions.forEach(s => { s.lastActivity = now; });
    snapshot.sessions[1] = { ...snapshot.sessions[1], status: 'replyEnded', reply: 'Bitti.', lastActivity: now - 60_000 };
    snapshot.sessions[2] = { ...snapshot.sessions[2], status: 'replyEnded', reply: 'Dün.', lastActivity: now - 3600_000 };
    snapshot.sessions[3] = { ...snapshot.sessions[3], name: 'Bulmaca - Yönetici' };
    snapshot.requests.push({ key: { sessionKey: snapshot.sessions[3].key, requestId: 'r' }, version: 1, kind: 'permission', title: 'Komut çalıştırmak için izin istiyor', detail: 'npm test', options: [], expiresAt: now + 1, status: 'pending', canAnswer: false });
    const list = peopleAt(snapshot, l, now), storage = memory(), frame = projectOfficeFrame(list, 'all', 0, undefined, storage);
    // No manager chosen: the middle desk is an ordinary one, taken first; a name makes nobody manager.
    const plain = officeFeed(frame, list, { title: 'TÜM EKİPLER', now, l });
    const desk = (feed: typeof plain) => Object.fromEntries(feed.sekmeler.map(x => [JSON.parse(x.id)[2], x.koltuk]));
    expect(plain.yonetici).toBe(false); expect(Object.values(desk(plain))).toContain(3);
    // The manager chosen: the big middle desk is theirs; only the one who sat there moves, to the manager's desk.
    const feed = officeFeed(projectOfficeFrame(list, 'all', 0, undefined, storage, '0'), list, { title: 'TÜM EKİPLER', now, l, manager: '0' });
    const by = Object.fromEntries(feed.sekmeler.map(x => [JSON.parse(x.id)[2], x]));
    expect(feed.yonetici).toBe(true); expect(by['0'].koltuk).toBe(3);
    // The team sits in the row in front of the big desk: the pair either side of the middle first.
    for (const id of ['1', '2', '3']) expect([9, 11, 10]).toContain(desk(feed)[id]);
    expect(by['0'].yon).toBe(true); expect(by['1'].yon).toBe(false);
    expect(by['0'].durum).toBe('calisiyor'); expect(by['1'].durum).toBe('bosta'); expect(by['2'].durum).toBe('uyuyor');
    expect(by['3'].durum).toBe('bekliyor'); expect(by['3'].balon).toBe('İzin istiyor: npm test'); expect(by['3'].ad).toBe('Yönetici');
    // The board counts by the notch's states: dozing is only a look, the rested one is idle too.
    expect(feed.sayilar).toEqual({ calisiyor: 1, bekliyor: 1, bosta: 2, belirsiz: 0, gecmis: 0 });
    expect(by['2'].nokta).toBe('bosta'); expect(by['3'].nokta).toBe('bekliyor');
    expect(new Set(feed.sekmeler.map(x => x.koltuk)).size).toBe(4);
  });
  it('seats nobody whose state is unknown, lets a side chat leave after its reply and keeps the manager at the big desk', () => {
    const now = 1_000_000_000, snapshot = sample(6);
    snapshot.sessions.forEach(s => { s.lastActivity = now - 1000; s.root = 'C:\\studio'; });
    snapshot.sessions[1] = { ...snapshot.sessions[1], status: 'unknown', verified: false };
    snapshot.sessions[2] = { ...snapshot.sessions[2], name: 'Yan sohbet', status: 'replyEnded', lastActivity: now - SIDE_CHAT_STAY_MS - 1 };
    snapshot.sessions[3] = { ...snapshot.sessions[3], name: 'Yan sohbet', status: 'replyEnded', lastActivity: now - 10_000 };
    snapshot.sessions[4] = { ...snapshot.sessions[4], name: 'Side chat', status: 'working' };
    snapshot.sessions[5] = { ...snapshot.sessions[5], status: 'unknown', verified: false };
    const list = peopleAt(snapshot, l, now);
    expect(list.map(p => seated(p, now))).toEqual([true, false, false, true, true, false]);
    // A side chat the user renamed is a chat like any other.
    expect(seated({ ...list[2], session: { ...list[2].session, customName: 'Kontrol' } }, now)).toBe(true);
    // The manager keeps the big desk without a known state: resting there, its dot still says unknown.
    const frame = projectOfficeFrame(list, 'all', 0, undefined, memory(), '5', now);
    expect(frame.seats.map(s => s.person.session.key.sessionId).sort()).toEqual(['0', '3', '4', '5']);
    const feed = officeFeed(frame, list, { title: 'Studio', now, l, manager: '5' }), boss = feed.sekmeler.find(x => JSON.parse(x.id)[2] === '5')!;
    expect(boss.koltuk).toBe(3); expect(boss.durum).toBe('uyuyor'); expect(boss.nokta).toBe('belirsiz');
    expect(feed.sekmeler.some(x => x.durum === 'belirsiz')).toBe(false);
    // The board still counts everyone: the unknown one and the side chat that left.
    expect(feed.sayilar.belirsiz).toBe(2); expect(feed.sekmeler.length + feed.digerleri).toBe(6);
  });
  it('names a desk cleanly and lets a balloon end at a word, never on a colon', () => {
    const base = { name: '', customName: undefined } as unknown as Session;
    expect(shortName({ ...base, name: 'Çalışan ajan durumu, Diğer kaldırma, cam kontörü' })).toBe('Çalışan ajan durumu');
    expect(shortName({ ...base, name: 'AgentOffice ada: notlar/hatırlatıcı doğrula, kaydet, teslim' })).toBe('AgentOffice ada');
    for (const name of ['Uzun bir başlık, virgüllü: ve iki noktalı', 'Bir iki üç dört beş altı yedi sekiz -', 'Kısa ad:', 'Rapor ve']) expect(shortName({ ...base, name })).not.toMatch(/[,;:\-–—]$|\s(ve|and)$/);
    expect(speech('I committed item 3 as 39d12f2:')).toBe('I committed item 3 as 39d12f2');
    expect(speech('**Bitti.** Testler `npm test` ile geçti ve ekran görüntüleri teslim klasöründe duruyor.')).toBe('Bitti. Testler npm test ile geçti ve ekran…');
    expect(speech('Paket bitince bu betikle gerçek uygulamayı yalnız okuyarak kontrol ederiz.')).toBe('Paket bitince bu betikle gerçek uygulamayı…');
    expect(speech('Değişiklikleri inceledim. Şimdi şunları yapacağım: testleri çalıştırıp raporu yazmak.')).toBe('Değişiklikleri inceledim.');
    for (const t of ['Şunu yaptım: bir, iki, üç, dört, beş, altı, yedi, sekiz', 'Liste:', 'a — b — c — d — e — f — g — h — i — j — k — l — m — n']) expect(speech(t)).not.toMatch(/[:;,–—-]…?$/);
  });
  it('shows a restored chat that answered as idle, and only unseen work as unverified', () => {
    const snapshot = sample(3);
    snapshot.sessions[0] = { ...snapshot.sessions[0], status: 'replyEnded', verified: false };
    snapshot.sessions[1] = { ...snapshot.sessions[1], status: 'working', verified: false };
    snapshot.sessions[2] = { ...snapshot.sessions[2], status: 'unknown', verified: false };
    expect(people(snapshot, l).map(p => p.state)).toEqual(['idle', 'unverified', 'unverified']);
  });
  it("keeps each office's manager to that office; by itself an office takes a chat named like a lead", () => {
    const snapshot = sample(3);
    snapshot.sessions[0] = { ...snapshot.sessions[0], name: 'Bulmaca - Yönetici', root: 'C:\\puzzle' };
    snapshot.sessions[1] = { ...snapshot.sessions[1], name: 'Bulmaca - Tasarım', root: 'C:\\puzzle' };
    snapshot.sessions[2] = { ...snapshot.sessions[2], name: 'Site', root: 'C:\\work' };
    const offices = projectOffices(people(snapshot, l)), puzzle = offices.find(o => o.name === 'puzzle')!, work = offices.find(o => o.name === 'work')!;
    expect(managerChoice(snapshot, puzzle, 1000)).toMatchObject({ source: 'auto' });
    expect(managerOf(snapshot, puzzle, 1000)?.session.key.sessionId).toBe('0');
    expect(managerOf(snapshot, work, 1000)).toBeUndefined();
    const chosen = { ...snapshot, managers: { [puzzle.key]: '1' } };
    expect(managerChoice(chosen, puzzle, 1000)).toMatchObject({ source: 'chosen' });
    expect(managerOf(chosen, puzzle, 1000)?.session.key.sessionId).toBe('1');
    expect(managerOf(chosen, work, 1000)).toBeUndefined();
    // "No manager" is a choice of its own (an empty entry); a choice never follows the chat into another office.
    expect(managerChoice({ ...snapshot, managers: { [puzzle.key]: '' } }, puzzle, 1000)).toEqual({ source: 'none' });
    expect(managerOf({ ...snapshot, managers: { [work.key]: '1' } }, work, 1000)).toBeUndefined();
    expect(officeKey(snapshot.sessions[0])).not.toBe(officeKey({ ...snapshot.sessions[0], key: { ...snapshot.sessions[0].key, provider: 'claude' } }));
  });
  it('makes the chat running helper agents the manager, and a long-resting hand pick gives way to it', () => {
    const now = 10 * 86_400_000, base = sample(4);
    const s = (i: number, extra: Partial<Session>): Session => ({ ...base.sessions[i], root: 'C:\\studio', lastActivity: now - 60_000, status: 'replyEnded', verified: true, ...extra });
    const helper = (parent: Session, id: string, extra: Partial<Session>): Session => ({ ...parent, key: { ...parent.key, sessionId: id }, parentKey: parent.key, name: 'Yardımcı', ...extra });
    const lead = s(0, { name: 'Ofis işleri' }), stale = s(1, { name: 'Çalışan ajan durumu, Diğer kaldırma', status: 'unknown', verified: false, lastActivity: now - 4 * 60_000 }), other = s(2, { name: 'Notlar' }), named = s(3, { name: 'Takım lideri' });
    const snapshot: Snapshot = { ...base, sessions: [lead, stale, other, named, helper(lead, 'h1', { status: 'working', lastActivity: now - 30_000 }), helper(other, 'h2', { status: 'replyEnded', lastActivity: now - 3600_000 })] };
    const office = projectOffices(peopleAt(snapshot, l, now))[0];
    // Of the chats with helpers the latest to run them; a title naming a lead goes first among those.
    expect(autoManager(office, now)?.session.key.sessionId).toBe('0');
    expect(autoManager({ people: office.people.filter(p => p.session.key.sessionId !== '0') }, now)?.session.key.sessionId).toBe('2');
    expect(autoManager({ people: office.people.filter(p => !['0', '2'].includes(p.session.key.sessionId)) }, now)?.session.key.sessionId).toBe('3');
    for (const name of ['Manager', 'Tech lead', 'Gerente de ventas', 'Руководитель', 'マネージャー', '负责人', '매니저', 'Oyun - Yönetici']) expect(namesALead({ name })).toBe(true);
    for (const name of ['Leadership notes', 'Mekanlar', 'Yöneticisiz deneme']) expect(namesALead({ name })).toBe(false);
    // The user's office: an old hand pick of unknown state, the one running helpers takes the big desk by itself.
    const picked = { ...snapshot, managers: { [office.key]: '1' } };
    expect(managerChoice(picked, office, now)).toMatchObject({ source: 'auto', person: { session: { key: { sessionId: '0' } } } });
    // A hand pick that is working (or has worked since the helpers did) keeps the desk.
    const busy = { ...picked, sessions: picked.sessions.map(x => x.key.sessionId === '1' ? { ...x, status: 'working' as const, verified: true, lastActivity: now } : x) };
    expect(managerChoice(busy, projectOffices(peopleAt(busy, l, now))[0], now)).toMatchObject({ source: 'chosen' });
  });
  it('puts a Claude chat started without a project with the other chats, not in an office of its scratch folder', () => {
    const s = sample(1).sessions[0], scratchChat: Session = { ...s, key: { ...s.key, provider: 'claude' }, root: 'C:\\Users\\demo\\AppData\\Roaming\\Claude\\scratch-workspaces\\e7f1\\2eea\\scratch-2026-10-24-a1b2c3' };
    expect(officeName(scratchChat)).toBe('Sohbetler');
    expect(officeKey(scratchChat)).toBe('claude:|sohbetler');
    expect(officeName({ ...scratchChat, root: 'C:\\Users\\demo\\Desktop\\puzzle' })).toBe('puzzle');
  });
  it('carries the former single manager to its office once; other offices find theirs by themselves', () => {
    const snapshot = sample(3);
    snapshot.sessions[0] = { ...snapshot.sessions[0], name: 'Bulmaca - Yönetici', root: 'C:\\puzzle' };
    snapshot.sessions[1] = { ...snapshot.sessions[1], name: 'Bulmaca - Tasarım', root: 'C:\\puzzle' };
    snapshot.sessions[2] = { ...snapshot.sessions[2], name: 'Site', root: 'C:\\work' };
    const offices = projectOffices(people(snapshot, l)), puzzle = offices.find(o => o.name === 'puzzle')!;
    expect(carriedManagers(snapshot, offices)).toEqual({});
    expect(carriedManagers({ ...snapshot, manager: '1' }, offices)).toEqual({ [puzzle.key]: '1' });
  });
  it('says nobody works only for the sources heard from', () => {
    const quiet = { working: 0, waiting: 0, idle: 3, unverified: 0, history: 1 };
    expect(scopeHeadline(quiet, l, new Set(['claude', 'codex']), ['claude', 'codex'])).toBe('Şu an çalışan yok');
    expect(scopeHeadline(quiet, l, new Set(['claude']), ['claude', 'codex'])).toBe("Claude'da çalışan yok");
    expect(scopeHeadline(quiet, l, new Set(), ['claude', 'codex'])).toBe('Kaynak doğrulanmadı');
    expect(scopeHeadline({ ...quiet, unverified: 2 }, l, new Set(['claude', 'codex']), ['claude', 'codex'])).toBe('2 sohbetin güncel durumu bilinmiyor');
    expect(scopeHeadline({ ...quiet, working: 2, waiting: 1 }, l, new Set(), ['claude'])).toBe('2 çalışıyor · 1 seni bekliyor');
  });
  it('makes a chat quiet for three days past, but never ends live work by time alone', () => {
    const snapshot = sample(3), now = 10 * HISTORY_MS;
    snapshot.sessions[0] = { ...snapshot.sessions[0], status: 'replyEnded', lastActivity: now - HISTORY_MS - 1 };
    snapshot.sessions[1] = { ...snapshot.sessions[1], status: 'working', lastActivity: now - 5 * HISTORY_MS };
    snapshot.sessions[2] = { ...snapshot.sessions[2], status: 'replyEnded', lastActivity: now - 60_000 };
    expect(peopleAt(snapshot, l, now).map(p => p.state)).toEqual(['history', 'working', 'idle']);
  });
  it('rejects the stale initial fetch after subscription delivers a newer revision', () => {
    const current = { ...sample(1), revision: 9 }; expect(acceptSnapshot(current, sample(2))).toBe(current);
  });
  it('subscribes before fetching, and keeps the newer subscription result when the fetch resolves late', async () => {
    const calls: string[] = []; const seen: number[] = []; let resolveFetch!: (value: Snapshot) => void;
    const bridge = { subscribe: async (receive: (snapshot:Snapshot) => void) => { calls.push('subscribe'); receive({...sample(1),revision:8}); return () => { calls.push('dispose'); }; }, getSnapshot: () => { calls.push('fetch'); return new Promise<Snapshot>(resolve => { resolveFetch=resolve; }); } } as Bridge;
    const stop=watchSnapshot(bridge,s=>seen.push(s.revision),message=>{throw new Error(message);});
    await Promise.resolve(); expect(calls).toEqual(['subscribe','fetch']);
    resolveFetch(sample(2)); await Promise.resolve(); expect(seen).toEqual([8]);
    stop(); expect(calls).toContain('dispose');
  });
});

describe('the work board', () => {
  const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();
  const line = (id: string, t: number, root: string, extra: Partial<import('../src/shared/contract').WorkEntry> = {}) => ({ id, at: t, provider: 'claude' as const, sessionId: id, chat: 'Bulmaca - Tasarım', root, project: root, kind: 'reply' as const, text: `satır ${id}`, link: 'claude://claude.ai/x', ...extra });
  it('shows one office\'s lines of one local day, newest first, and says when a day has none', async () => {
    const { workBoard, dayKey } = await import('../src/office/feed');
    const { entryOfficeKey } = await import('../src/shared/people');
    const now = at(2026, 10, 25, 15);
    const all = [line('a', at(2026, 10, 25, 9), 'C:\\puzzle'), line('b', at(2026, 10, 25, 14, 30), 'C:\\puzzle'), line('c', at(2026, 10, 24, 23, 59), 'C:\\puzzle'), line('x', at(2026, 10, 25, 10), 'C:\\app')];
    const puzzle = all.filter(e => entryOfficeKey(e) === 'claude:c:\\puzzle');
    const today = workBoard(puzzle, undefined, 'puzzle', l, now);
    expect(today.gun).toBe('2026-10-25');
    expect(today.kayitlar.map(k => k.id)).toEqual(['b', 'a']);
    expect(today.kayitlar[0]).toMatchObject({ ad: 'Tasarım', tam: 'Bulmaca - Tasarım', metin: 'satır b', etiket: 'Yanıt verdi', git: "Claude'da aç" });
    expect(workBoard(puzzle, '2026-10-24', 'puzzle', l, now).kayitlar.map(k => k.id)).toEqual(['c']);
    expect(workBoard(puzzle, '2026-10-20', 'puzzle', l, now).kayitlar).toEqual([]);
    expect(today.bos).toBe('Bu tarihe ait kayıt yok');
    expect(today.gunler.sort()).toEqual(['2026-10-24', '2026-10-25']);
    // A day in the future is not a day of the board; the oldest day kept is 30 days back.
    expect(workBoard(puzzle, '2026-11-02', 'puzzle', l, now).gun).toBe('2026-10-25');
    expect(today.enEski).toBe(dayKey(now - 29 * 86_400_000));
  });
  it('keeps a line in the office it was written in, and opens a Codex line in Codex', async () => {
    const { workBoard } = await import('../src/office/feed');
    const { entryOfficeKey } = await import('../src/shared/people');
    expect(entryOfficeKey(line('s', 0, 'C:/Users/demo/AppData/Roaming/Claude/scratch-workspaces/e7/a'))).toBe('claude:|sohbetler');
    // Where the desktop app keeps them since late October 2026.
    expect(entryOfficeKey(line('s2', 0, 'C:/Users/demo/AppData/Local/Claude-Data/claude_demo0000000000/scratch-workspaces/e7/a'))).toBe('claude:|sohbetler');
    expect(entryOfficeKey(line('s3', 0, 'C:/Users/demo/Desktop/claude_notes/scratch-workspaces-x/a'))).not.toBe('claude:|sohbetler');
    const codex = { ...line('k', at(2026, 10, 25, 9), '', { provider: 'codex', office: 'Sohbetler', link: undefined }) };
    expect(entryOfficeKey(codex)).toBe('codex:|sohbetler');
    expect(workBoard([codex], undefined, 'Sohbetler', l, at(2026, 10, 25, 12)).kayitlar[0].git).toBe("Codex'te aç");
    expect(workBoard([line('n', at(2026, 10, 25, 9), 'C:\g', { link: undefined })], undefined, 'g', l, at(2026, 10, 25, 12)).kayitlar[0].git).toBe('');
  });
});

describe('the manager\'s desk and the floors', () => {
  const office = (count: number) => { const s = sample(count); s.sessions.forEach((x, i) => { x.lastActivity = 1000 - i; x.status = 'replyEnded'; }); return people(s, l); };
  const floorDesks = (list: ReturnType<typeof office>, page: number, manager?: string, visible?: (p: ReturnType<typeof office>[number]) => boolean) => {
    const frame = projectOfficeFrame(list, 'puzzle', page, visible, memory(), manager);
    const feed = officeFeed(frame, list, { title: 'PUZZLE', now: 2000, l, manager });
    return { frame, feed, at3: feed.sekmeler.filter(x => x.koltuk === 3).map(x => JSON.parse(x.id)[2]) };
  };
  it('has the manager\'s desk on the ground floor only, with only the manager at it', () => {
    for (const count of [14, 15, 28, 29]) {
      const list = office(count), manager = String(count - 1); // the quietest chat, so rank alone puts it first
      const ground = floorDesks(list, 0, manager);
      expect(ground.feed.yonetici).toBe(true);
      expect(ground.at3).toEqual([manager]);
      expect(ground.frame.seats.length).toBe(Math.min(14, count));
      expect(ground.frame.pages).toBe(Math.ceil(count / 14));
      for (let page = 1; page < ground.frame.pages; page++) {
        const up = floorDesks(list, page, manager);
        expect(up.feed.yonetici, `${count} kişi, ${page + 1}. kat`).toBe(false);
        expect(up.at3).not.toContain(manager);
      }
      expect(new Set(ground.feed.sekmeler.map(x => x.koltuk)).size).toBe(ground.feed.sekmeler.length);
    }
  });
  it('has no manager\'s desk in an office without a manager, on any floor', () => {
    const list = office(29);
    for (const page of [0, 1, 2]) expect(floorDesks(list, page).feed.yonetici).toBe(false);
  });
  it('keeps the manager\'s desk empty while a search hides the manager', () => {
    const list = office(15), storage = memory();
    const all = officeFeed(projectOfficeFrame(list, 'puzzle', 0, undefined, storage, '3'), list, { title: 'G', now: 2000, l, manager: '3' });
    const hidden = officeFeed(projectOfficeFrame(list, 'puzzle', 0, p => p.session.key.sessionId !== '3', storage, '3'), list, { title: 'G', now: 2000, l, manager: '3' });
    expect(hidden.yonetici).toBe(true);
    expect(hidden.sekmeler.some(x => x.koltuk === 3)).toBe(false);
    // Nobody else moved desk because the manager was hidden.
    const desks = (f: typeof all) => Object.fromEntries(f.sekmeler.map(x => [x.id, x.koltuk]));
    for (const [id, desk] of Object.entries(desks(hidden))) expect(desks(all)[id]).toBe(desk);
  });
});
