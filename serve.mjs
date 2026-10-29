import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Local preview of dist/.
//   node serve.mjs                      → http://127.0.0.1:8940/
//   node serve.mjs --base agentoffice   → http://127.0.0.1:8940/agentoffice/  (as on GitHub Pages;
//   write it without slashes: Git Bash turns "/agentoffice/" into a Windows path)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.AGENTOFFICE_PREVIEW_PORT || 8940);
const arg = process.argv.indexOf('--base');
const base = ('/' + (arg > 0 ? process.argv[arg + 1] : process.env.AGENTOFFICE_BASE || '/').replace(/^\/+|\/+$/g, '') + '/').replace(/\/+/g, '/');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const notFound = async res => { try { res.writeHead(404, { 'Content-Type': mime['.html'] }).end(await readFile(path.join(root, '404.html'))); } catch { res.writeHead(404).end('Not found'); } };
http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (base !== '/') {
      if (pathname === base.slice(0, -1)) { res.writeHead(301, { Location: base }).end(); return; }
      // Paths outside the prefix are served from the root as well, so a page opened at / (or a
      // tab left open across a restart) keeps working; the site itself only uses relative paths.
      if (pathname.startsWith(base)) pathname = '/' + pathname.slice(base.length);
    }
    const target = path.resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { await notFound(res); }
}).listen(port, '127.0.0.1', () => process.stdout.write(`AgentOffice preview: http://127.0.0.1:${port}${base}\n`));
