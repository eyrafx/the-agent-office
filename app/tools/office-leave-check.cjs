// A side chat leaving the office: seated while it works, then its state becomes unknown and it stands
// up and walks out of the door (preview, headless Edge, sample data only). Frames into <out dir>.
// node tools/office-leave-check.cjs <out dir>
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
const PROJECT = 'C:\Users\Sample\Desktop\Studio';
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const { createServer } = await import('vite');
  const server = await createServer({ logLevel: 'silent', server: { port: 1448, strictPort: false, host: '127.0.0.1' } });
  await server.listen(); const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const now = Date.now(), key = id => ({ provider: 'claude', hostId: 'local', sessionId: id });
  const s = (id, name, extra) => ({ key: key(id), name, title: name, project: PROJECT, root: PROJECT, source: 'hook', files: [], summary: '', verified: true, lastActivity: now - 60_000, link: 'claude://x', ...extra });
  const snap = (side, rev) => ({ schemaVersion: 1, revision: rev, mode: 'live', requests: [], history: [], connections: [{ provider: 'claude', status: 'connected', detail: '' }],
    managers: { [`claude:${PROJECT.toLowerCase()}`]: 'mgr' },
    sessions: [s('mgr', 'Yönetici', { status: 'working', summary: 'Plan yapıyor' }), s('a', 'Ada ayarları', { status: 'working', summary: 'Testleri çalıştırıyor' }), s('side', 'Yan sohbet', side)] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 }, locale: 'tr-TR' });
  await ctx.addInitScript(({ first, project }) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('agentoffice-preview-settings-v1', JSON.stringify({ setupDone: true, language: 'tr' })); localStorage.setItem('agentoffice-preview-snapshot-v1', JSON.stringify(first)); localStorage.setItem('agentoffice-manager-asked', JSON.stringify([`claude:${project.toLowerCase()}`])); }, { first: snap({ status: 'working', summary: 'Kısa bir soruya bakıyor' }, 1), project: PROJECT });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?view=office`); await page.waitForTimeout(3500);
  const frame = page.frames().find(f => /ofis/.test(f.url())), fr = await page.locator('iframe.office-frame').first().boundingBox();
  const shot = async n => page.screenshot({ path: path.join(out, `cikis-${n}.png`), clip: fr });
  const plates = () => frame.evaluate(() => [...document.querySelectorAll('[id^="p"]')].filter(p => /^p\d+$/.test(p.id) && p.textContent).map(p => p.textContent));
  const walkers = () => frame.evaluate(() => document.getElementById('walkers').children.length);
  console.log('before', JSON.stringify(await plates()), 'walkers', await walkers()); await shot('0-masada');
  await page.evaluate(next => new BroadcastChannel('agentoffice-preview').postMessage(next), snap({ status: 'unknown', verified: false, reply: 'Bitti:' }, Date.now() + 10));
  for (const [ms, n] of [[700, '1'], [1600, '2']]) { await page.waitForTimeout(ms); console.log('t+', n, JSON.stringify(await plates()), 'walkers', await walkers()); await shot(`${n}-yuruyor`); }
  await page.waitForTimeout(6000); console.log('after', JSON.stringify(await plates()), 'walkers', await walkers()); await shot('3-gitti');
  console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors');
  await browser.close(); await server.close();
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
