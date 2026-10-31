# AgentOffice robot

Original procedural hard-surface model, authored for AgentOffice. No third-party models, textures, fonts, images, or network resources are embedded.

- Editable source: `src/mascot/model.ts`.
- Motion source: `src/mascot/motion.ts` (seven state poses, damped joint transitions, head/eye tracking).
- GLB: not kept in the repository (the app does not load it); from `app`, run `node scripts/export-mascot.mjs` to write `public/mascot/agentoffice-robot.glb`.
- Browser export: import `downloadMascotGLB` from `src/mascot/export.ts`, or use the local development studio at `/src/mascot/preview.html`.
- GLB contains named rigid part hierarchies, eight three-joint arms, independent head and eye groups, and PBR materials. Runtime procedural motion is authored in TypeScript; the static neutral GLB does not contain baked animation clips.

The model interprets the approved orange robot concept with a segmented dome, convex visor, mechanical link armor, exposed graphite ball joints, machined bearings, and end pads. It does not reuse another mascot's geometry or artwork. The finer sculptural curves of the concept are simplified into editable revolved armor panels; lighting, shadows, and glows vary by host renderer.

## robot-sprite.png

Ürün maskotu. `assets/concepts/robot-octopus-reference-v1.png` (kullanıcının onayladığı
görsel) arka planından ayrılarak üretildi. `robot-192/384/768.png` bu görselin Lanczos ile
küçültülmüş kopyalarıdır. Durumlar yalnız çevresindeki ışıkla ayrışır.

## layers/

Göz kırpma ve kol sallama (kullanıcı onayı, 24 Ekim 2026): `design/maskot_katmanlari.py`
bu görselden beş katman üretir (her biri 192/384/768 genişlikte): `under`, `arm`, `body`,
`eyeL`, `eyeR`. Gövde parçalanmaz. Gözlerin ışığı camdan renk olarak ayrılır (toplamsal
katman; cam yansımaları yerinde kalır), havadaki kolun ilk eklemden yukarısı eklemin içinden
kesilip eklem çevresinde döner. Gözler açık ve kol yerindeyken katmanlar görselin kendisidir
(betik bunu denetler). `src/mascot/still.ts` kırpmayı ve sallamayı yürütür; dönme
noktaları `src/mascot/sprite.css` içinde (`layers.json` ile aynı).
## ada/ (ürün maskotu, 31 Ekim 2026)

Ada, turuncu robot ahtapot. Klipler yerel video modeliyle üretilip 4x-AnimeSharp ile temizlendi
(idle, hop, giggle, bakış kareleri, wave, plead, shy).
Saydam animasyonlu WebP (16 fps) ve PNG duruşlar, 256 ve 512 px; hepsi aynı 640×640 kaynak
çerçevesinin küçültmesi ve aynı taban pozla başlayıp biter, bu yüzden dosyalar sıçramadan değişir.
`src/mascot/still.ts` durumlara göre yalnız dosya değiştirir; kodda hareket veya çizim yoktur.
1,5× ve üstü ekranlarda 512 px kullanılır. Eski `chibi/` (29 Ekim) kaldırıldı; `layers/` tanıtım filmi için duruyor.
