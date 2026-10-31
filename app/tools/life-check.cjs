// The office's small life, in the app's own office page (headless Edge): a click on someone shows a
// wave; the manager walks over to someone who starts waiting, stays, and goes back to the desk.
const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const out = process.argv[2];
  const { createServer } = await import('vite');
  const server = await createServer({ logLevel: 'silent', server: { port: 1443, strictPort: false, host: '127.0.0.1' } });
  await server.listen(); const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'tr-TR' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?view=office`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('agentoffice-preview-settings-v1', JSON.stringify({ setupDone: true })); });
  await page.reload(); await page.waitForTimeout(1500);
  await page.locator('[data-start-demo]').first().click(); await page.waitForTimeout(1500);
  // A live office with a manager and nobody waiting yet (in the preview's own data).
  await page.evaluate(() => { const k = 'agentoffice-preview-snapshot-v1', s = JSON.parse(localStorage.getItem(k)); s.mode = 'live'; s.requests = []; const office = 'claude:agentoffice'; s.managers = { [office]: s.sessions.find(x => x.key.provider === 'claude' && !x.parentKey).key.sessionId }; s.sessions.forEach(x => { if (x.status === 'waiting') x.status = 'working'; }); localStorage.setItem(k, JSON.stringify(s)); localStorage.setItem('agentoffice-manager-asked', '["claude:agentoffice"]'); });
  await page.reload(); await page.waitForTimeout(3500);
  const frame = page.frames().find(f => /ofis/.test(f.url()));
  // A click on someone at a desk.
  const desk = await frame.evaluate(() => { const d = document.getElementById('d1'); const r = d.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const fr = await page.locator('iframe.office-frame').first().boundingBox();
  await page.mouse.click(fr.x + desk.x, fr.y + desk.y); await page.waitForTimeout(300);
  const wave = await frame.evaluate(() => document.querySelectorAll('.tepki').length);
  await page.screenshot({ path: path.join(out, 'tiklama-tepkisi.png'), clip: { x: fr.x + desk.x - 160, y: fr.y + desk.y - 220, width: 320, height: 300 } });
  console.log('wave on click:', wave > 0);
  // Someone starts waiting for the user: a question in the preview's data.
  let walkersBefore = await frame.evaluate(() => document.getElementById('walkers').children.length);
  await page.evaluate(() => { const k = 'agentoffice-preview-snapshot-v1', s = JSON.parse(localStorage.getItem(k)); const who = s.sessions.filter(x => x.key.provider === 'claude' && !x.parentKey)[3]; who.status = 'waiting'; s.requests.push({ key: { sessionKey: who.key, requestId: 'q-visit' }, version: 1, kind: 'question', title: 'Hangi renk?', detail: 'Mavi · Yeşil', options: [], expiresAt: Date.now() + 3600e3, status: 'pending', canAnswer: false }); s.revision += 1; localStorage.setItem(k, JSON.stringify(s)); }); await page.reload(); await page.waitForTimeout(1200);
  const frame2 = page.frames().find(f => /ofis/.test(f.url())); walkersBefore = await frame2.evaluate(() => document.getElementById('walkers').children.length);
  await page.waitForTimeout(1500);
  console.log('scene state:', JSON.stringify(await frame2.evaluate(() => ({ solo: document.getElementById('sahne').classList.contains('solo'), orange: document.querySelectorAll('[fill="#ff8a2a"],[stroke="#ff8a2a"]').length, balloons: [...document.querySelectorAll('#ui g')].map(g => g.textContent).filter(Boolean).slice(0, 6) }))), '| snapshot waiting:', await page.evaluate(() => JSON.parse(localStorage.getItem('agentoffice-preview-snapshot-v1')).requests.length));
  // Any later update of the scene (here: a click, which re-sends the office) is when a wait is noticed.
  await page.mouse.click(fr.x + desk.x, fr.y + desk.y);
  let walked = false, back = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const n = await frame2.evaluate(() => document.getElementById('walkers').children.length);
    if (n > walkersBefore) { walked = true; if (i === 6) await page.screenshot({ path: path.join(out, 'yonetici-ziyareti.png'), clip: { x: fr.x, y: fr.y + fr.height * 0.3, width: fr.width, height: fr.height * 0.5 } }); }
  }
  await page.waitForTimeout(6000);
  back = await frame2.evaluate(n => document.getElementById('walkers').children.length <= n, walkersBefore);
  console.log('manager walked over:', walked, '| back at the desk:', back);
  console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors');
  await browser.close(); await server.close();
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
