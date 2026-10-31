// The office at several team sizes, with and without a manager, from the app's own office page in the
// preview (headless Edge, nothing on the screen, no app or settings of the user's touched). Each scene
// is a sample snapshot put into the preview's own storage. Also a scene like the user's office: a
// manager, a side chat whose state is unknown, a long title and a reply in English ending in a colon.
// node tools/office-shots.cjs <out dir> [scene,scene]
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');

const PROJECT = 'C:\\Users\\Sample\\Desktop\\Studio';
const NAMES = ['Oyun - Mekanlar', 'Ada ayarları', 'Bildirim sesleri', 'Maskot tasarımı ve AI bağlantısı', 'Hava durumu', 'Tanıtım sitesi', 'Mağaza paketi', 'Dil dosyaları', 'Takvim panosu', 'Limit kutusu', 'Ses testi', 'Kurulum denemesi', 'Kayıt temizliği', 'Odak sayfası', 'Notlar'];
const REPLIES = ['Testler geçti, değişiklik hazır.', 'Ekran görüntüleri teslim klasöründe.', 'Düzelttim; ayrıntılar açıklamada.', 'Ölçüm bitti.'];
function snapshot(n, { manager = true, extra = [] } = {}) {
  const now = Date.now(), sessions = [];
  const key = id => ({ provider: 'claude', hostId: 'local', sessionId: id });
  const base = (id, name, i) => ({ key: key(id), name, title: name, project: PROJECT, root: PROJECT, source: 'hook', files: [], summary: '', verified: true, lastActivity: now - (i + 1) * 60_000, link: 'claude://x' });
  if (manager) sessions.push({ ...base('mgr', 'Yönetici', 0), status: 'replyEnded', reply: 'Ekibe işleri dağıttım, sonuçları bekliyorum.', lastActivity: now - 20_000 });
  for (let i = 0; i < n - (manager ? 1 : 0); i++) {
    const s = base(`w${i}`, NAMES[i % NAMES.length], i);
    if (i % 3 === 0) Object.assign(s, { status: 'working', summary: 'Ofis sahnesini düzenliyor' });
    else Object.assign(s, { status: 'replyEnded', reply: REPLIES[i % REPLIES.length], lastActivity: now - (i % 2 ? 40 : 3) * 60_000 });
    sessions.push(s);
  }
  sessions.push(...extra.map(f => f(base, now)));
  return { schemaVersion: 1, revision: 1, mode: 'live', sessions, requests: [], history: [], connections: [{ provider: 'claude', status: 'connected', detail: '' }, { provider: 'codex', status: 'unverified', detail: '' }], managers: manager ? { [`claude:${PROJECT.toLowerCase()}`]: 'mgr' } : {} };
}
// Like the user's office: a side chat of unknown state, one that finished a moment ago and one long
// finished, a long title with commas and an English reply ending in a colon.
const userLike = () => snapshot(4, { extra: [
  (base, now) => ({ ...base('side1', 'Yan sohbet', 9), status: 'unknown', verified: false, reply: 'Paket bitince bu betikle gerçek uygulamayı yalnız okuyarak kontrol eder', lastActivity: now - 27 * 3600_000 }),
  (base, now) => ({ ...base('side2', 'Yan sohbet', 10), status: 'replyEnded', reply: 'Bitti.', lastActivity: now - 40 * 60_000 }),
  (base, now) => ({ ...base('long', 'Çalışan ajan durumu, Diğer kaldırma, cam kontörü', 11), status: 'replyEnded', reply: 'I committed item 3 as 39d12f2:', lastActivity: now - 5 * 60_000 }),
] });
const SCENES = {
  'yonetici-1': () => snapshot(1), 'yonetici-3': () => snapshot(3), 'yonetici-6': () => snapshot(6), 'yonetici-10': () => snapshot(10), 'yonetici-14': () => snapshot(14),
  'yoneticisiz-1': () => snapshot(1, { manager: false }), 'yoneticisiz-3': () => snapshot(3, { manager: false }), 'yoneticisiz-6': () => snapshot(6, { manager: false }), 'yoneticisiz-10': () => snapshot(10, { manager: false }),
  'kullanici-ofisi': userLike,
};

(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const only = process.argv[3] ? process.argv[3].split(',') : null;
  const { createServer } = await import('vite');
  const server = await createServer({ logLevel: 'silent', server: { port: 1447, strictPort: false, host: '127.0.0.1' } });
  await server.listen(); const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  for (const [name, make] of Object.entries(SCENES)) {
    if (only && !only.includes(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1, locale: 'tr-TR', reducedMotion: 'reduce' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    // Before any of the page's code runs, on every load: the sample is the preview's whole state.
    await ctx.addInitScript(({ snap, project }) => {
      localStorage.clear();
      localStorage.setItem('agentoffice-preview-settings-v1', JSON.stringify({ setupDone: true, language: 'tr' }));
      localStorage.setItem('agentoffice-preview-snapshot-v1', JSON.stringify(snap));
      localStorage.setItem('agentoffice-manager-asked', JSON.stringify([`claude:${project.toLowerCase()}`]));
    }, { snap: make(), project: PROJECT });
    await page.goto(`${base}?view=office`); await page.waitForTimeout(3500);
    const frame = page.frames().find(f => /ofis/.test(f.url()));
    const info = frame ? await frame.evaluate(() => ({ masalar: [...document.querySelectorAll('[id^="p"]')].filter(p => /^p\d+$/.test(p.id) && p.textContent).map(p => `${p.id.slice(1)}:${p.textContent}`), yonetici: !document.getElementById('sahne').classList.contains('solo') })) : null;
    const fr = await page.locator('iframe.office-frame').first().boundingBox({ timeout: 8000 }).catch(() => null);
    await page.screenshot({ path: path.join(out, `${name}.png`), clip: fr || undefined });
    console.log(name, JSON.stringify(info));
    await ctx.close();
  }
  console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors');
  await browser.close(); await server.close();
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
