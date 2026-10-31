// The window in each season, from the app's own office page with the preview's data (headless Edge,
// nothing on the screen). The season is forced the way a demo or a film can: a message to the office
// frame, { type: 'ofis-mevsim', mevsim: 'ilkbahar' | 'yaz' | 'sonbahar' | 'kis' } (null: by the date).
// Also checks the date's own choice (north, and south by the city's latitude) and reduced motion.
// node tools/season-shots.cjs <out dir>
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const { createServer } = await import('vite');
  const server = await createServer({ logLevel: 'silent', server: { port: 1443, strictPort: false, host: '127.0.0.1' } });
  await server.listen(); const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const elev = (lon) => { const r = Math.PI / 180, d = Date.now() / 86400000 - 10957.5, g = (357.529 + 0.98560028 * d) * r, q = 280.459 + 0.98564736 * d, L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * r, e = (23.439 - 0.00000036 * d) * r, dek = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), h = ((280.46061837 + 360.98564736629 * d + lon) * r - ra); return Math.asin(Math.sin(41 * r) * Math.sin(dek) + Math.cos(41 * r) * Math.cos(dek) * Math.cos(h)) / r; };
  let day = 0, night = 0, best = { day: -99, night: 99 };
  for (let lon = -180; lon <= 180; lon += 1) { const e = elev(lon); if (e > best.day) { best.day = e; day = lon; } if (e < best.night) { best.night = e; night = lon; } }
  // name, weather code, longitude, forced season, latitude, reduced motion
  const scenes = [['ilkbahar-gunduz', 0, day, 'ilkbahar'], ['yaz-gunduz', 0, day, 'yaz'], ['sonbahar-gunduz', 0, day, 'sonbahar'], ['kis-gunduz', 0, day, 'kis'],
    ['sonbahar-yagmur-gece', 63, night, 'sonbahar'], ['kis-gece', 0, night, 'kis'], ['kis-kar-gunduz', 73, day, 'kis'], ['ilkbahar-kapali', 3, day, 'spring'],
    ['tarih-kuzey', 0, day, null, 41], ['tarih-guney', 0, day, null, -33], ['sonbahar-sakin', 0, day, 'sonbahar', 41, true]];
  const errors = [], shots = process.argv[3] ? process.argv[3].split(',') : null;
  for (const [name, code, lon, season, lat = 41, calm = false] of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5, locale: 'tr-TR', reducedMotion: calm ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(`${base}?view=office`);
    await page.evaluate(({ code, lon, lat }) => {
      localStorage.clear();
      localStorage.setItem('agentoffice-preview-settings-v1', JSON.stringify({ setupDone: true, statusWeather: code !== null, weatherPlace: { name: 'Test', admin1: '', country: '', countryCode: 'TR', latitude: lat, longitude: lon, timezone: 'UTC' } }));
      localStorage.setItem('agentoffice-preview-status', JSON.stringify({ weather: code === null ? null : { temperature: 12, code, place: 'İstanbul', at: Date.now() } }));
    }, { code, lon, lat });
    await page.reload(); await page.waitForTimeout(1500);
    await page.locator('[data-start-demo]').first().click().catch(() => {}); await page.waitForTimeout(3000);
    if (season) await page.evaluate(m => document.querySelector('iframe.office-frame').contentWindow.postMessage({ type: 'ofis-mevsim', mevsim: m }, location.origin), season);
    await page.waitForTimeout(800);
    const frame = page.frames().find(f => /ofis/.test(f.url()));
    const info = await frame.evaluate(() => ({ mevsim: document.documentElement.dataset.mevsim, hava: document.documentElement.dataset.hava, gunduz: document.documentElement.dataset.gunduz, sakin: document.documentElement.classList.contains('sakin'), etiket: document.querySelector('g[clip-path="url(#glass)"] > title')?.textContent }));
    if (!shots || shots.includes(name)) {
      const box = await frame.evaluate(() => { const r = document.querySelector('rect[fill="url(#sky)"]').getBoundingClientRect(); return { x: r.x - 30, y: r.y - 24, w: r.width + 60, h: r.height + 48 }; });
      const fr = await page.locator('iframe.office-frame').first().boundingBox();
      await page.screenshot({ path: path.join(out, `${name}.png`), clip: { x: fr.x + box.x, y: fr.y + box.y, width: box.w, height: box.h } });
    }
    console.log(name, JSON.stringify(info));
    await ctx.close();
  }
  console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors');
  await browser.close(); await server.close();
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
