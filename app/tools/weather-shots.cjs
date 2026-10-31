// Each window scene, from the app's own office page with the preview's data (headless Edge, nothing
// on the screen): the island's weather reading simulated per WMO code, day or night chosen by the
// city's longitude (where the sun is up or down right now). node weather-shots.cjs <out dir>
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const { createServer } = await import('vite');
  const server = await createServer({ logLevel: 'silent', server: { port: 1442, strictPort: false, host: '127.0.0.1' } });
  await server.listen(); const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  // The sun's height now at a longitude (latitude 41), as the scene computes it.
  const elev = (lon) => { const r = Math.PI / 180, d = Date.now() / 86400000 - 10957.5, g = (357.529 + 0.98560028 * d) * r, q = 280.459 + 0.98564736 * d, L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * r, e = (23.439 - 0.00000036 * d) * r, dek = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), h = ((280.46061837 + 360.98564736629 * d + lon) * r - ra); return Math.asin(Math.sin(41 * r) * Math.sin(dek) + Math.cos(41 * r) * Math.cos(dek) * Math.cos(h)) / r; };
  let day = 0, night = 0, dusk = 0, best = { day: -99, night: 99, dusk: 99 };
  for (let lon = -180; lon <= 180; lon += 1) { const e = elev(lon); if (e > best.day) { best.day = e; day = lon; } if (e < best.night) { best.night = e; night = lon; } if (Math.abs(e - 1) < best.dusk) { best.dusk = Math.abs(e - 1); dusk = lon; } }
  const scenes = [['acik-gunduz', 0, day], ['acik-gece', 0, night], ['safak', 0, dusk], ['parcali-bulutlu', 2, day], ['kapali', 3, day], ['sis', 45, day], ['yagmur', 61, day], ['yagmur-gece', 63, night], ['kar', 73, day], ['firtina', 95, night], ['hava-kapali-ayar', null, day]];
  const errors = [];
  for (const [name, code, lon] of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5, locale: 'tr-TR' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(`${base}?view=office`);
    await page.evaluate(({ code, lon }) => {
      localStorage.clear();
      localStorage.setItem('agentoffice-preview-settings-v1', JSON.stringify({ setupDone: true, statusWeather: code !== null, weatherPlace: { name: 'Test', admin1: '', country: '', countryCode: 'TR', latitude: 41, longitude: lon, timezone: 'UTC' } }));
      localStorage.setItem('agentoffice-preview-status', JSON.stringify({ weather: code === null ? null : { temperature: 12, code, place: 'İstanbul', at: Date.now() } }));
    }, { code, lon });
    await page.reload(); await page.waitForTimeout(1500);
    await page.locator('[data-start-demo]').first().click().catch(() => {}); await page.waitForTimeout(3500);
    const frame = page.frames().find(f => /ofis/.test(f.url()));
    const info = await frame.evaluate(() => ({ hava: document.documentElement.dataset.hava, gunduz: document.documentElement.dataset.gunduz, etiket: document.querySelector('g[clip-path="url(#glass)"] > title')?.textContent }));
    const box = await frame.evaluate(() => { const r = document.querySelector('rect[fill="url(#sky)"]').getBoundingClientRect(); return { x: r.x - 30, y: r.y - 24, w: r.width + 60, h: r.height + 48 }; });
    const fr = await page.locator('iframe.office-frame').first().boundingBox();
    await page.screenshot({ path: path.join(out, `${name}.png`), clip: { x: fr.x + box.x, y: fr.y + box.y, width: box.w, height: box.h } });
    console.log(name, JSON.stringify(info));
    await ctx.close();
  }
  console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors');
  await browser.close(); await server.close();
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
