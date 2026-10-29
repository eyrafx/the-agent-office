// Writes the three trust pages (privacy, FAQ, disclaimer) from one skeleton. Their words live in
// dist/<page>-copy.js (all 11 site languages); the English text is written into the page itself so
// it reads without scripts, and dist/legal.js redraws it in the visitor's language.
import fs from 'node:fs/promises';
import vm from 'node:vm';
const pages = ['privacy', 'faq', 'disclaimer'];
const usage = { memory: '~150 MB', cpu: '~1%', size: '~9 MB' };
const fill = s => s.replace(/\{(\w+)\}/g, (m, k) => usage[k] ?? m);
for (const page of pages) {
  const box = { window: {} };
  vm.runInNewContext(await fs.readFile(`dist/${page}-copy.js`, 'utf8'), box);
  const c = box.window.AO_LEGAL.en;
  const body = `<h1>${c.title}</h1>${c.updated ? `<p class="when">Last updated: ${c.updated}</p>` : ''}${(c.intro || []).map(p => `<p class="lead">${fill(p)}</p>`).join('')}`
    + (c.sections || []).map(s => `<section>${s.h ? `<h2>${s.h}</h2>` : ''}${(s.p || []).map(p => `<p>${fill(p)}</p>`).join('')}${s.items ? `<ul>${s.items.map(i => `<li>${fill(i)}</li>`).join('')}</ul>` : ''}</section>`).join('')
    + (c.questions ? `<div class="legal-faq">${c.questions.map(q => `<details><summary>${q.q}</summary><div>${q.a.map(p => `<p>${fill(p)}</p>`).join('')}</div></details>`).join('')}</div>` : '');
  const links = [['privacy.html', 'Privacy', 'privacy'], ['faq.html', 'FAQ', 'faq'], ['disclaimer.html', 'Disclaimer', 'disclaimer']]
    .map(([f, l, k]) => `<a href="${f}"${k === page ? ' aria-current="page"' : ''}>${l}</a>`).join('')
    + '<a href="index.html#feedback">Feedback</a><a href="index.html#download">Download</a><a href="index.html#languages">Language</a>';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#10131c"><meta name="description" content="AgentOffice — ${c.title}"><title>AgentOffice — ${c.title}</title><link rel="icon" href="assets/robot.png" type="image/png"><link rel="stylesheet" href="studio.css"><link rel="stylesheet" href="legal.css"><script src="site-config.js" defer></script><script src="${page}-copy.js" defer></script><script src="legal.js" defer></script></head><body data-page="${page}">
<header class="legal-header wrap"><a class="brand" href="index.html" aria-label="AgentOffice"><img src="assets/robot.png" alt="" width="45" height="37"><span class="wordmark">AgentOffice<i></i></span></a><div class="legal-tools"><a class="legal-home" href="index.html" data-legal-home><span>Back to AgentOffice</span></a><div class="legal-lang"><label for="legal-language">Language</label><select id="legal-language"></select></div></div></header>
<main class="wrap"><article id="legal">${body}</article></main>
<footer class="legal-footer wrap"><span>© 2026 AgentOffice<span class="footer-by" data-footer-by> · by eyra</span></span><nav id="legal-footer-links" aria-label="AgentOffice">${links}</nav></footer>
</body></html>
`;
  await fs.writeFile(`dist/${page}.html`, html);
}
console.log('Wrote', pages.map(p => p + '.html').join(', '));
