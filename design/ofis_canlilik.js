
// ------------------------------------------------------------------ canlılık (AgentOffice)
// Small, cheap life in the office, added by design/ofis_aktar.py:
// - a click on someone: a little wave above them;
// - the manager (at the big desk) walks over to someone who waits for the user, stays a moment
//   and goes back;
// - the window follows the real day and night (the sun's height at the chosen city, or at the
//   time zone's longitude; no network) and the real weather the island already reads (Open-Meteo,
//   the city in Settings): clear, clouds, overcast, fog, rain, snow, thunderstorm. No weather
//   (off, no city, no recent reading): only day and night, never a guess;
// - the city outside changes with the season by the date (the southern hemisphere by the city's
//   latitude, else the northern): blossoms, full green, autumn colours and falling leaves, bare
//   trees and snow on the roofs and the sill; it goes with the day, the night and the weather;
// - after sunset the room is a touch dimmer.
// Moving parts stop while the office window is hidden and with reduced motion.
let SAKIN = matchMedia('(prefers-reduced-motion: reduce)').matches;
let ORTAM = { kod: null, enlem: null, boylam: null, etiket: '' };
let MEVSIM_ZORLA = null; // a season chosen from outside (a demo or a film), null: by the date
(function () {
  const s = document.createElement('style');
  s.textContent = `
.tepki{animation:tepki 1.1s ease-out forwards;pointer-events:none}
@keyframes tepki{0%{opacity:0;transform:translateY(8px) scale(.6)}18%{opacity:1;transform:translateY(0) scale(1.05)}70%{opacity:1;transform:translateY(-14px) scale(1)}100%{opacity:0;transform:translateY(-26px) scale(.95)}}
.hava-anim{animation-play-state:running}
.yagmur{animation:yagmur .7s linear infinite}
@keyframes yagmur{from{transform:translate(0,-260px)}to{transform:translate(-36px,0)}}
.kar{animation:kar 7s linear infinite}
@keyframes kar{from{transform:translate(0,-260px)}50%{transform:translate(10px,-130px)}to{transform:translate(-6px,0)}}
.bulut{animation:bulut 70s ease-in-out infinite alternate}
@keyframes bulut{from{transform:translateX(-30px)}to{transform:translateX(40px)}}
.sis{animation:sis 24s ease-in-out infinite alternate}
@keyframes sis{from{transform:translateX(-50px);opacity:.75}to{transform:translateX(50px);opacity:1}}
.yaprak{animation:yaprak 11s linear infinite}
@keyframes yaprak{0%{transform:translate(0,0) rotate(0);opacity:0}8%{opacity:1}30%{transform:translate(18px,70px) rotate(110deg)}55%{transform:translate(-8px,140px) rotate(200deg)}80%{transform:translate(14px,205px) rotate(290deg);opacity:1}100%{transform:translate(-4px,262px) rotate(380deg);opacity:0}}
.simsek{opacity:0;animation:simsek 9s linear infinite}
@keyframes simsek{0%,90%,94%,100%{opacity:0}91%{opacity:.75}92%{opacity:.15}93%{opacity:.6}}
.durgun .hava-anim,.durgun .tepki{animation-play-state:paused!important}
.sakin .hava-anim{animation:none!important}
.sakin .tepki{animation:tepki-sakin 1.1s linear forwards}
@keyframes tepki-sakin{0%,80%{opacity:1}100%{opacity:0}}`;
  document.head.appendChild(s);
})();

// A click on someone: a small wave above them.
function tepki(ch) {
  const p = headTop(ch);
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('transform', `translate(${p.x + 46},${p.y + 26})`); // beside the head, clear of the balloon
  g.innerHTML = '<g class="tepki"><circle r="21" fill="#fff" stroke="#2d2a3e" stroke-width="3"/><text y="9" font-size="24" text-anchor="middle">👋</text></g>';
  fxG.appendChild(g);
  setTimeout(() => g.remove(), 1200);
}

// The manager goes over to someone who waits for the user (once per wait), then back to the desk.
const ziyaretEdilen = new Set();
function ziyaret() {
  for (const id of [...ziyaretEdilen]) if (!C[id] || C[id].ds !== 'bekliyor') ziyaretEdilen.delete(id);
  if (SAKIN) return;
  const m = DESKS[3] && DESKS[3].mgr ? deskOwner[3] : null;
  if (!m || m.loc !== 'seat' || m.ds === 'bekliyor' || m.ds === 'uyuyor') return;
  const w = Object.values(C).find(c => c !== m && c.ds === 'bekliyor' && c.loc === 'seat' && !ziyaretEdilen.has(c.id));
  if (!w) return;
  ziyaretEdilen.add(w.id);
  const e = seatExit(m.desk); m.x = e.x; m.y = e.y;
  startWalk(m, { type: 'visit', desk: w.desk });
  renderDesk(m.desk); // the desk empty while the manager is away
}

// ------------------------------------------------------------------ pencere: gün, gece, hava
const PENCERE = (function () {
  const sky = document.querySelector('rect[fill="url(#sky)"]');
  const glass = document.querySelector('g[clip-path="url(#glass)"]');
  if (!sky || !glass) return null;
  const NS = SVGNS, el = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const defs = document.querySelector('defs') || $('sahne').insertBefore(el('defs', {}), $('sahne').firstChild);
  defs.insertAdjacentHTML('beforeend', '<linearGradient id="gok-gun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa8ef"/><stop offset="1" stop-color="#bfe3fb"/></linearGradient>'
    + '<linearGradient id="gok-safak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b5aa8" stop-opacity="0"/><stop offset=".55" stop-color="#f08a6c"/><stop offset="1" stop-color="#ffc98a"/></linearGradient>'
    + '<linearGradient id="gok-kapali" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f98ad"/><stop offset="1" stop-color="#c3c8d3"/></linearGradient>'
    + '<linearGradient id="sis-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef0f4" stop-opacity=".25"/><stop offset="1" stop-color="#eef0f4" stop-opacity=".85"/></linearGradient>');
  const box = { x: +sky.getAttribute('x'), y: +sky.getAttribute('y'), w: +sky.getAttribute('width'), h: +sky.getAttribute('height') };
  const rect = (fill, op) => el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill, opacity: op });
  const gun = rect('url(#gok-gun)', 0), kapali = rect('url(#gok-kapali)', 0), safak = rect('url(#gok-safak)', 0);
  sky.after(gun); gun.after(kapali); kapali.after(safak);
  // What the glass holds: the stars and the moon before the first building, then the buildings.
  const first = [...glass.children].find(c => c.tagName === 'rect');
  const yildiz = el('g', {}), ay = el('g', {}), gunes = el('g', { opacity: 0 });
  for (const c of [...glass.children]) {
    if (c === first) break;
    const cx = +(c.getAttribute('cx') || 0), cy = +(c.getAttribute('cy') || 0);
    const moon = c.tagName === 'circle' && cx > 1170 && cx < 1300 && cy < 170 && (c.getAttribute('fill') !== '#fff');
    (moon ? ay : yildiz).appendChild(c);
  }
  gunes.innerHTML = '<circle cx="1236" cy="104" r="70" fill="#fff3b0" opacity=".45"/><circle cx="1236" cy="104" r="32" fill="#ffd25e" stroke="#f3b23c" stroke-width="3"/>';
  glass.insertBefore(gunes, glass.firstChild); glass.insertBefore(ay, glass.firstChild); glass.insertBefore(yildiz, glass.firstChild);
  const isik = [...glass.querySelectorAll('rect')].filter(r => ['#ffd36b', '#ffc24d', '#fff0a8'].includes(r.getAttribute('fill')));
  // The weather, over the city, inside the glass.
  const hava = el('g', { 'pointer-events': 'none' });
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const bulutlar = el('g', {});
  for (const [x, y, k] of [[640, 92, 1], [820, 66, .8], [1000, 104, 1.15], [1150, 74, .9], [1290, 120, .8]]) {
    const b = el('g', { class: 'bulut hava-anim', style: `animation-delay:${-Math.round(rnd() * 60)}s` });
    b.innerHTML = `<g transform="translate(${x},${y}) scale(${k})"><ellipse cx="0" cy="0" rx="46" ry="18"/><ellipse cx="-26" cy="6" rx="30" ry="14"/><ellipse cx="28" cy="7" rx="32" ry="13"/><ellipse cx="4" cy="-12" rx="26" ry="15"/></g>`;
    bulutlar.appendChild(b);
  }
  const yagmur = el('g', { class: 'yagmur hava-anim', stroke: '#cfe3ff', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .8 });
  for (let i = 0; i < 70; i++) { const x = box.x + rnd() * (box.w + 60), y = box.y - 10 + rnd() * 520; yagmur.appendChild(el('line', { x1: x, y1: y, x2: x - 6, y2: y + 16 })); }
  const kar = el('g', { class: 'kar hava-anim', fill: '#fff', opacity: .95 });
  for (let i = 0; i < 60; i++) kar.appendChild(el('circle', { cx: box.x + rnd() * box.w, cy: box.y - 10 + rnd() * 520, r: (1.6 + rnd() * 2.4).toFixed(1) }));
  const sis = el('g', { class: 'sis hava-anim' }); sis.appendChild(el('rect', { x: box.x - 60, y: box.y + 60, width: box.w + 120, height: box.h, fill: 'url(#sis-g)' }));
  const simsek = el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: '#fff', class: 'simsek hava-anim' });
  // The season: a row of trees on the quay (in front of the near buildings, behind the water),
  // snow on each roof and on the outer sill, falling leaves in autumn.
  const deniz = glass.querySelector('rect[fill="url(#sea)"]');
  const agaclar = el('g', { 'pointer-events': 'none' }), agac = [];
  for (const [x, k] of [[590, .95], [604, .8], [698, 1.1], [713, .85], [778, 1], [852, .9], [866, 1.12], [958, 1], [1040, .88], [1054, 1.08], [1138, 1], [1194, .82], [1208, 1.04], [1296, 1], [1311, .86]]) {
    const g = el('g', { transform: `translate(${x},259) scale(${(k * 1.15).toFixed(2)})` });
    const govde = el('rect', { x: -1.6, y: -15, width: 3.2, height: 15, rx: 1 });
    const dal = el('path', { d: 'M0,-7 L-7,-16 M0,-10 L6,-19 M0,-13 L-1.5,-24 M-3.5,-12 L-8.5,-13.5 M3,-14.5 L8,-14', fill: 'none', 'stroke-width': 1.8, 'stroke-linecap': 'round' });
    const tac = el('g', {}); tac.innerHTML = '<circle cx="0" cy="-20" r="9"/><circle cx="-6.5" cy="-15.5" r="6.5"/><circle cx="6.5" cy="-15" r="6.5"/>';
    const cicek = el('g', {}); cicek.innerHTML = '<circle cx="-3" cy="-23" r="1.7"/><circle cx="4" cy="-19" r="1.7"/><circle cx="-7" cy="-15" r="1.5"/><circle cx="7" cy="-13" r="1.5"/><circle cx="1" cy="-14" r="1.4"/>';
    const zemin = el('g', {}); zemin.innerHTML = '<circle cx="-6" cy="-1.5" r="1.6"/><circle cx="-2.5" cy="-1" r="1.3"/><circle cx="5" cy="-1.6" r="1.6"/>';
    g.append(govde, dal, tac, cicek, zemin); agaclar.appendChild(g);
    agac.push({ govde, dal, tac, cicek, zemin });
  }
  if (deniz) glass.insertBefore(agaclar, deniz); else glass.appendChild(agaclar);
  const kat = ['#2b3582', '#354196', '#1a2160'], catiKar = [];
  for (const r of [...glass.querySelectorAll('rect')]) {
    if (r.getAttribute('height') !== '3' || !kat.includes(r.getAttribute('fill'))) continue;
    const x = +r.getAttribute('x'), y = +r.getAttribute('y'), w = +r.getAttribute('width');
    const c = el('path', { d: `M${x - 1.5},${y + 2} Q${x - 1.5},${y - 3} ${x + 3},${y - 3} H${x + w - 3} Q${x + w + 1.5},${y - 3} ${x + w + 1.5},${y + 2} Q${x + w * .7},${y + 4} ${x + w * .5},${y + 2.2} Q${x + w * .25},${y + 4.5} ${x - 1.5},${y + 2} Z`, display: 'none' });
    r.after(c); catiKar.push(c);
  }
  let d = `M${box.x},${box.y + box.h} V${box.y + box.h - 5}`;
  for (let x = box.x, i = 0; x < box.x + box.w; x += 24, i++) d += ` Q${x + 12},${box.y + box.h - (i % 3 === 1 ? 12 : 9)} ${Math.min(x + 24, box.x + box.w)},${box.y + box.h - (i % 2 ? 5 : 6)}`;
  const esikKar = el('path', { d: d + ` V${box.y + box.h} Z`, display: 'none' });
  const yapraklar = el('g', { 'pointer-events': 'none' }), yaprak = [];
  for (let i = 0; i < 12; i++) {
    const o = el('g', { transform: `translate(${(box.x + 30 + rnd() * (box.w - 60)).toFixed(0)},${(box.y - 12 + rnd() * 40).toFixed(0)})` });
    const a = el('g', { class: 'yaprak hava-anim', style: `animation-duration:${(9 + rnd() * 6).toFixed(1)}s;animation-delay:${-(rnd() * 14).toFixed(1)}s` });
    const y = el('path', { d: 'M-4.5,0 Q0,-3.4 4.5,0 Q0,3.4 -4.5,0 Z' });
    a.appendChild(y); o.appendChild(a); yapraklar.appendChild(o); yaprak.push(y);
  }
  for (const g of [bulutlar, sis, yapraklar, yagmur, kar, simsek]) hava.appendChild(g);
  glass.appendChild(hava);
  glass.appendChild(esikKar);
  const baslik = el('title', {}); glass.appendChild(baslik);
  // After sunset the room is a touch dimmer (the balloons and labels stay as they are).
  const aksam = el('rect', { x: -1920, y: -1200, width: 5760, height: 3600, fill: '#141a3c', opacity: 0, 'pointer-events': 'none' });
  uiG.parentNode.insertBefore(aksam, uiG);
  const gunDuraklari = [...defs.querySelectorAll('#gok-gun stop')];
  return { gun, kapali, safak, yildiz, ay, gunes, isik, bulutlar, yagmur, kar, sis, simsek, baslik, aksam, agac, catiKar, esikKar, yapraklar, yaprak, gunDuraklari };
})();

// The sun's height (degrees) at a place and time; a usual approximation, good to a degree or so.
function gunesYuksekligi(t, enlem, boylam) {
  const r = Math.PI / 180, d = t / 86400000 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * r, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * r, e = (23.439 - 0.00000036 * d) * r;
  const dek = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const saat = ((280.46061837 + 360.98564736629 * d + boylam) * r - ra);
  return Math.asin(Math.sin(enlem * r) * Math.sin(dek) + Math.cos(enlem * r) * Math.cos(dek) * Math.cos(saat)) / r;
}
// WMO weather codes as the window shows them.
function havaTuru(k) {
  if (k === null || k === undefined || isNaN(k)) return 'acik';
  if (k <= 1) return 'acik'; if (k === 2) return 'bulutlu'; if (k === 3) return 'kapali';
  if (k === 45 || k === 48) return 'sis';
  if ((k >= 51 && k <= 67) || (k >= 80 && k <= 82)) return 'yagmur';
  if ((k >= 71 && k <= 77) || k === 85 || k === 86) return 'kar';
  if (k >= 95) return 'firtina';
  return 'acik';
}
// The season by the date (meteorological: March to May is spring in the north); the southern
// hemisphere by the city's latitude has the opposite one; no city: the northern.
const MEVSIMLER = ['ilkbahar', 'yaz', 'sonbahar', 'kis'];
const MEVSIM_ADI = { spring: 'ilkbahar', summer: 'yaz', autumn: 'sonbahar', fall: 'sonbahar', winter: 'kis' };
const MEVSIM_SOZ = { ilkbahar: 'spring', yaz: 'summer', sonbahar: 'autumn', kis: 'winter' };
function mevsimSec(v) { if (typeof v !== 'string') return null; const k = MEVSIM_ADI[v] || v; return MEVSIMLER.includes(k) ? k : null; }
function mevsimOf(t, enlem) {
  const ay = new Date(t).getMonth(); // 0: January
  let i = ay === 11 || ay < 2 ? 3 : ay < 5 ? 0 : ay < 8 ? 1 : 2;
  if (typeof enlem === 'number' && enlem < 0) i = (i + 2) % 4;
  return MEVSIMLER[i];
}
// Colours of each season by day; night and grey skies mix them toward the city's own blue.
const MEVSIM_RENK = {
  ilkbahar: { gok: ['#62b0f2', '#d3f0fb'], tac: ['#ffb9d2', '#93d26a', '#ffc8dc', '#84c95e'], cicek: ['#ff8fb8', '#ffe7f0'], zemin: ['#ffd36b', '#ff9ec4', '#ffffff'] },
  yaz: { gok: ['#3f9ff2', '#c4e8ff'], tac: ['#3d9b4f', '#4cae58', '#2f8a47', '#45a352'] },
  sonbahar: { gok: ['#6ea6dc', '#eee3cd'], tac: ['#f0a03a', '#e6c242', '#d9662e', '#cf8a2e'], yaprak: ['#f0a03a', '#e6c242', '#d9662e', '#c9572a'] },
  kis: { gok: ['#8db5da', '#e6eef6'] },
};
function karis(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0')).join('');
}
function mevsimCiz(mevsim, gunduz, kapali) {
  const P = PENCERE, R = MEVSIM_RENK[mevsim];
  // Night toward the city's blue, a grey sky a little toward grey.
  const renk = c => karis(karis(c, '#8a90a6', kapali ? .22 * gunduz : 0), '#1d2357', (1 - gunduz) * .62);
  P.gunDuraklari.forEach((s, i) => s.setAttribute('stop-color', R.gok[i]));
  const govde = renk('#6b4e3d'), cicek = mevsim === 'ilkbahar';
  P.agac.forEach((a, i) => {
    a.govde.setAttribute('fill', govde); a.dal.setAttribute('stroke', govde);
    a.dal.setAttribute('display', mevsim === 'kis' ? 'inline' : 'none');
    a.tac.setAttribute('display', R.tac ? 'inline' : 'none');
    if (R.tac) a.tac.setAttribute('fill', renk(R.tac[i % R.tac.length]));
    // Blossoms on the trees in spring, little flowers at their feet.
    a.cicek.setAttribute('display', cicek ? 'inline' : 'none');
    if (cicek) a.cicek.setAttribute('fill', renk(R.cicek[i % 2 ? 0 : 1]));
    a.zemin.setAttribute('display', cicek ? 'inline' : 'none');
    if (cicek) a.zemin.setAttribute('fill', renk(R.zemin[i % 3]));
  });
  // Snow stays light at night (moonlit), a cool pale blue.
  const kar = karis(karis('#f7f9ff', '#b9c0cc', kapali ? .25 * gunduz : 0), '#aab4e2', 1 - gunduz);
  P.catiKar.forEach(c => { c.setAttribute('display', mevsim === 'kis' ? 'inline' : 'none'); c.setAttribute('fill', kar); });
  P.esikKar.setAttribute('display', mevsim === 'kis' ? 'inline' : 'none'); P.esikKar.setAttribute('fill', kar);
  // Falling leaves only in autumn, and never with reduced motion.
  P.yapraklar.setAttribute('display', mevsim === 'sonbahar' && !SAKIN ? 'inline' : 'none');
  if (R.yaprak) P.yaprak.forEach((y, i) => y.setAttribute('fill', renk(R.yaprak[i % R.yaprak.length])));
}
function havaCiz() {
  const P = PENCERE; if (!P) return;
  const now = Date.now();
  // Without a city: the time zone's own longitude, a middle latitude.
  const boylam = ORTAM.boylam ?? -new Date().getTimezoneOffset() / 4, enlem = ORTAM.enlem ?? 40;
  const yuk = gunesYuksekligi(now, enlem, boylam);
  const gunduz = Math.max(0, Math.min(1, (yuk + 6) / 12)), safak = Math.max(0, 1 - Math.abs(yuk - 1) / 7) * (gunduz > 0 && gunduz < 1 ? 1 : 0);
  const tur = havaTuru(ORTAM.kod), kapali = tur === 'kapali' || tur === 'sis' || tur === 'yagmur' || tur === 'kar' || tur === 'firtina';
  P.gun.setAttribute('opacity', (gunduz * (kapali ? .35 : 1)).toFixed(2));
  P.kapali.setAttribute('opacity', (kapali ? (.25 + .55 * gunduz) * (tur === 'firtina' ? .7 : 1) : 0).toFixed(2));
  P.safak.setAttribute('opacity', (safak * (kapali ? .25 : .7)).toFixed(2));
  P.yildiz.setAttribute('opacity', (kapali || tur === 'bulutlu' ? 0 : 1 - gunduz).toFixed(2));
  // The moon goes as the light comes, the sun comes once the moon is gone: never both in one place.
  const ayOp = Math.max(0, 1 - gunduz * 2), gunesOp = Math.max(0, gunduz * 2 - 1);
  P.ay.setAttribute('opacity', (kapali ? 0 : ayOp * (tur === 'bulutlu' ? .55 : 1)).toFixed(2));
  P.gunes.setAttribute('opacity', (kapali ? 0 : gunesOp * (tur === 'bulutlu' ? .6 : 1)).toFixed(2));
  P.isik.forEach(r => r.setAttribute('opacity', (.3 + .7 * (1 - gunduz)).toFixed(2)));
  P.bulutlar.setAttribute('display', tur === 'bulutlu' || kapali && tur !== 'sis' ? 'inline' : 'none');
  P.bulutlar.setAttribute('fill', gunduz > .5 ? (kapali ? '#dde1e9' : '#ffffff') : (kapali ? '#565d78' : '#7b84a8'));
  P.bulutlar.setAttribute('opacity', tur === 'bulutlu' ? .9 : .75);
  P.sis.setAttribute('display', tur === 'sis' ? 'inline' : 'none');
  P.yagmur.setAttribute('display', tur === 'yagmur' || tur === 'firtina' ? 'inline' : 'none');
  P.kar.setAttribute('display', tur === 'kar' ? 'inline' : 'none');
  P.simsek.setAttribute('display', tur === 'firtina' ? 'inline' : 'none');
  P.aksam.setAttribute('opacity', ((1 - gunduz) * .1).toFixed(3));
  const mevsim = MEVSIM_ZORLA || mevsimOf(now, ORTAM.enlem);
  mevsimCiz(mevsim, gunduz, kapali);
  // The window's label: the season (once the words have come), then the weather.
  const mevsimSoz = T('ofis.season_' + MEVSIM_SOZ[mevsim], '');
  P.baslik.textContent = [mevsimSoz, ORTAM.etiket].filter(Boolean).join(' · ');
  document.documentElement.dataset.mevsim = mevsim;
  document.documentElement.dataset.hava = ORTAM.kod === null ? 'yok' : tur;
  document.documentElement.dataset.gunduz = gunduz.toFixed(2);
}
function ortam(d) {
  const sayi = v => (typeof v === 'number' && isFinite(v) ? v : null);
  ORTAM = { kod: sayi(d.kod), enlem: sayi(d.enlem), boylam: sayi(d.boylam), etiket: typeof d.etiket === 'string' ? d.etiket : '' };
  if ('mevsim' in d) MEVSIM_ZORLA = mevsimSec(d.mevsim);
  SAKIN = !!d.sakin || matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.toggle('sakin', SAKIN);
  havaCiz();
}
havaCiz();
// The light moves on once a minute, only while the office is seen.
setInterval(() => { if (!paused) havaCiz(); }, 60000);
window.addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data) return;
  if (e.data.type === 'ofis-pause') { document.documentElement.classList.toggle('durgun', !!e.data.on); if (!e.data.on) havaCiz(); }
  else if (e.data.type === 'ofis-ortam') ortam(e.data);
  // A season chosen from outside: 'ilkbahar' | 'yaz' | 'sonbahar' | 'kis' (or spring, summer, autumn,
  // winter); null or anything else goes back to the date.
  else if (e.data.type === 'ofis-mevsim') { MEVSIM_ZORLA = mevsimSec(e.data.mevsim); havaCiz(); }
});
