# -*- coding: utf-8 -*-
"""Onaylı ahtapot görselinden (app/public/mascot/robot-sprite.png) göz kırpma ve
kol sallama için katmanlar üretir: app/public/mascot/layers/.

Gövde parçalanmaz. Yalnız iki şey ayrılır:
- gözlerin ışığı: camın üstüne eklenmiş turuncu ışık renk olarak çıkarılır, camın
  yansımaları ve dokusu yerinde kalır; doymuş beyaz çekirdek çevresinden boyanır.
  Göz katmanı toplamsal ışıktır (cam + ışık = görsel, piksel piksel);
- havadaki kolun ilk eklemden yukarısı: kesim koyu bilyenin içinden geçer, eklem
  gövdede kalıp ek yerini örter; kol dönünce açılan dar yer koyu eklemle dolu bir
  alt katmandan görünür.
Gözler açık ve kol yerindeyken katmanlar üst üste görselin kendisidir.

Katmanlar (alttan üste): under, arm, body, eyeL, eyeR (eyeL/eyeR toplamsal).
"""
import json, os
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'app', 'public', 'mascot', 'robot-sprite.png')
OUT = os.path.join(HERE, '..', 'app', 'public', 'mascot', 'layers')
WIDTHS = (192, 384, 768)

im = np.array(Image.open(SRC).convert('RGBA'))
H, W = im.shape[:2]
alpha = im[..., 3]
orig = im[..., :3].astype(np.float32)
r, g, b = orig[..., 0], orig[..., 1], orig[..., 2]
lum = 0.299 * r + 0.587 * g + 0.114 * b
yy, xx = np.mgrid[:H, :W]

# ---------------------------------------------------------------- eyes
# The two glowing arcs: bright, warm pixels on the visor around its middle.
core = ((lum > 150) & (r > 180) & (xx > 380) & (xx < 727) & (yy > 150) & (yy < 380)).astype(np.uint8)
n, labels, stats, centres = cv2.connectedComponentsWithStats(core, 8)
arcs = sorted(sorted(range(1, n), key=lambda i: -stats[i, cv2.CC_STAT_AREA])[:2], key=lambda i: stats[i, 0])
assert len(arcs) == 2 and all(stats[i, cv2.CC_STAT_AREA] > 1500 for i in arcs), 'two eye arcs expected'
core = np.isin(labels, arcs).astype(np.uint8)
boxes = [[int(v) for v in stats[i, :4]] for i in arcs]
dist = cv2.distanceTransform(1 - core, cv2.DIST_L2, 5)
# The glass around the eyes, short of the helmet rim and the visor's inner edge reflections.
zone = (dist < 58) & (xx < 727) & (xx > 380) & (yy > 150) & (yy < 380)
warm = r - b
ring = (dist >= 52) & (dist < 62) & (xx < 727) & (warm < 30) & (r < 80)
base_warm = float(np.median(warm[ring]))
glass = np.median(orig[ring], axis=0)
halo = zone & (dist > 8) & (dist < 30) & (r < 245)
# What the glow adds over the glass per unit of warmth (its colour).
colour = np.linalg.lstsq((warm[halo] - base_warm)[:, None], orig[halo] - glass, rcond=None)[0][0]
k = np.clip(warm - base_warm, 0, None) * zone * np.clip((58 - dist) / 8, 0, 1)
clean = np.clip(orig - k[..., None] * colour, 0, 255)
# The saturated core cannot be taken apart: repaint it from the cleaned glass around it.
core_zone = cv2.dilate(core, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
repaint = cv2.cvtColor(cv2.inpaint(cv2.cvtColor(clean.astype(np.uint8), cv2.COLOR_RGB2BGR), core_zone, 7, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB).astype(np.float32)
w = cv2.GaussianBlur(core_zone.astype(np.float32), (0, 0), 2.5)[..., None]
clean = repaint * w + clean * (1 - w)
# The glow's glitter leaves a faint dotted trace on the glass: smooth it where the glow was.
smooth = cv2.GaussianBlur(cv2.medianBlur(clean.astype(np.uint8), 5).astype(np.float32), (0, 0), 1.6)
w = (np.clip((48 - dist) / 10, 0, 1) * zone)[..., None]
clean = np.minimum(smooth * w + clean * (1 - w), orig)
light = orig - clean
mid = (boxes[0][0] + boxes[0][2] + boxes[1][0]) // 2
eye_l, eye_r = light.copy(), light.copy()
eye_l[:, mid:] = 0; eye_r[:, :mid] = 0

# ---------------------------------------------------------------- arm
PIVOT = (786, 448)
CUT = [(785, 405), (780, 422), (782, 447), (790, 470), (800, 490), (806, 500)]
region = np.zeros((H, W), np.uint8)
cv2.fillPoly(region, [np.array([(805, 330), (805, 150), (1065, 150), (1065, 497), (960, 499), (900, 500), (840, 500)] + CUT[::-1] + [(800, 385)], np.int32)], 1)
solid = alpha > 250
# The arm reaches 2 px past the cut, under the body's joint, so no seam shows at rest.
arm_mask = region | (cv2.dilate(region, np.ones((5, 5), np.uint8)) & solid)
cut = np.zeros((H, W), np.uint8); cv2.polylines(cut, [np.array(CUT, np.int32)], False, 1, 1)
band = (cv2.distanceTransform(1 - cut, cv2.DIST_L2, 5) < 14) & region.astype(bool) & solid
fill = cv2.cvtColor(cv2.inpaint(cv2.cvtColor(clean.astype(np.uint8), cv2.COLOR_RGB2BGR), band.astype(np.uint8), 6, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)

clean_u8 = clean.astype(np.uint8)
layers = {
    'under': np.dstack([np.where(band[..., None], fill, 0).astype(np.uint8), (band * 255).astype(np.uint8)]),
    'arm': np.dstack([clean_u8, (alpha * arm_mask).astype(np.uint8)]),
    'body': np.dstack([clean_u8, (alpha * (1 - region)).astype(np.uint8)]),
}

# ---------------------------------------------------------------- check and write
def over(dst, src):
    a = src[..., 3:4] / 255.0
    return src[..., :3] * a + dst * (1 - a)
rest = np.zeros((H, W, 3))
for name in ('under', 'arm', 'body'): rest = over(rest, layers[name].astype(np.float32))
rest = rest + light * (alpha[..., None] / 255.0)
reference = orig * (alpha[..., None] / 255.0)
assert np.abs(rest - reference).max() < 4, 'layers at rest must be the picture itself'

def resized(rgba_premultiplied, width):
    """Lanczos on premultiplied colour, so edges keep their colour."""
    h = round(H * width / W)
    return cv2.resize(rgba_premultiplied, (width, h), interpolation=cv2.INTER_LANCZOS4)

os.makedirs(OUT, exist_ok=True)
for name, rgba in list(layers.items()) + [('eyeL', None), ('eyeR', None)]:
    if rgba is None:  # additive light: premultiplied colour is the light itself
        lit = eye_l if name == 'eyeL' else eye_r
        pre = np.dstack([lit, lit.max(axis=2)])
    else:
        a = rgba[..., 3:4].astype(np.float32)
        pre = np.dstack([rgba[..., :3] * (a / 255.0), a])
    for width in WIDTHS:
        p = np.clip(resized(pre.astype(np.float32), width), 0, 255)
        a = p[..., 3:4]
        rgb = np.where(a > 0, p[..., :3] / np.maximum(a, 1e-3) * 255, 0)
        Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a]).astype(np.uint8)).save(os.path.join(OUT, f'{name}-{width}.png'), optimize=True)

pct = lambda x, y: [round(x / W * 100, 3), round(y / H * 100, 3)]
json.dump({
    'size': [W, H],
    # A blink closes each arc a little below its middle.
    'eyes': [pct(bx + bw / 2, by + bh * 0.58) for bx, by, bw, bh in boxes],
    'pivot': pct(*PIVOT),
}, open(os.path.join(OUT, 'layers.json'), 'w'), indent=1)
print('ok', W, H, boxes)
