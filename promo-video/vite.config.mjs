// The capture lab and the film run on the promo site's own Vite setup (promo-site/vite.config.mjs, read-only):
// same aliases, same demo bridge, same app code. It adds this folder's two pages at /promo/.
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
import site from '../promo-site/vite.config.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function stage() {
  return {
    name: 'agentoffice-promo-stage',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const name = { '/promo/lab.html': 'lab.html', '/promo/film.html': 'film.html', '/promo/office.html': 'office', '/promo/island.html': 'island' }[url];
        if (!name) return next();
        const harness = `/@fs/${join(here, 'harness').replaceAll('\\', '/')}`;
        // The site's own office page in another language (its in-memory storage starts in that one).
        const lang = new URLSearchParams((req.url || '').split('?')[1] || '').get('lang') || 'tr';
        // The site's island page running the lab's island (harness/island.ts: system signs, the thin line).
        const page = name === 'office'
          ? readFileSync(join(here, '..', 'promo-site', 'office.html'), 'utf8').replace("language: 'tr'", `language: ${JSON.stringify(lang.replace(/[^a-zA-Z-]/g, ''))}`).replace('src="./src/office.ts"', 'src="/src/office.ts"')
          : name === 'island'
            ? readFileSync(join(here, '..', 'promo-site', 'island.html'), 'utf8').replace('src="./src/island.ts"', `src="${harness}/island.ts"`)
            : readFileSync(join(here, 'harness', name), 'utf8').replaceAll('%HARNESS%', harness);
        const html = await server.transformIndexHtml(req.url, page);
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(html);
      });
    },
  };
}

// The film flicks through the app's languages, so the catalogs the site leaves out come back.
const alias = site.resolve.alias.filter(a => !String(a.find).includes('locales'));

export default {
  ...site,
  resolve: { ...site.resolve, alias },
  // Its own dependency cache, so the site's (site/node_modules/.vite) is left alone.
  cacheDir: resolve(here, 'work/.vite'),
  // No hot reload: an edit must never reload a page halfway through a capture or a render.
  server: { ...site.server, hmr: false, fs: { allow: [...site.server.fs.allow, here] } },
  plugins: [...site.plugins, stage()],
};
