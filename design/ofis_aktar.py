# -*- coding: utf-8 -*-
"""Yazarın özgün ofis çizimini (design/ofis-referans; bu depoda yok)
AgentOffice'in içinde olduğu gibi çalıştırır: app/public/ofis/index.html ve
ofis.js. Sahne, karakterler, yürüyüşler, balonlar, panolar ve limit kutusu
onun kodudur; değişenler:

- veri sunucudan değil, AgentOffice penceresinden gelir (postMessage);
- iki yeni durum: "bekliyor" (seni bekliyor: el kaldırır, "!") ve "belirsiz"
  (bağlantı doğrulanmadı: soluk, "?");
- tıklanan kişi pencereye bildirilir (ayrıntı kartı orada açılır);
- belirli bir sohbete giden sabit bağlantı ve kumbara (veri yok) çıkarıldı.
"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'ofis-referans', 'ofis.html')
OUT = os.path.join(HERE, '..', 'app', 'public', 'ofis')
html = open(SRC, encoding='utf8').read()

page = html[:html.index('<script>')]
script = html[html.index('<script>') + len('<script>'):html.index('</script>')]


def rep(text, a, b, count=1):
    assert a in text, a[:120]
    return text.replace(a, b, count)


# ---------------------------------------------------------------- sayfa
page = rep(page, 'html,body{margin:0;padding:0;height:100%;background:#1e1a2e;overflow:hidden}',
           'html,body{margin:0;padding:0;height:100%;background:linear-gradient(180deg,#f1ecfa 0,#ddd3ee 32.6%,#e9c699 32.6%,#d4a672 100%);overflow:hidden;-webkit-user-select:none;user-select:none}\n#sahne g[id^="d"]{cursor:pointer}\n@keyframes wave{0%,100%{transform:rotate(0)}50%{transform:rotate(-14deg)}}\n.wave{transform-box:fill-box;transform-origin:0% 100%;animation:wave 1.2s ease-in-out infinite}')
page = rep(page, '<defs>', '<defs><filter id="gri"><feColorMatrix type="saturate" values="0"/></filter>')
page = rep(page, 'letter-spacing="2">AJAN OFİSİ</text>', 'letter-spacing="2" id="ekipad">AJAN OFİSİ</text>')
# The window is seldom 16:9: the room goes on past the picture's edges (wall,
# stripes, skirting, planks, sheen) instead of leaving flat bands, and the view
# reaches a little lower so the coffee counter is not cut off at the bottom.
page = rep(page, 'viewBox="0 0 1920 1080"', 'viewBox="0 0 1920 1136"')
page = rep(page, '<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">', '<linearGradient id="wall" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="352">')
page = rep(page, '<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">', '<linearGradient id="floor" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1080">')
X0, X1, Y0, Y1 = -1920, 3840, -1080, 2200
page = rep(page, '<rect width="1920" height="1080" fill="url(#floor)"/>', f'<rect x="{X0}" y="{Y0}" width="{X1 - X0}" height="{Y1 - Y0}" fill="url(#floor)"/>')
page = rep(page, '<rect width="1920" height="352" fill="url(#wall)"/>', f'<rect x="{X0}" y="{Y0}" width="{X1 - X0}" height="{352 - Y0}" fill="url(#wall)"/>')
stripe = re.compile(r'<rect x="\d+" y="0" width="32" height="352" fill="#fff" opacity="\.28"/>\n?')
assert len(stripe.findall(page)) == 30
page = stripe.sub('', page, count=29)
page = stripe.sub(''.join(f'<rect x="{x}" y="{Y0}" width="32" height="{352 - Y0}" fill="#fff" opacity=".28"/>' for x in range(X0, X1, 64)) + '\n', page)
for a in ('<rect y="326" width="1920" height="38"', '<rect y="326" width="1920" height="8"', '<rect y="352" width="1920" height="12"'):
    page = rep(page, a, a.replace('<rect y=', f'<rect x="{X0}" y=').replace('width="1920"', f'width="{X1 - X0}"'))
# Planks: rows 58 high from the skirting down, joints every 260, each row shifted 87.
plank = re.compile(r'<path d="M-?\d+,\d+ [VH]-?\d+" stroke="#a9763f" stroke-opacity="\.(?:22|28)" stroke-width="2"/>\n?')
assert len(plank.findall(page)) == 125
planks = []
for row in range((Y1 - 364) // 58 + 1):
    y = 364 + row * 58
    planks.append(f'<path d="M{X0},{y} H{X1}" stroke="#a9763f" stroke-opacity=".28" stroke-width="2"/>')
    planks += [f'<path d="M{x},{y} V{y + 58}" stroke="#a9763f" stroke-opacity=".22" stroke-width="2"/>' for x in range(X0 + (row * 87 - X0) % 260, X1, 260)]
page = plank.sub('', page, count=124)
page = plank.sub('\n'.join(planks) + '\n', page)
sheen = re.compile(r'<rect x="0" y="\d+" width="1920" height="26" fill="#fff" opacity="\.04"/>\n?')
assert len(sheen.findall(page)) == 7
page = sheen.sub('', page, count=6)
page = sheen.sub(''.join(f'<rect x="{X0}" y="{y}" width="{X1 - X0}" height="26" fill="#fff" opacity=".04"/>' for y in range(366, Y1, 116)) + '\n', page)
# An office without a manager: the rug and the big middle desk give way to an
# ordinary desk like the others (same place, so nobody moves). Both are drawn;
# the scene shows one or the other (class "solo" on the scene, set by the script).
rug = page.index('<rect x="690" y="470" width="540" height="222" rx="30" fill="#b4455f"')
rug_end = page.index('/>', page.index('<rect x="690" y="470" width="540" height="222" rx="30" fill="#fff" opacity=".05"', rug)) + 2
page = page[:rug] + '<g class="mgr">' + page[rug:rug_end] + '</g>' + page[rug_end:]
d2 = page[page.index('<g id="d2"'):page.index('<g id="d3"')]
d3_at = page.index('<g id="d3"'); d3 = page[d3_at:page.index('<g id="d4"')]
plain_desk = d2[d2.index('<g id="b2"></g>') + len('<g id="b2"></g>'):d2.index('<g id="mw2a">')]
plain_books = d2[d2.index('</g>', d2.index('<g id="mw2a">')) + 4:d2.index('<rect x="-44" y="3"')]
new_d3 = rep(d3, '<ellipse cx="0" cy="92" rx="194.0" ry="14" fill="#5a3a22" opacity=".22"/>',
             '<g class="mgr"><ellipse cx="0" cy="92" rx="194.0" ry="14" fill="#5a3a22" opacity=".22"/></g><ellipse class="solo" cx="0" cy="92" rx="159.0" ry="14" fill="#5a3a22" opacity=".22"/>')
new_d3 = rep(new_d3, '<rect x="-52" y="-84" width="104" height="100" rx="28" fill="#2c2f4a" stroke="#2d2a3e" stroke-width="3"/>',
             '<rect class="mgr" x="-52" y="-84" width="104" height="100" rx="28" fill="#2c2f4a" stroke="#2d2a3e" stroke-width="3"/><rect class="solo" x="-52" y="-84" width="104" height="100" rx="28" fill="#c9773e" stroke="#2d2a3e" stroke-width="3"/>')
wide = new_d3[new_d3.index('<g id="b3"></g>') + len('<g id="b3"></g>'):new_d3.index('<g id="mw3a">')]
new_d3 = new_d3.replace(wide, '<g class="mgr">' + wide + '</g><g class="solo">' + plain_desk + '</g>', 1)
after_b = new_d3.index('</g>', new_d3.index('<g id="mw3b">')) + 4
new_d3 = new_d3[:after_b] + '<g class="solo">' + plain_books + '</g>' + new_d3[after_b:]
page = page[:d3_at] + new_d3 + page[d3_at + len(d3):]
page = rep(page, '#sahne g[id^="d"]{cursor:pointer}', '#sahne g[id^="d"]{cursor:pointer}\n#sahne.solo .mgr,#sahne:not(.solo) .solo,#sahne.solo #mw3b{display:none}')
# The coffee corner stands at the bottom left, clear of the window's office tabs
# in the bottom right (its spots are moved with it in the script).
page = rep(page, '<g transform="translate(960,312) scale(.78)">', '<g transform="translate(150,312) scale(.78)">')
# The vignette covers what the window shows (sized in the script).
page = rep(page, '<rect width="1920" height="1080" fill="url(#vig)" pointer-events="none"/>', '<rect id="vig_r" width="1920" height="1080" fill="url(#vig)" pointer-events="none"/>')
piggy_start = page.index('<g transform="translate(1832,1052) scale(.8)">')
piggy_end = page.index('KALAN KREDİ</text>') + len('KALAN KREDİ</text>')
page = page[:piggy_start] + page[piggy_end:]
page = page + '<script src="ofis.js"></script>\n</body></html>\n'
assert '<script>' not in page

# ---------------------------------------------------------------- betik
script = re.sub(r"const YON_URL = '[^']*';", "const YON_URL = '';", script)
script = rep(script, "function isYon(ch) { return /y[öo]netici/i.test(ch.name || ''); }", "function isYon(ch) { return false; }")
script = rep(script, 'function gorunenAd(ch) { return isYon(ch) ? "Yönetici’ye yaz" : ch.name; }', 'function gorunenAd(ch) { return ch.name; }')
script = rep(script, 'function yoneticiyeGit() { location.href = YON_URL; }', 'function yoneticiyeGit() {}')
script = rep(script, "const COL = { calisiyor: '#3fcf7a', arkada: '#9b5cf0', sirada: '#35b9e8', bosta: '#ffb12e', uyuyor: '#7a8cff', limit: '#ff5468' };",
             "const COL = { calisiyor: '#3fcf7a', arkada: '#3fcf7a', sirada: '#35b9e8', bosta: '#8f9cff', uyuyor: '#8f9cff', limit: '#ff5468', bekliyor: '#ff8a2a', belirsiz: '#a3a6b8', gecmis: '#9a97a6' };")
# Two more seated states, drawn with the same parts.
script = rep(script, "function seatParts(p, st) {\n  let b = '', a = '';", r"""function seatParts(p, st) {
  let b = '', a = '';
  const armc0 = p.robot ? '#9fb4d6' : p.c1;
  if (st === 'bekliyor') {
    b = p.robot ? robotUpper('type', true) : torso(p) + head(p, 'talk');
    a = `${limb([[-33, -46], [-54, -8], [-22, 6]], armc0, 17)}${hand(-22, 7, p.skin)}<g class="wave">${limb([[33, -46], [62, -84], [60, -132]], armc0, 17)}${hand(60, -136, p.skin, 9)}</g>` +
      `<g transform="translate(-70,-112)"><g class="pulse"><circle r="21" fill="#ff7a1a" stroke="${OL}" stroke-width="3"/><text y="9" font-size="28" font-weight="800" fill="#fff" text-anchor="middle">!</text></g></g>`;
    return { b, a };
  }
  if (st === 'belirsiz') {
    b = `<g filter="url(#gri)" opacity=".55">${p.robot ? robotUpper('type', true) : torso(p) + head(p, 'open')}</g>`;
    a = `<g filter="url(#gri)" opacity=".55">${sleeves(p)}</g><g transform="translate(-70,-112)"><circle r="20" fill="#8f92a6" stroke="${OL}" stroke-width="3"/><text y="8" font-size="26" font-weight="800" fill="#fff" text-anchor="middle">?</text></g>`;
    return { b, a };
  }""")
script = rep(script, "    else if (ch.ds === 'sirada' && ch.loc === 'seat') k = 'wait';",
             "    else if (ch.ds === 'sirada' && ch.loc === 'seat') k = 'wait';\n    else if (ch.ds === 'bekliyor' && ch.loc === 'seat') k = 'wait';")
# Board: the shown team's title and counts; no piggy bank.
script = rep(script, "  const items = [['calisiyor', 'Çalışıyor', 1474, 102], ['arkada', 'Arkada', 1626, 102], ['sirada', 'Sırada', 1760, 102], ['bosta', 'Boşta', 1474, 138], ['uyuyor', 'Uyuyor', 1626, 138], ['toplam', 'Toplam', 1760, 138]];\n  n.toplam = (n.calisiyor || 0) + (n.arkada || 0) + (n.sirada || 0) + (n.bosta || 0) + (n.uyuyor || 0) + (n.limit || 0);",
             "  const items = [['calisiyor', 'Çalışıyor', 1462, 102], ['bekliyor', 'Seni bekliyor', 1612, 102], ['bosta', 'Boşta', 1772, 102], ['belirsiz', 'Bilinmiyor', 1462, 138], ['gecmis', 'Geçmiş', 1612, 138], ['toplam', 'Sohbet', 1772, 138]];\n  n.toplam = (data.sekmeler || []).length + (data.digerleri || 0);\n  if (data.baslik) $('ekipad').textContent = data.baslik;")
# The board's words are the notch's states, a little smaller to fit; the total is the chats on record.
script = rep(script, '<text x="${x + 14}" y="${y}" font-size="20" font-weight="700" fill="#fff">${lab} ${n[k] || 0}</text>', '<text x="${x + 14}" y="${y}" font-size="16" font-weight="700" fill="#fff">${lab} ${n[k] || 0}</text>')
# Today's board lists replies, not finished work: a quiet dot, no green tick.
script = rep(script, '<circle cx="92" cy="${y - 8}" r="11" fill="#4cc38a" stroke="${OL}" stroke-width="2.4"/><path d="M86,${y - 8} l4,4 l8,-10" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>', '<circle cx="92" cy="${y - 8}" r="7" fill="#8f9cff" stroke="${OL}" stroke-width="2.2"/>')
# A plate's dot shows the person's state by the notch's colours (dozing or coffee is only a look).
script = rep(script, "const sig = ch ? [ch.name, ch.ds, ch.loc, ch.pre.mon].join('|') : '-';", "const sig = ch ? [ch.name, ch.ds, ch.nokta, ch.loc, ch.pre.mon].join('|') : '-';")
script = rep(script, "pl.innerHTML = ch ? plateMarkup(gorunenAd(ch), ch.ds, d.row) : '';", "pl.innerHTML = ch ? plateMarkup(gorunenAd(ch), ch.nokta || ch.ds, d.row) : '';")
script = rep(script, "ch.name = t.ad; ch.balon = t.balon; ch.uzun = t.uzun || t.balon; ch.ds = t.durum; ch.yas = t.yas;", "ch.name = t.ad; ch.balon = t.balon; ch.uzun = t.uzun || t.balon; ch.ds = t.durum; ch.nokta = t.nokta; ch.yas = t.yas;")
script = rep(script, "  if (!rows.length) tb = `<text x=\"78\" y=\"160\" font-size=\"22\" font-weight=\"600\" fill=\"#8a90a8\">Henüz tamamlanan iş özeti yok</text>`;",
             "  if (!rows.length) tb = `<text x=\"78\" y=\"160\" font-size=\"22\" font-weight=\"600\" fill=\"#8a90a8\">${esc(data.tahtaBos || 'Henüz tamamlanan iş özeti yok')}</text>`;")
script = rep(script, "  $('kumbara_t').textContent = (kb === null || kb === undefined) ? '$---' : '$' + Math.floor(kb);",
             "  const kt = $('kumbara_t'); if (kt) kt.textContent = (kb === null || kb === undefined) ? '$---' : '$' + Math.floor(kb);")
# A window that has reset says nothing about the new one: no 0 %, just that a reading is awaited.
script = rep(script, "sf = bitti ? 'yeni dönem başladı' :", "sf = bitti ? 'yenilendi, yeni ölçüm bekleniyor' :")
# The offices' tabs sit in the window's bottom right corner: the limits box keeps
# its place under the desks, rising only as far as needed to stay above the tabs.
script = rep(script, "let LIMIT = null;\nfunction limitCiz() {", "let LIMIT = null;\nlet limitFloor = 1052; // lowest the box may reach: above the window's office tabs (set by fitRoom)\nfunction limitCiz() {")
script = rep(script, "const X = 1394, Y = 922, W = 330, H = 30 + pen.length * 40 + 22;", "const W = 330, H = 30 + pen.length * 40 + 22, X = 1394, Y = Math.max(560, Math.min(922, limitFloor - H));")  # rises above the office tabs on small windows, never into the wall
script = rep(script, 'text-anchor="end">%${Math.round(yz)}</text>`;', 'text-anchor="end">${bitti ? \'\' : \'%\' + Math.round(yz)}</text>`;')
# Coffee spots beside the counter at the bottom left: two rows to its right, nearest first.
script = rep(script, "[810, 1110, 620, 1300, 440, 1480, 260, 1650].forEach(x => SPOTS.push({ x, y: 1030 }));\n[715, 1205, 530, 1390, 350, 1570].forEach(x => SPOTS.push({ x, y: 985 }));",
             "[310, 420, 530, 640, 750, 860, 970, 1080].forEach(x => SPOTS.push({ x, y: 1030 }));\n[365, 475, 585, 695, 805, 915].forEach(x => SPOTS.push({ x, y: 985 }));")
# Data comes from the AgentOffice window, not from a server.
script = rep(script, "function poll() {\n  if (DEMO) { apply(demoData()); return; }", "function poll() {\n  return;")
script = rep(script, "  if (ts - clockT > 1000) { clockT = ts; clock(); }\n  requestAnimationFrame(tick);\n}", "  if (ts - clockT > 1000) { clockT = ts; clock(); }\n  if (!paused) requestAnimationFrame(tick); else ticking = false;\n}\nlet paused = false, ticking = true;")
script = rep(script, "\nclock();\npoll();", r"""
// ------------------------------------------------------------------ AgentOffice
// Data comes from the window; a click on someone is sent back to it, where
// their card opens. The chosen worker's desk glows.
let chosen = null;
function markChosen() {
  const glow = 'drop-shadow(0 0 10px #ffb867) drop-shadow(0 0 3px #ff8a1f)';
  for (let i = 0; i < DESKS.length; i++) { const d = $('d' + i); if (d) d.style.filter = deskOwner[i] && deskOwner[i].loc === 'seat' && deskOwner[i].id === chosen ? glow : ''; }
  Object.values(C).forEach(ch => { if (ch.fig) ch.fig.style.filter = ch.id === chosen ? glow : ''; });
}
function rectOf(ch) {
  const el = ch.loc === 'seat' ? $('d' + ch.desk) : ch.fig;
  const r = el && el.getBoundingClientRect();
  return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
}
const tell = msg => parent.postMessage(msg, location.origin);
// Coming back to an office (another one was shown, or the window was hidden)
// shows it as it is now: the walks missed meanwhile are not replayed, and
// whoever joined meanwhile is already at their desk.
function settle() {
  for (const ch of Object.values(C)) if (ch.loc === 'walk') {
    const end = ch.path[ch.path.length - 1]; if (end) { ch.x = end[0]; ch.y = end[1]; }
    ch.path = []; arrive(ch); if (ch.fig) placeFig(ch);
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) settle(); });
// With a manager the middle desk is the big one on the rug, with two screens;
// without, an ordinary desk in the same place.
let bigDesk = true;
function managerDesk(on) {
  if (on === bigDesk) return;
  bigDesk = on; $('sahne').classList.toggle('solo', !on);
  DESKS[3].mgr = on; DESKS[3].sig = null;
  $('mu3a').setAttribute('transform', on ? 'translate(-122,-76)' : 'translate(100,-76)');
}
window.addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data) return;
  if (e.data.type === 'ofis') { managerDesk(!!e.data.data.yonetici); if (e.data.settle) firstLoad = true; apply(e.data.data); if (e.data.settle) settle(); chosen = e.data.chosen || null; markChosen(); }
  else if (e.data.type === 'ofis-where') { const ch = C[e.data.id]; tell({ type: 'ofis-where', id: e.data.id, rect: ch ? rectOf(ch) : null }); }
  // While the office window is hidden nothing is drawn; shown again, the scene settles to where
  // everyone is now and moves on.
  else if (e.data.type === 'ofis-pause') { paused = !!e.data.on; if (!paused && !ticking) { ticking = true; lastT = performance.now(); settle(); requestAnimationFrame(tick); } }
});
// Which part was clicked travels with the choice: the speech balloon (a question opens in full
// there), the person or their desk (their chat opens), or the right button (the menu with
// renaming and the rest).
function hitOf(t) {
  for (const ch of Object.values(C)) { if (ch.bal.contains(t)) return { ch, part: 'balon' }; if ((ch.fig && ch.fig.contains(t)) || ch.tag.contains(t)) return { ch, part: 'govde' }; }
  for (let i = 0; i < DESKS.length; i++) { const d = $('d' + i); if (d && d.contains(t) && deskOwner[i]) return { ch: deskOwner[i], part: 'govde' }; }
  return null;
}
$('sahne').addEventListener('click', e => {
  const hit = hitOf(e.target);
  tell({ type: 'ofis-select', id: hit ? hit.ch.id : null, rect: hit ? rectOf(hit.ch) : null, part: hit ? hit.part : null });
});
$('sahne').addEventListener('contextmenu', e => {
  const hit = hitOf(e.target); if (!hit) return;
  e.preventDefault();
  tell({ type: 'ofis-select', id: hit.ch.id, rect: rectOf(hit.ch), part: 'menu' });
});
window.addEventListener('keydown', e => { if (e.key === 'Escape') tell({ type: 'ofis-escape' }); });
// The room goes on past the picture's edges; the vignette covers what the window shows.
function fitRoom() {
  const m = $('sahne').getScreenCTM(); if (!m) return;
  const inv = m.inverse(), a = new DOMPoint(0, 0).matrixTransform(inv), b = new DOMPoint(innerWidth, innerHeight).matrixTransform(inv);
  const v = $('vig_r'); v.setAttribute('x', a.x); v.setAttribute('y', a.y); v.setAttribute('width', b.x - a.x); v.setAttribute('height', b.y - a.y);
  limitFloor = new DOMPoint(0, innerHeight - 68).matrixTransform(inv).y; limitCiz();
}
window.addEventListener('resize', fitRoom); fitRoom();
tell({ type: 'ofis-ready' });

clock();
poll();""")
# ---------------------------------------------------------------- iş panosu
# The wall board keeps its frame and place; inside it, the office's work for one day:
# the date with previous / next day and "Bugün", a small calendar on the date, the day's
# lines (time, chat, short description) scrolling inside the board, and a line opened in
# full with the way to its chat. The window sends the chosen day's lines (all floors of
# this office) and is asked for another day. No ticks: a reply is not finished work.
page = rep(page, '<text x="78" y="100" font-size="40" font-weight="800" fill="#e0453f" text-anchor="start" >BUGÜN</text>\n<path d="M78,110 Q150,116 232,108" stroke="#e0453f" stroke-width="4" fill="none" stroke-linecap="round"/>\n<g id="tahta"></g>',
           '<g id="tahta"></g>\n<foreignObject id="pano" x="56" y="46" width="396" height="248"><div xmlns="http://www.w3.org/1999/xhtml" id="pano-kok" class="pano"></div></foreignObject>')
page = rep(page, '</style></head>', r'''
.pano{width:396px;height:248px;box-sizing:border-box;padding:8px 12px 6px 16px;display:flex;flex-direction:column;font-family:"Segoe UI","Trebuchet MS",sans-serif;color:#1f3a78;overflow:hidden;cursor:default}
.pano button{font:inherit;color:inherit;background:none;border:0;margin:0;padding:0;cursor:pointer}
.pano button:disabled{cursor:default}
.pano-bas{flex:none;display:flex;align-items:center;gap:8px;height:54px}
.pano-baslik{display:flex;flex-direction:column;align-items:flex-start;min-width:0;color:#e0453f!important}
.pano-baslik span{display:flex;align-items:baseline;gap:8px;white-space:nowrap;font-size:34px;font-weight:800;line-height:1;letter-spacing:.5px}
.pano-baslik small{font-size:15px;font-weight:700;letter-spacing:0;color:#9aa1b8}
.pano-baslik svg{width:150px;height:9px;margin-top:3px}
.pano-nav{margin-left:auto;display:flex;align-items:center;gap:6px}
.pano-nav button{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#eef1f8!important;box-shadow:inset 0 0 0 2.5px #2d2a3e;font-size:21px!important;font-weight:800!important;line-height:1;color:#2d2a3e!important}
.pano-nav button:disabled{opacity:.3}
.pano-nav .pano-bugun{width:auto;padding:0 11px!important;border-radius:15px;font-size:15px!important}
.pano-nav button:hover:not(:disabled){background:#e2e7f4!important}
.pano-govde{flex:1;min-height:0}
.pano-liste{height:100%;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#c3c9d8 transparent;padding-right:2px;-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 14px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 14px),transparent)}
.pk{display:block;width:100%;text-align:left;padding:4px 6px!important;border-radius:9px}
.pk:hover{background:#f0f3fa!important}
.pk-ust{display:flex;align-items:center;gap:8px;white-space:nowrap;min-width:0}
.pk-n{flex:none;width:11px;height:11px;border-radius:50%;box-shadow:0 0 0 2px #2d2a3e}
.pk-ust b{flex:none;font-size:16px;font-weight:700;color:#8a90a8;font-variant-numeric:tabular-nums}
.pk-ad{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:20px;font-weight:800;color:#1f3a78}
.pk-metin{display:block;margin:0 0 0 19px;font-size:17px;font-weight:600;color:#4b5b87;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pano-bos{margin:26px 4px 0;font-size:21px;font-weight:700;color:#8a90a8}
.pano-ayrinti{height:100%;display:flex;flex-direction:column;gap:3px;min-height:0}
.pa-ust{display:flex;align-items:center;gap:10px;min-width:0;font-size:15px;font-weight:700;color:#8a90a8;white-space:nowrap}
.pa-ust button{flex:none;padding:2px 11px!important;border-radius:13px;background:#eef1f8!important;box-shadow:inset 0 0 0 2px #2d2a3e;color:#2d2a3e!important;font-size:15px!important;font-weight:800!important}
.pa-ust span{overflow:hidden;text-overflow:ellipsis}
.pa-ad{font-size:21px;font-weight:800;color:#1f3a78;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pa-meta{font-size:15px;font-weight:700;color:#8a90a8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pa-metin{flex:1;min-height:0;margin:2px 0 0;overflow-y:auto;-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 12px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 12px),transparent);overscroll-behavior:contain;font-size:18px;font-weight:600;line-height:1.3;color:#2b3c6b;scrollbar-width:thin;scrollbar-color:#c3c9d8 transparent;-webkit-user-select:text;user-select:text}
.pa-git{flex:none;align-self:flex-start;margin-top:3px!important;padding:4px 13px!important;border-radius:14px;background:#2a2850!important;color:#ffd36b!important;font-size:16px!important;font-weight:800!important}
.pano-takvim{height:100%;display:flex;flex-direction:column}
.pt-ust{flex:none;display:flex;align-items:center;justify-content:space-between;height:26px;font-size:17px;font-weight:800;color:#1f3a78}
.pt-ust button{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#eef1f8!important;box-shadow:inset 0 0 0 2px #2d2a3e;font-size:18px!important;font-weight:800!important;color:#2d2a3e!important}
.pt-ust button:disabled{opacity:.3}
.pt-hafta,.pt-izgara{display:grid;grid-template-columns:repeat(7,1fr);text-align:center}
.pt-hafta{flex:none;margin:2px 0 1px;font-size:13px;font-weight:800;color:#8a90a8}
.pt-izgara{flex:1;min-height:0;grid-auto-rows:1fr;gap:1px}
.pt-g{position:relative;border-radius:7px;font-size:15px!important;font-weight:700!important;color:#1f3a78!important}
.pt-g:hover:not(:disabled){background:#eef1f8!important}
.pt-g.on{background:#2a2850!important;color:#ffd36b!important}
.pt-g.bugun{box-shadow:inset 0 0 0 2px #e0453f}
.pt-g.var::after{content:"";position:absolute;left:50%;bottom:1px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:#8f9cff}
.pt-g:disabled{color:#c9cdd8!important}
.pt-not{flex:none;margin-top:2px;font-size:12px;font-weight:700;color:#8a90a8;text-align:center}
</style></head>''')
i0 = script.index("  let tb = '';\n  const rows = (data.tahta || []).slice(0, 5);")
i1 = script.index("  $('tahta').innerHTML = tb;\n") + len("  $('tahta').innerHTML = tb;\n")
script = script[:i0] + "  panoCiz(data.pano);\n" + script[i1:]
script = rep(script, "tell({ type: 'ofis-ready' });", r'''// ------------------------------------------------------------------ AgentOffice: iş panosu
// The board is the office's work for one day, all its floors: each line's time, chat and
// short description as written when it happened. A line opens in full with the way to its
// chat; back, the day and the scroll are as they were. The window sends the chosen day's
// lines and is asked for another day; the calendar shows which days have lines.
let PANO = null, panoSec = null, panoAy = null, panoKaydir = 0, panoHtml = '';
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const HAFTA = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const TUR_RENK = { reply: '#8f9cff', permission: '#ff5468', question: '#ffb02e', error: '#ff5468', stopped: '#a3a6b8' };
const iki = n => String(n).padStart(2, '0');
const gunAnahtar = d => `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
const gunTarih = g => { const [y, m, d] = g.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const gunKaydir = (g, n) => { const d = gunTarih(g); d.setDate(d.getDate() + n); return gunAnahtar(d); };
function gunBaslik(g, bugun) {
  if (g === bugun) return 'BUGÜN';
  if (g === gunKaydir(bugun, -1)) return 'DÜN';
  const d = gunTarih(g);
  return `${d.getDate()} ${AYLAR[d.getMonth()].toLocaleUpperCase('tr-TR')}${d.getFullYear() !== gunTarih(bugun).getFullYear() ? ' ' + d.getFullYear() : ''}`;
}
function takvimHtml(p) {
  const [y, m] = panoAy, ilk = new Date(y, m, 1, 12), bas = (ilk.getDay() + 6) % 7, son = new Date(y, m + 1, 0, 12).getDate();
  const var_ = new Set(p.gunler), bugunAy = gunTarih(p.bugun), eskiAy = gunTarih(p.enEski);
  let hucre = '';
  for (let i = 0; i < bas; i++) hucre += '<span></span>';
  for (let d = 1; d <= son; d++) {
    const g = `${y}-${iki(m + 1)}-${iki(d)}`, kapali = g > p.bugun || g < p.enEski;
    hucre += `<button class="pt-g${g === p.gun ? ' on' : ''}${g === p.bugun ? ' bugun' : ''}${var_.has(g) ? ' var' : ''}" data-gun="${g}"${kapali ? ' disabled' : ''}>${d}</button>`;
  }
  const once = y > eskiAy.getFullYear() || (y === eskiAy.getFullYear() && m > eskiAy.getMonth()), sonra = y < bugunAy.getFullYear() || (y === bugunAy.getFullYear() && m < bugunAy.getMonth());
  return `<div class="pano-takvim"><div class="pt-ust"><button data-pano="ay-once" title="Önceki ay"${once ? '' : ' disabled'}>‹</button><span>${AYLAR[m]} ${y}</span><button data-pano="ay-sonra" title="Sonraki ay"${sonra ? '' : ' disabled'}>›</button></div><div class="pt-hafta">${HAFTA.map(h => `<span>${h}</span>`).join('')}</div><div class="pt-izgara">${hucre}</div><div class="pt-not">${esc(p.saklama)}</div></div>`;
}
function panoCiz(p) {
  if (!p) return;
  if (PANO && PANO.gun !== p.gun) { panoSec = null; panoKaydir = 0; }
  PANO = p;
  const kok = $('pano-kok'); if (!kok) return;
  const sec = panoSec && (p.kayitlar.find(k => k.id === panoSec.id) || panoSec);
  let govde;
  if (panoAy) govde = takvimHtml(p);
  else if (sec) govde = `<div class="pano-ayrinti"><div class="pa-ust"><button data-pano="geri">‹ Geri</button><span>${esc(sec.tarih)} · ${esc(sec.saat)}</span></div><b class="pa-ad">${esc(sec.tam)}</b><div class="pa-meta">${esc(sec.etiket)} · ${esc(sec.ofis)} · ${esc(sec.kaynak)}</div><p class="pa-metin">${esc(sec.metin || sec.etiket)}</p>${sec.git ? `<button class="pa-git" data-pano="kaynak">${esc(sec.git)} →</button>` : ''}</div>`;
  else govde = `<div class="pano-liste">${p.kayitlar.length ? p.kayitlar.map(k => `<button class="pk" data-pk="${esc(k.id)}" title="${esc(k.tam)}"><span class="pk-ust"><i class="pk-n" style="background:${TUR_RENK[k.tur] || '#8f9cff'}"></i><b>${esc(k.saat)}</b><span class="pk-ad">${esc(k.ad)}</span></span><span class="pk-metin">${esc(k.metin || k.etiket)}</span></button>`).join('') : `<p class="pano-bos">${esc(p.bos)}</p>`}</div>`;
  const bugun = p.gun === p.bugun;
  const html = `<div class="pano-bas"><button class="pano-baslik" data-pano="takvim" title="Takvimi aç"><span>${esc(gunBaslik(p.gun, p.bugun))}<small>${esc(p.alt)}</small></span><svg viewBox="0 0 150 9" preserveAspectRatio="none"><path d="M2,4 Q60,10 148,3" stroke="#e0453f" stroke-width="4" fill="none" stroke-linecap="round"/></svg></button><span class="pano-nav"><button data-pano="once" title="Önceki gün"${p.gun <= p.enEski ? ' disabled' : ''}>‹</button><button data-pano="sonra" title="Sonraki gün"${bugun ? ' disabled' : ''}>›</button>${bugun ? '' : '<button class="pano-bugun" data-pano="bugun">Bugün</button>'}</span></div><div class="pano-govde">${govde}</div>`;
  if (html === panoHtml) return;
  panoHtml = html; kok.innerHTML = html;
  const liste = kok.querySelector('.pano-liste');
  if (liste) { liste.scrollTop = panoKaydir; liste.addEventListener('scroll', () => { panoKaydir = liste.scrollTop; }, { passive: true }); }
}
function gunIste(g) { panoSec = null; panoAy = null; panoKaydir = 0; panoHtml = ''; tell({ type: 'ofis-pano-gun', gun: g === PANO.bugun ? null : g }); }
// The board's clicks stay on the board (a click on it chooses nobody in the office).
$('pano-kok').addEventListener('click', e => {
  e.stopPropagation();
  const b = e.target.closest('button'); if (!b || b.disabled || !PANO) return;
  const a = b.dataset.pano;
  if (b.dataset.pk) { panoSec = PANO.kayitlar.find(k => k.id === b.dataset.pk) || null; panoHtml = ''; panoCiz(PANO); }
  else if (b.dataset.gun) gunIste(b.dataset.gun);
  else if (a === 'geri') { panoSec = null; panoHtml = ''; panoCiz(PANO); }
  else if (a === 'kaynak' && panoSec) tell({ type: 'ofis-pano-kaynak', oturum: panoSec.oturum });
  else if (a === 'takvim') { const d = gunTarih(PANO.gun); panoAy = panoAy ? null : [d.getFullYear(), d.getMonth()]; panoHtml = ''; panoCiz(PANO); }
  else if (a === 'ay-once' || a === 'ay-sonra') { const d = new Date(panoAy[0], panoAy[1] + (a === 'ay-once' ? -1 : 1), 1); panoAy = [d.getFullYear(), d.getMonth()]; panoHtml = ''; panoCiz(PANO); }
  else if (a === 'once') gunIste(gunKaydir(PANO.gun, -1));
  else if (a === 'sonra') gunIste(gunKaydir(PANO.gun, 1));
  else if (a === 'bugun') gunIste(PANO.bugun);
});
window.addEventListener('keydown', e => { if (e.key === 'Escape' && PANO && (panoSec || panoAy)) { panoSec = null; panoAy = null; panoHtml = ''; panoCiz(PANO); } });
tell({ type: 'ofis-ready' });''')

# ---------------------------------------------------------------- dil
# The window's language. Each frame brings the office's words in it (`dil.soz`, the `ofis.*`
# messages of the app's catalog) and its locale (`dil.locale`); until then the drawing's own
# Turkish words stand. Months, weekdays, today and yesterday, durations and percentages come from
# Intl in that locale, never from word lists.
script = '''// The window's language (design/ofis_aktar.py): the office's words and the locale for dates and numbers.
let SOZ = {}, DIL = 'tr-TR', AYLAR = [], HAFTA = [];
const T = (k, tr) => SOZ[k] || tr;
const buyuk = s => String(s).toLocaleUpperCase(DIL);
const yuzde = v => new Intl.NumberFormat(DIL, { style: 'percent', maximumFractionDigits: 0 }).format(Math.round(v) / 100);
const saatYaz = d => new Intl.DateTimeFormat(DIL, { hour: '2-digit', minute: '2-digit' }).format(d);
const birim = (n, unit) => new Intl.NumberFormat(DIL, { style: 'unit', unit, unitDisplay: 'narrow' }).format(n);
const sure = (gun, sa, dk, sn) => [gun ? birim(gun, 'day') : '', sa || gun ? birim(sa, 'hour') : '', birim(dk, 'minute'), sn < 60 ? birim(sn % 60, 'second') : ''].filter(Boolean).join(' ');
function takvimAdlari() {
  const ay = new Intl.DateTimeFormat(DIL, { month: 'long' }), gun = new Intl.DateTimeFormat(DIL, { weekday: 'short' });
  AYLAR = Array.from({ length: 12 }, (_, m) => ay.format(new Date(2026, m, 1, 12)));
  // Monday first, as the calendar's grid is laid out (5 January 2026 was a Monday).
  HAFTA = Array.from({ length: 7 }, (_, i) => gun.format(new Date(2026, 0, 5 + i, 12)));
}
takvimAdlari();
function dil(d) {
  if (!d) return;
  SOZ = d.soz || {};
  if (d.locale === DIL) return;
  // This runs outside the office's own scopes (its $ helper and board cache are theirs): the board
  // draws again by itself, its text being in the new language.
  DIL = d.locale; takvimAdlari();
  document.documentElement.lang = DIL; document.title = T('ofis.title', 'Ajan Ofisi');
  const k = document.getElementById('kahve-yazi'); if (k) k.textContent = buyuk(T('ofis.coffee', 'Kahve'));
  const b = document.getElementById('baglanti-yazi'); if (b) b.textContent = T('ofis.connecting', 'bağlantı bekleniyor…');
}
''' + script
script = rep(script, "if (e.data.type === 'ofis') { managerDesk(", "if (e.data.type === 'ofis') { dil(e.data.data.dil); managerDesk(")
script = rep(script, '${yon ? "Yönetici&#39;ye yaz" : \'\'}', "${yon ? esc(T('ofis.write_to_manager', \"Yönetici'ye yaz\")) : ''}")
for state, word, key in [('calisiyor', 'Çalışıyor', 'working'), ('bekliyor', 'Seni bekliyor', 'waiting'), ('bosta', 'Boşta', 'idle'), ('belirsiz', 'Bilinmiyor', 'unknown'), ('gecmis', 'Geçmiş', 'past'), ('toplam', 'Sohbet', 'chats')]:
    script = rep(script, f"['{state}', '{word}', ", f"['{state}', T('ofis.hud_{key}', '{word}'), ")
script = rep(script, 'letter-spacing="2">LIMIT</text>', 'letter-spacing="2">${esc(buyuk(T(\'ofis.limit\', \'Limit\')))}</text>')
script = rep(script, "sf = bitti ? 'yenilendi, yeni ölçüm bekleniyor' : 'sıfırlanma: ' + (gun ? gun + ' gün ' : '') + (sa || gun ? sa + ' sa ' : '') + dk + ' dk' + (sn < 60 ? ' ' + (sn % 60) + ' sn' : '');",
             "sf = bitti ? T('ofis.limit_renewed', 'yenilendi, yeni ölçüm bekleniyor') : T('ofis.limit_resets_in', 'sıfırlanma: {sure}').replace('{sure}', sure(gun, sa, dk, sn));")
script = rep(script, "${bitti ? '' : '%' + Math.round(yz)}", "${bitti ? '' : yuzde(yz)}")
script = rep(script, "alt = 'son güncelleme: ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');",
             "alt = T('ofis.limit_updated', 'son güncelleme: {saat}').replace('{saat}', saatYaz(d));")
script = rep(script, "alt += ' (eski)';", "alt += ' ' + T('ofis.limit_stale', '(eski)');")
script = rep(script, "const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];\nconst HAFTA = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];\n", '')
script = rep(script, "  if (g === bugun) return 'BUGÜN';\n  if (g === gunKaydir(bugun, -1)) return 'DÜN';",
             "  const rel = new Intl.RelativeTimeFormat(DIL, { numeric: 'auto' });\n  if (g === bugun) return buyuk(rel.format(0, 'day'));\n  if (g === gunKaydir(bugun, -1)) return buyuk(rel.format(-1, 'day'));")
script = rep(script, "return `${d.getDate()} ${AYLAR[d.getMonth()].toLocaleUpperCase('tr-TR')}${d.getFullYear() !== gunTarih(bugun).getFullYear() ? ' ' + d.getFullYear() : ''}`;",
             "return buyuk(new Intl.DateTimeFormat(DIL, d.getFullYear() !== gunTarih(bugun).getFullYear() ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' }).format(d));")
script = rep(script, '<span>${AYLAR[m]} ${y}</span>', "<span>${esc(new Intl.DateTimeFormat(DIL, { month: 'long', year: 'numeric' }).format(ilk))}</span>")
for word, key in [('Önceki ay', 'prev_month'), ('Sonraki ay', 'next_month'), ('Takvimi aç', 'open_calendar'), ('Önceki gün', 'prev_day'), ('Sonraki gün', 'next_day')]:
    script = rep(script, f'title="{word}"', f"title=\"${{esc(T('ofis.{key}', '{word}'))}}\"")
script = rep(script, '>‹ Geri<', ">‹ ${esc(T('ofis.back', 'Geri'))}<")
# A balloon's lines: Japanese, Chinese and Korean letters are about twice as wide, and text without
# spaces (Japanese, Chinese) breaks anywhere, not only between words.
script = rep(script, "function wrapText(t, n) {\n  if (t.length <= n) return [t];",
             "function wrapText(t, n) {\n  if (/[\\u1100-\\u11ff\\u3000-\\u9fff\\uac00-\\ud7af\\uff00-\\uffef]/.test(t)) {\n    n = Math.max(4, Math.floor(n / 2));\n    if (!/\\s/.test(t)) return t.length <= n ? [t] : [t.slice(0, n), t.length > 2 * n ? t.slice(n, 2 * n - 1) + '…' : t.slice(n)];\n  }\n  if (t.length <= n) return [t];")
script = rep(script, "'<button class=\"pano-bugun\" data-pano=\"bugun\">Bugün</button>'", "`<button class=\"pano-bugun\" data-pano=\"bugun\">${esc(T('ofis.today', 'Bugün'))}</button>`")
page = rep(page, '>KAHVE</text>', ' id="kahve-yazi">KAHVE</text>')
page = rep(page, 'text-anchor="middle">bağlantı b', 'text-anchor="middle" id="baglanti-yazi">bağlantı b')
# ---------------------------------------------------------------- canlılık (ofis_canlilik.js)
# A wave on a click, the manager's visit to someone who waits, the window's day, night and weather,
# a dimmer room after sunset. The visit is a walk like any other: to the waiting desk's aisle,
# a moment there, back to the seat; a data update does not cut it short.
script = rep(script, "$('sahne').addEventListener('click', e => {\n  const hit = hitOf(e.target);",
             "$('sahne').addEventListener('click', e => {\n  const hit = hitOf(e.target);\n  if (hit && hit.part === 'govde') tepki(hit.ch);")
script = rep(script, "  if (tg.type === 'spot') return [[SPOTS[tg.spot].x, SPOTS[tg.spot].y]];",
             "  if (tg.type === 'spot') return [[SPOTS[tg.spot].x, SPOTS[tg.spot].y]];\n  if (tg.type === 'visit') { const v = DESKS[tg.desk]; if (v.row === 1) return [[v.x + 74, STRIP], [v.x + 74, EXIT_B]]; const vl = nearestLane(v.x); return [[vl, STRIP], [vl, AISLE], [v.x + 74, AISLE]]; }")
script = rep(script, "function arrive(ch) {\n  const tg = ch.target;",
             "function arrive(ch) {\n  const tg = ch.target;\n  if (tg.type === 'visit') { ch.loc = 'visit'; setCoffeePose(ch, false); ch.visitUntil = performance.now() + 3500; return; }")
script = rep(script, "function decide(ch, fresh, arrival) {\n",
             "function decide(ch, fresh, arrival) {\n  if (!fresh && ch.target && ch.target.type === 'visit') return; // a visit ends by itself\n")
script = rep(script, "  for (const ch of all) {\n    if (ch.loc === 'walk' && ch.fig) {",
             "  for (const ch of all) {\n    if (ch.loc === 'visit' && performance.now() > ch.visitUntil) { const tg = wantOf(ch) === 'coffee' ? { type: 'spot', spot: ch.spot } : { type: 'seat', desk: ch.desk }; startWalk(ch, tg); }\n    if (ch.loc === 'walk' && ch.fig) {")
script = rep(script, "  envelopes(data);\n  firstLoad = false;", "  envelopes(data);\n  if (!firstLoad) ziyaret();\n  firstLoad = false;")
# Inside the scene's own scope (its people, desks and walks), before it starts.
script = rep(script, '\nclock();\npoll();\nsetInterval(poll, 1000);', open(os.path.join(HERE, 'ofis_canlilik.js'), encoding='utf8').read() + '\nclock();\npoll();\nsetInterval(poll, 1000);')
# ---------------------------------------------------------------- yönetici masası ve ayrılanlar
# The manager's desk is the head of the room: wider, a taller dark chair, its two screens further apart
# and a gold name plate with a star. The manager never leaves it for coffee (a visit to someone who
# waits is a walk there and back). Its neighbours in the row (2 and 4) are the team's last desks
# (projection.ts MANAGER_DESK_ORDER); while empty they are not drawn, so the big desk stands alone.
page = rep(page, '<g class="mgr"><ellipse cx="0" cy="92" rx="194.0" ry="14" fill="#5a3a22" opacity=".22"/></g>',
           '<g class="mgr"><ellipse cx="0" cy="92" rx="226.0" ry="15" fill="#5a3a22" opacity=".24"/></g>')
page = rep(page, '<rect class="mgr" x="-52" y="-84" width="104" height="100" rx="28" fill="#2c2f4a" stroke="#2d2a3e" stroke-width="3"/>',
           '<g class="mgr"><rect x="-58" y="-112" width="116" height="128" rx="30" fill="#2c2f4a" stroke="#2d2a3e" stroke-width="3"/><rect x="-40" y="-102" width="80" height="22" rx="11" fill="#3b3f63"/></g>')
page = rep(page, '<g class="mgr">' + wide + '</g>', '<g class="mgr" transform="scale(1.17,1)">' + wide + '</g>')
page = rep(page, '<use id="mu3b" href="#mk_off" transform="translate(122,-76)"/>', '<use id="mu3b" href="#mk_off" transform="translate(138,-76)"/>')
script = rep(script, "$('mu3a').setAttribute('transform', on ? 'translate(-122,-76)' : 'translate(100,-76)');",
             "$('mu3a').setAttribute('transform', on ? 'translate(-138,-76)' : 'translate(100,-76)');\n  DESKS[2].sig = null; DESKS[4].sig = null; renderAllDesks();")
page = rep(page, '<g id="mw3a"><use id="mu3a" href="#mk_off" transform="translate(-122,-76)"/></g>', '<g id="mw3a"><use id="mu3a" href="#mk_off" transform="translate(-138,-76)"/></g>')
script = rep(script, "function wantOf(ch) { return ch.ds === 'bosta' ? 'coffee' : 'seat'; }",
             "function wantOf(ch) { return ch.ds === 'bosta' && !(DESKS[ch.desk] && DESKS[ch.desk].mgr) ? 'coffee' : 'seat'; }")
script = rep(script, "function plateMarkup(name, ds, row) {\n  const oy = 0;\n  let size = 20, tw = measure(name, size, 700);\n  if (tw > 150) { size = Math.max(12, 20 * 150 / tw); tw = measure(name, size, 700); }\n  const w = tw + 36;",
             "function plateMarkup(name, ds, row, mgr) {\n  if (mgr) return mgrPlate(name, ds);\n  const oy = 0;\n  let size = 20, tw = measure(name, size, 700);\n  if (tw > 150) { size = Math.max(12, 20 * 150 / tw); tw = measure(name, size, 700); }\n  const w = tw + 36;")
script = rep(script, "function renderDesk(i) {", r"""// The manager's plate: gold, the state's dot on the left and a star on the right.
function mgrPlate(name, ds) {
  let size = 20, tw = measure(name, size, 700);
  if (tw > 170) { size = Math.max(12, 20 * 170 / tw); tw = measure(name, size, 700); }
  const w = tw + 62;
  return `<g filter="url(#sh1)"><title>${esc(T('office.manager', 'Yönetici'))}</title><rect x="${-w / 2}" y="32" width="${w}" height="34" rx="17" fill="#ffd66b" stroke="${OL}" stroke-width="2.8"/>` +
    `<rect x="${-w / 2 + 6}" y="36" width="${w - 12}" height="7" rx="3.5" fill="#fff" opacity=".45"/>` +
    `<circle cx="${-w / 2 + 17}" cy="49" r="6.5" fill="${COL[ds] || '#aaa'}" stroke="${OL}" stroke-width="1.8"/>` +
    `<path transform="translate(${w / 2 - 18},49)" d="M0,-9 L2.6,-2.8 L9.2,-2.8 L3.9,1.2 L5.9,7.6 L0,3.8 L-5.9,7.6 L-3.9,1.2 L-9.2,-2.8 L-2.6,-2.8 Z" fill="#fff" stroke="${OL}" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<text x="-2" y="${49 + size * 0.34}" font-size="${size.toFixed(1)}" font-weight="800" fill="${OL}" text-anchor="middle">${esc(name)}</text></g>`;
}
function renderDesk(i) {
  // Beside the manager: an empty desk is not drawn, so the big desk stands alone.
  if (i === 2 || i === 4) { const dg = $('d' + i); if (dg) dg.style.display = DESKS[3].mgr && !deskOwner[i] ? 'none' : ''; }""")
script = rep(script, "pl.innerHTML = ch ? plateMarkup(gorunenAd(ch), ch.nokta || ch.ds, d.row) : '';", "pl.innerHTML = ch ? plateMarkup(gorunenAd(ch), ch.nokta || ch.ds, d.row, d.mgr) : '';")
# Someone who leaves the office (their work done, or nothing known of them any more) stands up and
# walks out by the way newcomers come in; their desk is free at once. Only while the office is shown
# and after its first picture: a hidden office opens as it is now.
script = rep(script, """      const ch = C[id];
      dropFig(ch); ch.ui.remove(); ch.tag.remove();
      if (deskOwner[ch.desk] === ch) { deskOwner[ch.desk] = null; DESKS[ch.desk].sig = null; }
      delete C[id];""", """      const ch = C[id];
      if (deskOwner[ch.desk] === ch) { deskOwner[ch.desk] = null; DESKS[ch.desk].sig = null; }
      delete C[id];
      if (!firstLoad && !paused && !document.hidden) leave(ch); else { dropFig(ch); ch.ui.remove(); ch.tag.remove(); }""")
script = rep(script, "function wantOf(ch) {", r"""const GIDEN = [];
function leave(ch) {
  ch.gone = true; ch.balon = ''; ch.uzun = '';
  if (ch.loc === 'seat') { const e = seatExit(ch.desk); ch.x = e.x; ch.y = e.y; }
  GIDEN.push(ch);
  startWalk(ch, { type: 'out' });
}
function gone(ch) { dropFig(ch); ch.ui.remove(); ch.tag.remove(); const i = GIDEN.indexOf(ch); if (i >= 0) GIDEN.splice(i, 1); }
function wantOf(ch) {""")
script = rep(script, "  if (tg.type === 'spot') return [[SPOTS[tg.spot].x, SPOTS[tg.spot].y]];\n  if (tg.type === 'visit')",
             "  if (tg.type === 'spot') return [[SPOTS[tg.spot].x, SPOTS[tg.spot].y]];\n  if (tg.type === 'out') return [[SPAWN.x, SPAWN.y]];\n  if (tg.type === 'visit')")
script = rep(script, "function arrive(ch) {\n  const tg = ch.target;", "function arrive(ch) {\n  const tg = ch.target;\n  if (tg.type === 'out') { gone(ch); return; }")
script = rep(script, "  const all = Object.values(C);\n", "  const all = Object.values(C).concat(GIDEN);\n")
script = rep(script, "function settle() {\n", "function settle() {\n  for (const ch of [...GIDEN]) gone(ch);\n")
# A balloon's last line is cut at a word, never inside one, and never ends on a colon or comma.
script = rep(script, "  if (lines[1] && lines[1].length > n + 4) lines[1] = lines[1].slice(0, n + 3) + '…';\n  if (lines[0].length > n + 6) { lines[0] = lines[0].slice(0, n + 5) + '…'; }",
             "  const cut = (s, m) => { let c = s.slice(0, m); const sp = c.lastIndexOf(' '); if (sp > m / 2) c = c.slice(0, sp); return c.replace(/[\\s:;,.–—-]+$/, '') + '…'; };\n  if (lines[1] && lines[1].length > n + 4) lines[1] = cut(lines[1], n + 3);\n  if (lines[0].length > n + 6) lines[0] = cut(lines[0], n + 5);")
# ---------------------------------------------------------------- balon ve etiket çakışması
# Every frame, after the balloons and labels are placed: a balloon never covers a desk's name plate
# or another balloon (the one who waits for the user, then the seated, then walkers, then the coffee
# corner keep theirs; the other is hidden until there is room), and labels of people standing close
# together do not overlap (the hidden one's name is still on the figure's hover).
script = rep(script, "if (vis && text) { const b = balloonMarkup(text); ch.bal.innerHTML = b.m; ch.bw = b.w; }", "if (vis && text) { const b = balloonMarkup(text); ch.bal.innerHTML = b.m; ch.bw = b.w; ch.bh = b.h; }")
script = rep(script, "    ch.ui.setAttribute('transform', `translate(${ax.toFixed(1)},${a.y.toFixed(1)})`);", "    ch.ui.setAttribute('transform', `translate(${ax.toFixed(1)},${a.y.toFixed(1)})`); ch.bx = ax; ch.by = a.y;")
script = rep(script, "    const showTag = away;\n", "    const showTag = away;\n    ch.tbox = null;\n")
script = rep(script, "      ch.tag.setAttribute('transform', `translate(${tx.toFixed(1)},${(ch.y + 6).toFixed(1)})`);", "      ch.tag.setAttribute('transform', `translate(${tx.toFixed(1)},${(ch.y + 6).toFixed(1)})`); ch.tbox = { x0: tx - tw / 2, x1: tx + tw / 2, y0: ch.y + 6, y1: ch.y + 32 };")
script = rep(script, "pl.innerHTML = ch ? plateMarkup(gorunenAd(ch), ch.nokta || ch.ds, d.row, d.mgr) : '';",
             "pl.innerHTML = ch ? plateMarkup(gorunenAd(ch), ch.nokta || ch.ds, d.row, d.mgr) : '';\n  d.pw = ch ? (d.mgr ? Math.min(measure(gorunenAd(ch), 20, 700), 170) + 62 : Math.min(measure(gorunenAd(ch), 20, 700), 150) + 36) : 0;")
script = rep(script, "function updateUI(all) {", r"""function updateUI(all) { placeUI(all); declutter(all); }
const ustUste = (a, b) => a.x0 < b.x1 + 6 && b.x0 < a.x1 + 6 && a.y0 < b.y1 + 4 && b.y0 < a.y1 + 4;
const oncelik = c => c.ds === 'bekliyor' ? 0 : c.loc === 'seat' ? 1 : c.loc === 'walk' || c.loc === 'visit' ? 2 : 3;
function declutter(all) {
  const plates = [];
  for (let i = 0; i < DESKS.length; i++) {
    const d = DESKS[i], dg = $('d' + i);
    if (!deskOwner[i] || !d.pw || (dg && dg.style.display === 'none')) continue;
    const hw = d.pw * 0.78 / 2; plates.push({ x0: d.x - hw, x1: d.x + hw, y0: d.y + 32 * 0.78, y1: d.y + 66 * 0.78 });
  }
  const order = all.filter(c => !c.gone).sort((a, b) => oncelik(a) - oncelik(b) || (a.desk ?? 99) - (b.desk ?? 99));
  const balloons = [];
  for (const c of order) {
    if (!c.bw) { c.bal.style.display = ''; continue; }
    const box = { x0: c.bx - c.bw / 2, x1: c.bx + c.bw / 2, y0: c.by - c.bh, y1: c.by };
    const clash = plates.some(p => ustUste(box, p)) || balloons.some(b => ustUste(box, b));
    c.bal.style.display = clash ? 'none' : '';
    if (!clash) balloons.push(box);
  }
  const tags = [];
  for (const c of order) {
    if (!c.tbox) { c.tag.style.display = ''; continue; }
    const clash = tags.some(t => ustUste(c.tbox, t));
    c.tag.style.display = clash ? 'none' : '';
    if (!clash) tags.push(c.tbox);
  }
}
function placeUI(all) {""")
# ---------------------------------------------------------------- yöneticiyi seçmek
# The big desk is where the manager is chosen: a click on it (or its gold plate; the manager's own
# figure still opens their chat) opens the window's manager picker beside it, and anyone dragged onto
# it becomes the manager (the window saves it). While dragging, a small figure with the hint follows
# the pointer and the big desk glows when the drop would land on it.
script = rep(script, "<title>${esc(T('office.manager', 'Yönetici'))}</title>", "<title>${esc(T('office.manager', 'Yönetici'))} · ${esc(T('ofis.change_manager', 'Yöneticiyi değiştirmek için tıkla'))}</title>")
script = rep(script, "$('sahne').addEventListener('click', e => {\n  const hit = hitOf(e.target);",
             r"""let surukle = null, tiklamaYok = false;
const masaKutusu = () => { const r = $('d3').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
const masaUstunde = e => { const r = $('d3').getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
function surukleneni(t) {
  for (const ch of Object.values(C)) if (ch.fig && ch.fig.contains(t)) return ch;
  for (let i = 0; i < DESKS.length; i++) { const o = deskOwner[i]; if (o && o.loc === 'seat' && ($('b' + i).contains(t) || $('a' + i).contains(t))) return o; }
  return null;
}
function surukleBitir(e, birak) {
  const s = surukle; surukle = null;
  if (!s || !s.on) return;
  s.g.remove(); $('d3').style.filter = ''; markChosen();
  tiklamaYok = true; setTimeout(() => { tiklamaYok = false; }, 400);
  const yon = DESKS[3].mgr && deskOwner[3] === s.ch;
  if (birak && !yon && masaUstunde(e)) tell({ type: 'ofis-yonetici', id: s.ch.id });
}
$('sahne').addEventListener('pointerdown', e => { if (e.button !== 0) return; const ch = surukleneni(e.target); if (ch) surukle = { ch, x: e.clientX, y: e.clientY, on: false, g: null }; });
window.addEventListener('pointermove', e => {
  if (!surukle) return;
  if (!surukle.on) {
    if (Math.hypot(e.clientX - surukle.x, e.clientY - surukle.y) < 8) return;
    surukle.on = true;
    const g = surukle.g = document.createElementNS(SVGNS, 'g'); g.style.pointerEvents = 'none'; fxG.appendChild(g);
    const ad = gorunenAd(surukle.ch), ipucu = T('ofis.drop_to_make_manager', 'Yönetici yapmak için büyük masaya bırak');
    const w = Math.max(measure(ad, 16, 800), measure(ipucu, 13, 600)) + 30;
    g.innerHTML = `<g opacity=".92" transform="scale(${(figScale(surukle.ch.pre) * 0.85).toFixed(3)})">${figMarkup(surukle.ch.pre)}</g>` +
      `<g filter="url(#sh1)" transform="translate(0,18)"><rect x="${-w / 2}" y="0" width="${w}" height="46" rx="14" fill="#fff" stroke="${OL}" stroke-width="2.4"/>` +
      `<text y="19" font-size="16" font-weight="800" fill="${OL}" text-anchor="middle">${esc(ad)}</text><text y="37" font-size="13" font-weight="600" fill="#6b7190" text-anchor="middle">${esc(ipucu)}</text></g>`;
  }
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform($('sahne').getScreenCTM().inverse());
  surukle.g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
  $('d3').style.filter = masaUstunde(e) ? 'drop-shadow(0 0 12px #ffd66b) drop-shadow(0 0 4px #ff9f1a)' : '';
});
window.addEventListener('pointerup', e => surukleBitir(e, true));
window.addEventListener('pointercancel', e => surukleBitir(e, false));
$('sahne').addEventListener('click', e => {
  if (tiklamaYok) { tiklamaYok = false; return; }
  if (DESKS[3].mgr && $('d3').contains(e.target) && !$('b3').contains(e.target) && !$('a3').contains(e.target)) { tell({ type: 'ofis-yonetici-masa', rect: masaKutusu() }); return; }
  const hit = hitOf(e.target);""")
assert not re.search(r"(?<!', )'(Çalışıyor|Boşta|Geçmiş|Önceki ay|Bugün)'", script.split('// ------------------------------------------------------------------ demo')[0]), 'an office word left untranslated'

assert 'location.href' not in script.replace('location.reload', '')

os.makedirs(OUT, exist_ok=True)
header = '// Generated by design/ofis_aktar.py from the author\'s original office drawing\n// (design/ofis-referans, not part of this repository). Do not edit by hand.\n'
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8', newline='\n').write(page)
open(os.path.join(OUT, 'ofis.js'), 'w', encoding='utf8', newline='\n').write(header + script)
print('ok', len(page), len(script))
