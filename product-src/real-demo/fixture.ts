// Fictional demo data only: made-up agents, projects, tasks, notes and a made-up song.
// Nothing here comes from a real computer, chat, project or file.
import type { MediaSession, PendingRequest, Reminder, Session, Snapshot, WorkEntry } from '@app/shared/contract';

const host = 'demo-site';
const min = 60_000;

type Seed = { id: string; provider: 'claude' | 'codex'; name: string; office: string; status: Session['status']; ago: number; summary: string; reply?: string; title?: string };
const SEEDS: Seed[] = [
  { id: 'lumen-lead', provider: 'claude', name: 'Yönetici', office: 'Lumen', status: 'working', ago: .3, summary: 'Ekibin planı güncelleniyor', reply: 'Sürüm notları hazır' },
  { id: 'lumen-pay', provider: 'claude', name: 'Ödeme sayfası', office: 'Lumen', status: 'working', ago: .2, summary: 'Form doğrulaması yazılıyor' },
  { id: 'lumen-theme', provider: 'claude', name: 'Karanlık tema', office: 'Lumen', status: 'waiting', ago: .6, summary: 'Sorusuna yanıt bekliyor' },
  { id: 'lumen-search', provider: 'claude', name: 'Arama dizini', office: 'Lumen', status: 'working', ago: 1.4, summary: 'Testler koşuyor' },
  { id: 'lumen-docs', provider: 'claude', name: 'Belge çevirisi', office: 'Lumen', status: 'replyEnded', ago: 6, summary: 'Yanıt tamamlandı', reply: 'Kılavuzun üç bölümü çevrildi' },
  { id: 'lumen-perf', provider: 'claude', name: 'Hız ölçümü', office: 'Lumen', status: 'idle', ago: 48, summary: 'Boşta', reply: 'Açılış 1,2 sn kısaldı' },
  { id: 'pusula-api', provider: 'codex', name: 'API sözleşmesi', office: 'Pusula', status: 'working', ago: .5, summary: 'Uç noktalar gözden geçiriliyor' },
  { id: 'pusula-mig', provider: 'codex', name: 'Veri taşıma', office: 'Pusula', status: 'replyEnded', ago: 12, summary: 'Yanıt tamamlandı', reply: 'Taşıma betiği denendi' },
];

function session(s: Seed, now: number): Session {
  return {
    key: { provider: s.provider, hostId: host, sessionId: s.id }, name: s.name, project: s.office, office: s.office, status: s.status,
    lastActivity: now - s.ago * min, startedAt: now - (s.ago + 40) * min, summary: s.summary, reply: s.reply, source: 'demo', files: [], verified: true,
    // Every Claude chat here is a desktop-app chat (it has a link), so no card says "answer it in its terminal".
    link: s.provider === 'claude' ? `demo-chat://${s.id}` : undefined,
  };
}

/** The question the "Karanlık tema" agent asks (answered in the office balloon). */
export function themeQuestion(now: number, version = 1): PendingRequest {
  return {
    key: { sessionKey: { provider: 'claude', hostId: host, sessionId: 'lumen-theme' }, requestId: `soru-${version}` }, version: 1, kind: 'question',
    title: 'Karanlık temada vurgu rengi ne olsun?', detail: 'Karanlık temada vurgu rengi ne olsun?', options: ['Kehribar', 'Okyanus', 'Nane'],
    questions: [{ question: 'Karanlık temada vurgu rengi ne olsun?', header: 'Vurgu', multiSelect: false, options: [
      { label: 'Kehribar', description: 'Sıcak, maskotla uyumlu' },
      { label: 'Okyanus', description: 'Serin ve sakin' },
      { label: 'Nane', description: 'Taze, yüksek karşıtlık' },
    ] }],
    expiresAt: now + 60 * min, holdUntil: now + 9 * min, status: 'pending', canAnswer: true, toolId: `demo-tool-${version}`,
  };
}

export function demoSnapshot(now = Date.now()): Snapshot {
  return {
    schemaVersion: 1, revision: 1, mode: 'demo',
    sessions: SEEDS.map(s => session(s, now)),
    requests: [themeQuestion(now)],
    history: [],
    connections: [
      { provider: 'claude', status: 'connected', detail: 'Örnek bağlantı' },
      { provider: 'codex', status: 'connected', detail: 'Örnek bağlantı' },
    ],
    limits: [
      { provider: 'claude', plan: 'Örnek plan', windows: [{ windowMinutes: 300, usedPercent: 38, resetsAt: now + 132 * min }, { windowMinutes: 10080, usedPercent: 21, resetsAt: now + 3 * 1440 * min }], updatedAt: now - min, source: 'demo' },
      { provider: 'codex', plan: 'Örnek plan', windows: [{ windowMinutes: 300, usedPercent: 12, resetsAt: now + 200 * min }, { windowMinutes: 10080, usedPercent: 9, resetsAt: now + 5 * 1440 * min }], updatedAt: now - min, source: 'demo' },
    ],
    managers: { 'claude:|lumen': 'lumen-lead' },
  };
}

export function demoWorkLog(now = Date.now()): WorkEntry[] {
  const line = (id: string, ago: number, s: string, kind: WorkEntry['kind'], text: string): WorkEntry => {
    const seed = SEEDS.find(x => x.id === s)!;
    return { id, at: now - ago * min, provider: seed.provider, sessionId: s, chat: seed.name, office: seed.office, project: seed.office, kind, text };
  };
  return [
    line('w1', 6, 'lumen-docs', 'reply', 'Kılavuzun üç bölümü çevrildi'),
    line('w2', 22, 'lumen-lead', 'reply', 'Sürüm notları hazır'),
    line('w3', 48, 'lumen-perf', 'reply', 'Açılış 1,2 sn kısaldı'),
    line('w4', 12, 'pusula-mig', 'reply', 'Taşıma betiği denendi'),
  ];
}

/** Abstract generated cover art (no logo, no photo): soft shapes in two hues. */
export function coverArt(a: string, b: string, c: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="r" cx=".3" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="120" height="120" fill="url(#g)"/><circle cx="84" cy="38" r="30" fill="${c}" opacity=".55"/><circle cx="34" cy="86" r="42" fill="url(#r)"/><path d="M0 92 C30 74 58 104 120 80 V120 H0Z" fill="#000" opacity=".22"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const TRACKS = [
  { title: 'Gece Vardiyası', artist: 'Kıyı Dalgası', album: 'Sessiz Saatler', durationMs: 222_000, art: coverArt('#ff8a3d', '#5b2a86', '#ffd36e') },
  { title: 'Kahve ve Kod', artist: 'Kıyı Dalgası', album: 'Sessiz Saatler', durationMs: 198_000, art: coverArt('#1fb6a6', '#1c2b6b', '#9ef0d2') },
  { title: 'Sabah Derlemesi', artist: 'Kıyı Dalgası', album: 'Sessiz Saatler', durationMs: 244_000, art: coverArt('#f25f8c', '#2b1a4a', '#ffb3c7') },
];

export function demoMedia(now = Date.now()): MediaSession[] {
  const t = TRACKS[0];
  return [{ id: 'demo-player', app: 'Örnek oynatıcı', title: t.title, artist: t.artist, album: t.album, status: 'playing', canPlay: true, canPause: true, canNext: true, canPrev: true, canSeek: true, canStop: false, positionMs: 64_000, durationMs: t.durationMs, readAt: now, rate: 1, art: t.art, site: null, siteIcon: null, current: true, playingSince: now - 64_000, lastPlayed: now }];
}

/** One alarm, so the small island's strip can show the next one. */
export function demoReminders(now = Date.now()): Reminder[] {
  const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(7, 30, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const at = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T07:30`;
  return [{ id: 'demo-alarm', title: 'Günaydın', at, repeat: 'weekdays', enabled: true, kind: 'alarm', due: d.getTime(), snoozed: null, rung: null, ringing: false, missed: false }];
}
