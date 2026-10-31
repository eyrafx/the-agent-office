// The kawaii redesign's markup (31 Oct 2026), applied to the committed pages in dist/. Safe to run
// again: every change checks whether it is already there. Styles: dist/kawaii.css; behaviour:
// dist/kawaii.js and dist/sakura.js; copy: kawaii-copy.mjs (run prepare-i18n.mjs after editing it).
import fs from 'node:fs/promises';

const HEAD = `<link rel="preload" href="fonts/kawaii/dela-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="fonts/kawaii/mplus-500-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="kawaii.css"><script src="sakura.js" defer></script><script src="kawaii.js" defer></script>`;
const OCTO = n => `assets/octo/octo-${n}`;
const STAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.7 6 6.6.6-5 4.4 1.5 6.5L12 16.7 6.2 20.1l1.5-6.5-5-4.4 6.6-.6z"/></svg>`;
const HEART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4s-7.6-4.6-7.6-10.6A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.6 2.6c0 6-7.6 10.6-7.6 10.6Z"/></svg>`;
const CHAT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>`;

function common(html) {
  // day only (the night theme was dropped on 31 Oct): the class is in the markup, no theme script
  html = html.replace(/<script>\(\(\)=>\{let t;try\{t=localStorage\.getItem\('agentoffice:theme'\)[^<]*<\/script>/, '');
  html = html.replace(/<button type="button" class="kw-theme"[^]*?<\/button>/g, '');
  if (!/<html[^>]*class="kw"/.test(html)) html = html.replace(/<html lang="([^"]*)">/, '<html lang="$1" class="kw">');
  html = html.replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#fff6d2">');
  html = html.replace('href="assets/ada-icon.png"', 'href="assets/octo-icon.png"');
  if (!html.includes('kawaii.css')) html = html.replace('</head>', `${HEAD}</head>`);
  // the brand and small stills become the pink Octo (the corner Octo keeps its own clips)
  html = html.replace(/<img src="mascot\/ada\/still-128\.webp" srcset="mascot\/ada\/still-128\.webp 128w, mascot\/ada\/still-256\.webp 256w"/g, `<img src="${OCTO('base')}-128.webp" srcset="${OCTO('base')}-128.webp 128w, ${OCTO('base')}-256.webp 256w"`);
  return html;
}

async function page(file, edit) {
  const path = `dist/${file}`;
  const before = await fs.readFile(path, 'utf8');
  const after = edit(common(before));
  if (after !== before) await fs.writeFile(path, after);
  console.log(file, after !== before ? 'updated' : 'unchanged');
}

await page('index.html', html => {
  html = html.replace(/<svg class="kw-lanterns"[^]*?<\/svg><div class="kw-moon-disc" aria-hidden="true"><\/div>/, '');
  // hero: the copy on the left, Octo as a sticker on the right, then the story card and its strip
  if (!html.includes('kw-sticker')) {
    const start = html.indexOf('<aside class="octo-story"'), end = html.indexOf('</script></div>', start);
    if (start < 0 || end < 0) throw new Error('Story card not found');
    const card = html.slice(start, end + '</script>'.length);
    const sticker = `<div class="kw-sticker"><img class="kw-octo" data-kw-octo src="${OCTO('wave')}-720.webp" srcset="${OCTO('wave')}-360.webp 360w, ${OCTO('wave')}-720.webp 720w" sizes="(max-width: 900px) 80vw, 500px" alt="Octo, the AgentOffice octopus" width="720" height="580" fetchpriority="high"><span class="kw-badge kw-kana" aria-hidden="true">オクト</span><span class="kw-badge kw-star" aria-hidden="true">${STAR}</span><p class="kw-bubble">Hi! I’m Octo. Nice to meet you!</p></div>`;
    const panel = (n, art, cap) => `<figure class="kw-panel kw-panel-${n}">${art}<figcaption>${cap}</figcaption></figure>`;
    const strip = `<div class="kw-strip" role="group" aria-label="The story of Octolantis, in three panels">${
      panel(1, `<svg class="kw-art" viewBox="0 0 400 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="kw-col"><rect x="150" y="64" width="22" height="86"/><rect x="190" y="50" width="22" height="100"/><rect x="230" y="72" width="22" height="78"/><path d="M140 64h120l-10-18H150z"/></g><path class="kw-wave" d="M0 122q25-14 50 0t50 0 50 0 50 0 50 0 50 0 50 0 50 0V190H0z"/><path class="kw-wave2" d="M0 150q25-12 50 0t50 0 50 0 50 0 50 0 50 0 50 0 50 0V190H0z"/><g class="kw-bub"><circle cx="300" cy="100" r="8"/><circle cx="318" cy="78" r="5"/><circle cx="96" cy="92" r="6"/></g></svg>`, 'Atlantis sank beneath the waves.')
    }${
      panel(2, `<svg class="kw-art" viewBox="0 0 400 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="kw-rays"><path d="M200 40 120 190M200 40 60 170M200 40 280 190M200 40 340 170M200 40 200 190M200 40 20 110M200 40 380 110"/></g><rect class="kw-screen" x="40" y="18" width="320" height="220" rx="14"/><rect class="kw-pill" x="150" y="18" width="100" height="26" rx="13"/><g class="kw-glint"><path d="M110 70l5 10 10 5-10 5-5 10-5-10-10-5 10-5z"/><path d="M300 86l4 8 8 4-8 4-4 8-4-8-8-4 8-4z"/></g></svg>`, 'An island rose at the top of the screen.')
    }${
      panel(3, `<svg class="kw-art" viewBox="0 0 480 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="kw-speed"><path d="M0 50h480M0 82h480M0 114h480M0 146h480M0 178h480"/></g><g class="kw-hearts"><path d="M90 74c-10-14-30-4-20 12l20 18 20-18c10-16-10-26-20-12z"/><path class="kw-heart2" d="M150 126c-7-10-21-3-14 8l14 13 14-13c7-11-7-18-14-8z"/></g></svg><img src="${OCTO('shy')}-256.webp" alt="" width="256" height="225" loading="lazy" decoding="async">`, 'Octo moved in. Your agents are in good arms.')
    }</div>`;
    html = html.slice(0, start) + '</div>' + sticker + card + strip + html.slice(end + '</script></div>'.length);
    html = html.replace('<div class="hero-island-live">', '<span class="kw-band" aria-hidden="true"></span><div class="hero-island-live">');
  }
  // The Windows buttons already carry their "Coming soon" pill (support.js removes it once a download
  // is published), so adding it after load no longer reflows the hero.
  html = html.replace(/<a href="#download" class="button primary download-action">([^]*?)<span>Download for Windows<\/span><\/a>/g, '<a href="#download" class="button primary download-action is-soon">$1<span>Download for Windows</span><small>Coming soon</small></a>');
  // story card and support stills in pink
  html = html.replace(/<img src="mascot\/ada\/still-256\.webp" srcset="mascot\/ada\/still-128\.webp 128w, mascot\/ada\/still-256\.webp 256w" sizes="\(max-width: 640px\) 78px, 108px" alt="" width="108" height="102"/, `<img src="${OCTO('base')}-256.webp" srcset="${OCTO('base')}-128.webp 128w, ${OCTO('base')}-256.webp 256w" sizes="(max-width: 640px) 78px, 108px" alt="" width="108" height="87"`);
  html = html.replace(/<img class="body" src="mascot\/ada\/still-256\.webp" srcset="[^"]*"/, `<img class="body" src="${OCTO('base')}-256.webp" srcset="${OCTO('base')}-128.webp 128w, ${OCTO('base')}-256.webp 256w"`);
  // thank-you corner under the support call to action
  if (!html.includes('data-kw-thanks')) {
    const foot = html.match(/<p class="pledge-foot">[^]*?<\/p>/)[0];
    html = html.replace(foot, `${foot}<div class="kw-thanks"><p class="kw-thanks-bubble" role="status" hidden>Thank you so much!</p><button type="button" class="kw-thanks-btn" data-kw-thanks>${HEART}<span>Say thanks</span></button><p class="kw-thanks-note">No wallet needed. A kind word makes Octo’s day too.</p><div class="kw-thanks-links"><a href="https://github.com/eyrafx/agentoffice" target="_blank" rel="noopener">${STAR}<span>Star on GitHub</span></a><a href="https://github.com/eyrafx/agentoffice/discussions" target="_blank" rel="noopener">${CHAT}<span>Leave a thank-you message</span></a></div></div>`);
  }
  return html;
});

for (const file of ['faq.html', 'privacy.html', 'disclaimer.html']) await page(file, html => html);
