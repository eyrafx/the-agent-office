// The storyboard: key frames drawn by the film itself (render.mjs --at), laid out with their timing,
// what each beat shows, its sound and whether it is real or a slot. Out: storyboard/index.html, one
// self-contained file (the frames are inside it), easy to pass along.
// Usage: node storyboard.mjs   (renders the frames first; needs `npm run serve`)
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const BEATS = [
  { n: 1, title: 'Ada (giriş)', range: [0, 7.5], at: [1.5, 3.5, 6.0], status: 'gerçek', what: 'Ekranın üst kenarı yakın planda; siyah ada büyük ve keskin. Şerit döner: saat ve çalışan ajan sayısı, pil, hava (İzmir), yine saat. "AgentOffice", "Ajanların, ekranın tepesinde.", "Kapalıyken de: saat, pil, hava."', sound: 'Müzik yalnız elektrikli piyanoyla, alçak başlar; ikinci ölçüde yumuşak bir pad.' },
  { n: 2, title: 'Açılış, sayfalar, müzik, cam', range: [7.5, 23.33], at: [9.5, 12.0, 15.0, 17.5, 19.5, 21.8], status: 'gerçek', what: 'İmleç gelir, ada açılır. Sayfalar kayar: notlar, alarmlar, su, odak. Çalan müzik, kapağı ve ilerleyişiyle. Tek bir an: açık ada renkli bir duvar kâğıdının üstünde buzlu cama döner, sonra siyaha.', sound: 'Müzik sayfasında alçak bas ve hafif nabız girer.' },
  { n: 3, title: 'Uygulamalar ve tarayıcı', range: [23.33, 31.67], at: [24.5, 26.5, 28.5, 30.5], status: 'gerçek (pencereler uydurma)', what: 'Koyu, markasız bir uygulama ekranı dolduruyor; siyah ada üstte. Tarayıcıya geçince ada gizlenir; imleç üst kenara gelince açılır.', sound: 'Müzik sürer.' },
  { n: 4, title: 'Her yerde', range: [31.67, 43.33], at: [33.0, 37.0, 40.5], status: 'gerçek + çizilmiş sürükleme', what: 'Tam ekran sunumda ince, nefes alan çizgi. Sistem işaretleri: ses, Caps Lock, klavye dili. Dosyalar rafa bırakılır, biri mesaja sürüklenir.', sound: 'Müzik sürer.' },
  { n: 5, title: 'Ajanlar ve ofis', range: [43.33, 54.17], at: [45.0, 47.5, 49.5, 51.5, 53.0], status: 'gerçek', what: 'Bir ajan soru sorar, ada gösterir. Ofiste yönetici yanında; geniş plandan karta kesme, yanıt gönderilir. Pencerede ilkbahar → yaz → sonbahar → kış.', sound: 'Müzik Em9 ve A9 ile eve döner.' },
  { n: 6, title: 'Bitiş kartı', range: [54.17, 60], at: [56.5, 58.0], status: 'gerçek', what: 'Ahtapot maskot, "AgentOffice", "Claude Code ve Codex ajanların için.", "Windows · macOS yakında", eyrafx.github.io/agentoffice.', sound: 'Tek uzun Re akoru, sessizliğe kadar söner.' },
];

const at = BEATS.flatMap(b => b.at);
rmSync('work/sb', { recursive: true, force: true });
execFileSync('node', ['render.mjs', 'tr', '--out', 'work/sb', '--at', at.join(',')], { stdio: 'inherit' });
rmSync('storyboard', { recursive: true, force: true }); mkdirSync('storyboard', { recursive: true });
const img = {};
for (const t of at) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', `work/sb/at-${t.toFixed(2)}.jpg`, '-vf', 'scale=960:-1:flags=lanczos', '-q:v', '4', `work/sb/small-${t.toFixed(2)}.jpg`]);
  img[t] = `data:image/jpeg;base64,${readFileSync(`work/sb/small-${t.toFixed(2)}.jpg`).toString('base64')}`;
}

const total = BEATS.at(-1).range[1];
const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\[(YER TUTUCU[^\]]*)\]/g, '<mark>$1</mark>');
const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgentOffice film storyboard</title>
<style>
:root{--bg:#0b0b0e;--card:#15161b;--ink:#f3f0ea;--ink2:#a7a39c;--amber:#ff9f45;--line:rgba(255,255,255,.09);--slot:#ffc400}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 'Segoe UI',system-ui,sans-serif}
header{padding:36px 40px 12px;max-width:1400px;margin:auto}h1{margin:0;font-size:30px;letter-spacing:-.02em}
header p{margin:6px 0 0;color:var(--ink2)}
.bar{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:20px 0 0;border:1px solid var(--line)}
.bar span{display:block;height:100%;border-right:1px solid #000}
.legend{display:flex;gap:18px;margin-top:8px;color:var(--ink2);font-size:13px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
main{max-width:1400px;margin:auto;padding:10px 40px 60px}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin-top:18px}
section h2{margin:0;font-size:20px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
section h2 .t{color:var(--amber);font-variant-numeric:tabular-nums;font-size:15px;font-weight:600}
.st{font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;background:rgba(80,200,120,.15);color:#7fe0a0}
.st.slot{background:rgba(255,196,0,.15);color:var(--slot)}
.desc{color:var(--ink);margin:10px 0 2px}.snd{color:var(--ink2);font-size:14px;margin:0 0 12px}
mark{background:rgba(255,196,0,.18);color:var(--slot);padding:0 4px;border-radius:4px}
.frames{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
figure{margin:0}figure img{width:100%;display:block;border-radius:8px;border:1px solid var(--line)}
figcaption{font-size:12px;color:var(--ink2);margin-top:4px;font-variant-numeric:tabular-nums}
@media (max-width:600px){header,main{padding-left:16px;padding-right:16px}}
</style></head><body>
<header><h1>AgentOffice · tanıtım filmi · storyboard</h1>
<p>${fmt(total)} · 1920×1080 · 30 fps · TR. Kareler filmin kendisinden çizildi (gerçek ada ve ofis katmanları, örnek veri).</p>
<div class="bar">${BEATS.map(b => `<span title="${b.n}. ${b.title}" style="width:${((b.range[1] - b.range[0]) / total * 100).toFixed(2)}%;background:${b.status === 'yer tutucu' ? 'var(--slot)' : b.status.includes('yer') ? 'linear-gradient(90deg,var(--amber) 70%,var(--slot) 70%)' : 'var(--amber)'}"></span>`).join('')}</div>
<div class="legend"><span><i style="background:var(--amber)"></i>gerçek</span><span><i style="background:var(--slot)"></i>yer tutucu</span></div>
</header><main>
${BEATS.map(b => `<section><h2>${b.n}. ${b.title} <span class="t">${fmt(b.range[0])} – ${fmt(b.range[1])} (${(b.range[1] - b.range[0]).toFixed(1)} sn)</span> <span class="st${b.status.includes('yer') ? ' slot' : ''}">${b.status}</span></h2>
<p class="desc">${esc(b.what)}</p><p class="snd">Ses: ${esc(b.sound)}</p>
<div class="frames">${b.at.map(t => `<figure><img src="${img[t]}" alt="${fmt(t)}" loading="lazy"><figcaption>${fmt(t)}</figcaption></figure>`).join('')}</div></section>`).join('\n')}
</main></body></html>`;
writeFileSync('storyboard/index.html', html);
console.log(`storyboard/index.html: ${BEATS.length} beats, ${at.length} frames, ${fmt(total)}`);
