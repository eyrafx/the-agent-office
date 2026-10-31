// The office as a copy of an office-state.json shows it (preview, headless Edge). Give it a COPY of the
// app's data, never the live file's folder: nothing is written back. Prints who sits at the big desk.
// node tools/office-data-shot.cjs <copy of office-state.json> <out dir> [office name to open]
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
(async () => {
  const [file, out, want] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { createServer } = await import('vite');
  const server = await createServer({ logLevel: 'silent', server: { port: 1449, strictPort: false, host: '127.0.0.1' } });
  await server.listen(); const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 }, locale: 'tr-TR', reducedMotion: 'reduce' });
  await ctx.addInitScript(s => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('agentoffice-preview-settings-v1', JSON.stringify({ setupDone: true, language: 'tr' })); localStorage.setItem('agentoffice-preview-snapshot-v1', JSON.stringify(s)); }, { ...snap, revision: Date.now() });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?view=office`); await page.waitForTimeout(3000);
  if (want) { await page.locator('.office-tabs [data-project]', { hasText: want }).first().click().catch(() => {}); await page.waitForTimeout(2500); }
  const frame = page.frames().filter(f => /ofis/.test(f.url())).pop();
  const info = await frame.evaluate(() => ({ buyukMasa: document.getElementById('p3').textContent, yonetici: !document.getElementById('sahne').classList.contains('solo'), masalar: [...document.querySelectorAll('[id^="p"]')].filter(p => /^p\d+$/.test(p.id) && p.textContent).map(p => `${p.id.slice(1)}:${p.textContent}`) }));
  const fr = await page.locator('iframe.office-frame:visible').first().boundingBox();
  await page.screenshot({ path: path.join(out, 'gercek-ofis-kopyasi.png'), clip: fr });
  console.log(JSON.stringify(info)); console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors');
  await browser.close(); await server.close();
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
