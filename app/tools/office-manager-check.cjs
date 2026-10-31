// Choosing the office's manager (preview, headless Edge, sample data only): the office finds it by
// itself (the chat running helpers), a click on the big desk opens the picker, a pick there and a
// drag onto the big desk change it, and the card offers "Choose as manager". Frames into <out dir>.
// node tools/office-manager-check.cjs <out dir>
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
const PROJECT = 'C:\Users\Sample\Desktop\Studio', OFFICE = `claude:${PROJECT.toLowerCase()}`;
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const { createServer } = await import('vite');
  const server = await createServer({ logLevel: 'silent', server: { port: 1450, strictPort: false, host: '127.0.0.1' } });
  await server.listen(); const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const now = Date.now(), key = id => ({ provider: 'claude', hostId: 'local', sessionId: id });
  const s = (id, name, extra) => ({ key: key(id), name, title: name, project: PROJECT, root: PROJECT, source: 'hook', files: [], summary: '', verified: true, lastActivity: now - 120_000, link: 'claude://x', status: 'replyEnded', reply: 'Tamam, hazır.', ...extra });
  const snap = { schemaVersion: 1, revision: 1, mode: 'live', requests: [], history: [], connections: [{ provider: 'claude', status: 'connected', detail: '' }], managers: {},
    sessions: [s('lead', 'Ekip işleri', { status: 'working', summary: 'Görevleri dağıtıyor' }), { ...s('lead~h', 'Yardımcı', { status: 'working' }), parentKey: key('lead') },
      s('a', 'Ada ayarları', { status: 'working', summary: 'Testleri çalıştırıyor' }), s('b', 'Bildirim sesleri'), s('c', 'Hava durumu'), s('d', 'Notlar', { status: 'working', summary: 'Listeyi düzenliyor' })] };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 }, locale: 'tr-TR', reducedMotion: 'reduce' });
  await ctx.addInitScript(({ first, office }) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('agentoffice-preview-settings-v1', JSON.stringify({ setupDone: true, language: 'tr' })); localStorage.setItem('agentoffice-preview-snapshot-v1', JSON.stringify(first)); localStorage.setItem('agentoffice-manager-asked', JSON.stringify([office])); }, { first: snap, office: OFFICE });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?view=office`); await page.waitForTimeout(3500);
  const frame = page.frames().find(f => /ofis/.test(f.url())), fr = await page.locator('iframe.office-frame').first().boundingBox();
  const bigDesk = () => frame.evaluate(() => document.getElementById('p3').textContent);
  const managers = () => page.evaluate(() => JSON.parse(localStorage.getItem('agentoffice-preview-snapshot-v1')).managers);
  const rectIn = async id => { const r = await frame.evaluate(i => { const b = document.getElementById(i).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, id); return { x: fr.x + r.x, y: fr.y + r.y, w: r.w, h: r.h }; };
  console.log('1 otomatik:', await bigDesk()); await page.screenshot({ path: path.join(out, '1-otomatik.png'), clip: fr });
  // A click on the big desk's left drawer (not the person): the picker.
  const d3 = await rectIn('d3');
  await page.mouse.click(d3.x + d3.w * 0.1, d3.y + d3.h * 0.85); await page.waitForTimeout(500);
  console.log('2 secici acik:', await page.locator('.manager-picker:not([hidden])').count(), JSON.stringify(await page.locator('.manager-picker').innerText()));
  await page.screenshot({ path: path.join(out, '2-secici.png') });
  await page.locator('.manager-picker [data-mp-chat]', { hasText: 'Notlar' }).click(); await page.waitForTimeout(1500);
  console.log('3 elle secildi:', await bigDesk(), JSON.stringify(await managers())); await page.screenshot({ path: path.join(out, '3-elle-secildi.png'), clip: fr });
  // A seated worker dragged onto the big desk.
  const who = await frame.evaluate(() => { for (let i = 0; i < 14; i++) { if (i === 3) continue; const b = document.getElementById('b' + i); if (b && b.innerHTML) return 'b' + i; } return null; });
  const from = await rectIn(who), to = await rectIn('d3');
  await page.mouse.move(from.x + from.w / 2, from.y + from.h / 2); await page.mouse.down();
  for (let k = 1; k <= 12; k++) { await page.mouse.move(from.x + from.w / 2 + (to.x + to.w / 2 - from.x - from.w / 2) * k / 12, from.y + from.h / 2 + (to.y + to.h / 2 - from.y - from.h / 2) * k / 12); await page.waitForTimeout(30); }
  await page.screenshot({ path: path.join(out, '4-surukle.png'), clip: fr });
  await page.mouse.up(); await page.waitForTimeout(1500);
  console.log('5 suruklendi:', who, await bigDesk(), JSON.stringify(await managers())); await page.screenshot({ path: path.join(out, '5-suruklendi.png'), clip: fr });
  // The card of someone else: "★ Choose as manager"; the manager's card: "Change manager".
  const other = await frame.evaluate(() => { for (let i = 0; i < 14; i++) { if (i === 3) continue; const b = document.getElementById('b' + i); if (b && b.innerHTML) return 'b' + i; } return null; });
  const o = await rectIn(other); await page.mouse.click(o.x + o.w / 2, o.y + o.h / 2, { button: 'right' }); await page.waitForTimeout(600);
  console.log('6 kart:', JSON.stringify(await page.locator('.person-card .card-links').innerText().catch(() => '')));
  await page.screenshot({ path: path.join(out, '6-kart.png') });
  console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors');
  await browser.close(); await server.close();
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
