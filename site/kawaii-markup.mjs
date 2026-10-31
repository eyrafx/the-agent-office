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
    const sticker = `<div class="kw-sticker"><img class="kw-octo" data-kw-octo src="${OCTO('wave')}-720.webp" srcset="${OCTO('wave')}-360.webp 360w, ${OCTO('wave')}-720.webp 720w" sizes="(max-width: 900px) 80vw, 500px" alt="Octo, the octopus of The Agent Office" width="720" height="580" fetchpriority="high"><span class="kw-badge kw-kana" aria-hidden="true">オクト</span><span class="kw-badge kw-star" aria-hidden="true">${STAR}</span><p class="kw-bubble">Hi! I’m Octo. Nice to meet you!</p></div>`;
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
    html = html.replace(foot, `${foot}<div class="kw-thanks"><p class="kw-thanks-bubble" role="status" hidden>Thank you so much!</p><button type="button" class="kw-thanks-btn" data-kw-thanks>${HEART}<span>Say thanks</span></button><p class="kw-thanks-note">No wallet needed. A kind word makes Octo’s day too.</p><div class="kw-thanks-links"><a href="https://github.com/eyrafx/the-agent-office" target="_blank" rel="noopener">${STAR}<span>Star on GitHub</span></a><a href="https://github.com/eyrafx/the-agent-office/discussions" target="_blank" rel="noopener">${CHAT}<span>Leave a thank-you message</span></a></div></div>`);
  }
  // "The Agent Office": the living office, after the office demo. Videos are slots: set data-src
  // (and data-poster) on .kw-office-film and the .kw-loop spans; empty ones show the placeholder.
  if (!html.includes('id="agent-office"')) {
    const at = html.lastIndexOf('<section', html.indexOf('id="media-preview"'));
    const ico = {
      talk: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="f1" d="M6 10h24a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H16l-7 6v-6H6a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4Z"/><path class="f2" d="M24 22h18a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-2v5l-6-5H24a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4Z"/></svg>',
      paw: '<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse class="f1" cx="24" cy="32" rx="11" ry="9"/><circle class="f2" cx="12" cy="20" r="5"/><circle class="f2" cx="20" cy="12" r="5"/><circle class="f2" cx="30" cy="12" r="5"/><circle class="f2" cx="38" cy="20" r="5"/></svg>',
      plane: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="f1" d="M4 22 44 6 34 42 24 30 4 22Z"/><path class="f2" d="M24 30 44 6 18 27Z"/><rect class="f3" x="4" y="34" width="16" height="11" rx="2"/><path d="m4 35 8 6 8-6"/></svg>',
      medal: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="f2" d="M14 4h8l4 12h-8zM34 4h-8l-4 12h8z"/><circle class="f1" cx="24" cy="30" r="13"/><path class="f3" d="m24 22 2.4 5 5.4.6-4 3.7 1.1 5.3-4.9-2.7-4.9 2.7 1.1-5.3-4-3.7 5.4-.6z"/></svg>',
      game: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="f1" d="M12 14h24a9 9 0 0 1 9 9v6a7 7 0 0 1-12.6 4.2L30 30H18l-2.4 3.2A7 7 0 0 1 3 29v-6a9 9 0 0 1 9-9Z"/><path d="M13 20v8M9 24h8"/><circle class="f2" cx="33" cy="21" r="2.6"/><circle class="f3" cx="38" cy="26" r="2.6"/></svg>',
      day: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="f3" cx="17" cy="20" r="8"/><path d="M17 4v4M17 32v4M1 20h4M29 20h4M5.7 8.7l2.8 2.8M25.5 28.5l2.8 2.8M5.7 31.3l2.8-2.8"/><path class="f1" d="M44 34a12 12 0 0 1-15-15 12 12 0 1 0 15 15Z"/></svg>',
      toggle: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect class="f1" x="3" y="13" width="42" height="22" rx="11"/><circle class="f4" cx="34" cy="24" r="7.5"/></svg>'
    };
    const card = (k, title, body, loop) => `<article class="kw-ocard kw-ocard-${k}">${ico[k]}${loop ? '<span class="kw-loop" data-kw-video data-src="" aria-hidden="true"></span>' : ''}<h3>${title}</h3><p>${body}</p></article>`;
    const section = `<section class="kw-office wrap" id="agent-office" aria-labelledby="kw-office-title"><header class="kw-office-head"><p class="eyebrow">THE AGENT OFFICE</p><h2 id="kw-office-title">Fun while you build.</h2><p>The Agent Office is a lively, game-like office where real projects get built. Agents work, chat and take breaks, and all of it plays out in front of you.</p></header><figure class="kw-office-film" data-kw-video data-src="" data-poster=""><div class="kw-film-placeholder"><svg class="kw-film-art" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect class="kw-film-wall" width="640" height="230"/><rect class="kw-film-floor" y="230" width="640" height="130"/><g class="kw-film-window"><rect x="70" y="40" width="170" height="110" rx="10"/><path d="M155 40v110M70 95h170"/></g><g class="kw-film-desk"><rect x="380" y="200" width="200" height="16" rx="6"/><rect x="400" y="150" width="70" height="50" rx="6"/><path d="M395 216v60M565 216v60"/></g><g class="kw-film-fly"><path class="kw-plane" d="M250 120 300 100 288 145 276 130Z"/><g class="kw-env"><rect x="520" y="70" width="46" height="32" rx="4"/><path d="m520 72 23 16 23-16"/></g></g><g class="kw-film-hearts"><path d="M150 210c-6-9-19-3-13 7l13 11 13-11c6-10-7-16-13-7z"/><path d="M600 160c-4-6-13-2-9 5l9 7 9-7c4-7-5-11-9-5z"/></g></svg><img class="kw-film-octo" src="${OCTO('wave')}-360.webp" alt="" width="360" height="290" loading="lazy" decoding="async"><p class="kw-film-note">The Agent Office film is on its way.</p></div></figure><div class="kw-office-grid">${
      card('talk', 'Characters with a life of their own', 'Agents chat, joke, gossip, flirt a little and grumble about the manager. Each one improvises its own lines with its own model.')}${
      card('paw', 'Office pets', 'Lucy, a cuddly Cavalier, snores and chases anything that flies. A sly cat, a parrot that steals things and an aquarium share the floor, and they all enjoy a little care.', true)}${
      card('plane', 'Letters in the air', 'Flying envelopes and paper planes show who is sending what to whom.', true)}${
      card('medal', 'Agent of the Month', 'Every month the office celebrates its standout agent.')}${
      card('game', 'A game layer, one click away', 'Little games start with a click and never touch the real work.', true)}${
      card('day', 'Daily life', 'Outfits, lunch breaks, busy mornings and quiet evenings.')}${
      card('toggle', 'Everything is optional', 'Each part can be switched off, and simple mode keeps the office calm and focused.')
    }</div></section>`;
    html = html.slice(0, at) + section + html.slice(at);
  }
  // a thank-you line in the developer note, just before the signature (text only)
  if (!html.includes('kw-note-thanks')) html = html.replace('<div class="dev-note-sign">', '<p class="kw-note-thanks">The Agent Office was built with Claude, made possible by Anthropic’s startup support program. Thank you, Anthropic 💕</p><div class="dev-note-sign">');
  return html;
});

for (const file of ['faq.html', 'privacy.html', 'disclaimer.html']) await page(file, html => html);
