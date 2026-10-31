// Store screenshots (1920x1080) of the app's own pages with demo data, in headless Edge: nothing on
// the screen. node store-shots.cjs <out dir>
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
const server0 = async () => { const s = await (await import('vite')).createServer({ logLevel: 'silent', server: { middlewareMode: true } }); const m = await s.ssrLoadModule('/src/shared/settings.ts'); await s.close(); return m; };
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const { createServer } = await import('vite');
  const DEFAULT = (await server0()).DEFAULT_SETTINGS;
  const server = await createServer({ logLevel: 'silent', server: { port: 1439, strictPort: false, host: '127.0.0.1' } });
  await server.listen(); const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  for (const lang of ['en', 'tr']) {
    const loc = lang === 'tr' ? 'tr-TR' : 'en-US', ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: loc });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(`${lang}: ${e.message}`));
    await page.goto(`${base}?view=office`);
    await page.evaluate(lang => { localStorage.clear(); localStorage.setItem('agentoffice-preview-settings-v1', JSON.stringify({ language: 'system', setupDone: true, statusWeather: true, statusAudio: true })); localStorage.setItem('agentoffice-preview-status', JSON.stringify({ battery: { percent: 82, charging: false }, audio: { kind: 'headphones', name: 'AirPods Pro', bluetooth: true }, weather: { temperature: 18, code: 1, place: lang === 'tr' ? 'İstanbul' : 'San Francisco', at: Date.now() } })); }, lang);
    await page.reload(); await page.waitForTimeout(1500);
    await page.locator('[data-start-demo]').first().click().catch(() => {}); await page.waitForTimeout(3500);
    const shot = async name => { await page.screenshot({ path: path.join(out, `${lang}-${name}.png`) }); console.log('saved', `${lang}-${name}.png`); };
    await page.locator('[data-layout="focus"]').click().catch(() => {}); await page.waitForTimeout(2500); await shot('1-ofis');
    await page.locator('[data-layout="split"]').click().catch(() => {}); await page.waitForTimeout(3500); await shot('2-ofisler-yan-yana');
    await page.locator('[data-layout="focus"]').click().catch(() => {}); await page.waitForTimeout(1500);
    // A waiting question's card, as a click on its balloon in the office opens it.
    const asking = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /snapshot/.test(k)) || 'null') || '{}'); const r = (s.requests || []).find(r => r.status === 'pending' && r.kind === 'question') || (s.requests || []).find(r => r.status === 'pending'); if (!r) return null; const x = s.sessions.find(x => x.key.sessionId === r.key.sessionKey.sessionId); return { key: JSON.stringify([x.key.provider, x.key.hostId, x.key.sessionId]), home: (x.root || x.project || '').split(/[\\/]/).pop() }; });
    if (asking) {
      await page.evaluate(home => [...document.querySelectorAll('.office-tabs [data-project]')].find(b => b.textContent.toLowerCase().includes(home.toLowerCase()))?.click(), asking.home); await page.waitForTimeout(2500);
      const frame = page.frames().find(f => /ofis/.test(f.url()));
      await frame.evaluate(key => parent.postMessage({ type: 'ofis-select', id: key, rect: { x: 760, y: 360, w: 40, h: 60 }, part: 'balon' }, location.origin), asking.key); await page.waitForTimeout(1500);
      await shot('3-soru-karti');
      await page.locator('[data-close-card]').click().catch(() => {});
    } else console.log('no waiting question in the demo');
    await page.locator('[data-open-settings]').first().click(); await page.waitForTimeout(1500); await shot('6-ayarlar');
    // The island, open on its pages, over a desktop-like backdrop.
    const ictx = await browser.newContext({ viewport: { width: 760, height: 520 }, deviceScaleFactor: 2, locale: loc }); await ictx.addInitScript(([s, l]) => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } }, [await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))), lang]);
    const isl = await ictx.newPage(); isl.on('pageerror', e => errors.push(`${lang} island: ${e.message}`));
    await isl.goto(`${base}?view=notch`); await isl.waitForTimeout(2500);
    await isl.evaluate(() => window.__notch.open()); await isl.waitForTimeout(1200);
    for (const [n, pg] of [['4', 'agents'], ['5', 'focus'], ['7', 'alarms'], ['8', 'media']]) {
      await isl.evaluate(pg => document.querySelector(`[data-page-dot="${pg}"]`)?.click(), pg); await isl.waitForTimeout(1300);
      await isl.screenshot({ path: path.join(out, `_ada-${lang}-${n}-${pg}.png`), omitBackground: true }); console.log('saved island', pg);
    }
    await ictx.close(); await ctx.close();
  }
  console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors');
  await browser.close(); await server.close();
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });