# AgentOffice website

An English marketing site giving equal weight to the Windows dynamic island and the AI agent office.

`dist` contains the deployable static website. Run `node serve.mjs` from this folder for a local preview. The desktop app itself lives in [`../app`](../app).

- The island uses the desktop app's original page components, CSS, icons and layered mascot, copied into `product-src/source` by `build-product.mjs`.
- All seven pages are included, with synced sample lyrics, all three resting appearances and the original settings panel.
- `product-src/main.ts` supplies a browser-only adapter with fictional agents and in-memory notes, reminders, water and sample files. No native access, file uploads, real media playback or AI account connections.
- The office uses AgentOffice's original scene. Questions are answered in the office, never in the island.
- Browser sizing and hit areas are adapted in `product-src/preview.css`; the page layouts are the app's own.
- Rebuilding the product frame uses the desktop app in `../app` (and its installed Vite) as declared in `build-product.mjs`. The deployed static site has no runtime dependency on that project.
- Download links, support wallets, the feedback route and the approximate hardware figures live in `dist/site-config.js` (placeholders until real values are set). No universal AI app support is claimed.

Building the site never modifies the desktop app.

## Publishing (GitHub Pages)
- Target: https://eyrafx.github.io/the-agent-office/ (repo `the-agent-office`). Every path in `dist/` is relative, so the same files work from `/the-agent-office/` and from a domain root; `fix-subpath.mjs` keeps the product frames that way after each product build.
- `.github/workflows/pages.yml` (at the repository root) publishes the committed `site/dist/` on every push to `main` (no build on GitHub). One-time: Settings › Pages › Source: GitHub Actions.
- `dist/.nojekyll` and a self-contained `dist/404.html` are included.
- Local check as on Pages: `node serve.mjs --base the-agent-office` → http://127.0.0.1:8940/the-agent-office/ (root paths are served too).
- Before publishing, fill in `dist/site-config.js` (wallets, feedback, Store and installer links, hardware figures).
