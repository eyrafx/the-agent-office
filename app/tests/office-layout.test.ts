/**
 * The office's offices bar never touches the scene's Limits card: in a real browser (Edge, headless:
 * nothing on the screen), the office with demo data and limits for both tools, at the smallest
 * window and common sizes and zoom levels. Skipped where Edge cannot be started.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer | undefined, browser: Browser | undefined, base = '';
beforeAll(async () => {
  try { browser = await chromium.launch({ channel: 'msedge', headless: true }); } catch { return; }
  server = await createServer({ logLevel: 'silent', server: { port: 1438, strictPort: false, host: '127.0.0.1' } });
  await server.listen();
  base = server.resolvedUrls!.local[0];
}, 60_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

describe('the office\'s bottom bar', () => {
  it('keeps clear of the Limits card at every size', async ({ skip }) => {
    if (!browser || !base) skip();
    const problems: string[] = [];
    for (const [w, h, zoom] of [[860, 600, 1], [1024, 700, 1], [1280, 820, 1.5], [1920, 1080, 1], [2560, 1080, 1]]) {
      const ctx = await browser!.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: zoom });
      const page = await ctx.newPage();
      await page.goto(`${base}?view=office`);
      await page.evaluate(() => { localStorage.clear(); localStorage.setItem('agentoffice-preview-settings-v1', JSON.stringify({ setupDone: true })); });
      await page.reload(); await page.waitForTimeout(1500);
      await page.locator('[data-start-demo]').first().click(); await page.waitForTimeout(1200);
      await page.evaluate(() => { const k = 'agentoffice-preview-snapshot-v1', s = JSON.parse(localStorage.getItem(k)!); const now = Date.now(); s.limits = ['claude', 'codex'].map(p => ({ provider: p, windows: [{ windowMinutes: 300, usedPercent: 42, resetsAt: now + 3600e3 }, { windowMinutes: 10080, usedPercent: 77, resetsAt: now + 86400e3 }], updatedAt: now, source: 'test' })); localStorage.setItem(k, JSON.stringify(s)); });
      await page.reload(); await page.waitForTimeout(3500);
      const gap = await page.evaluate(() => {
        const tabs = document.querySelector('.office-tabs')!.getBoundingClientRect();
        const frame = [...document.querySelectorAll<HTMLIFrameElement>('iframe.office-frame')].find(f => f.getBoundingClientRect().width > 0)!;
        const card = frame.contentDocument!.getElementById('limitkutu')!.getBoundingClientRect(), fr = frame.getBoundingClientRect();
        if (!card.width) return null;
        const c = { l: fr.left + card.left, t: fr.top + card.top, r: fr.left + card.right, b: fr.top + card.bottom };
        return Math.max(c.l - tabs.right, tabs.left - c.r, c.t - tabs.bottom, tabs.top - c.b);
      });
      if (gap === null) problems.push(`${w}x${h}@${zoom}: no Limits card drawn`);
      else if (gap < 8) problems.push(`${w}x${h}@${zoom}: bar and Limits card ${gap < 0 ? 'overlap' : 'touch'} (gap ${Math.round(gap)} px)`);
      await ctx.close();
    }
    expect(problems).toEqual([]);
  }, 180_000);
});
