"""Chibi maskot: tek sabit gövde (01-neutral) + yalnız vizör içi yüz katmanları.

Kaynak: ChatGPT ile kullanıcının ürettiği sekiz ifade karesi (1024², saydam),
varsayılan `../AgentOffice-site/output/chibi-expression-set-v1/`.
Gövde hiç bölünmez; her ifade nötre hizalanır (ECC afin, yalnız kask kabuğu ve
vizör kenarı üzerinden), vizörün içindeki ışıklı yüz yumuşak bir maskeyle alınır.
Nötrün kendi yüzü vizörden silinir (temiz levha), böylece yüzler birbirinin altında
hayalet bırakmaz. Çıktı: app/public/mascot/chibi/govde-W.webp ve yuz-<ad>-W.webp.

  python design/maskot_chibi.py [kaynak_klasoru]
"""
import os, sys
import cv2, numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', 'AgentOffice-site', 'output', 'chibi-expression-set-v1')
OUT = os.path.join(ROOT, 'app', 'public', 'mascot', 'chibi')
FACES = {'neutral': '01-neutral', 'happy': '02-happy', 'waiting': '04-waiting', 'sleepy': '05-sleepy',
         'surprised': '06-surprised', 'focused': '07-focused', 'blink': '08-blink'}
BOX = (108, 124, 940, 902)   # gövdenin sınırı + pay (832x778)
WIDTHS = (128,)              # açık adadaki en büyük gösterimin (~56 px) 2 katından büyük
ell = lambda d: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d))

def load(name): return np.array(Image.open(os.path.join(SRC, name + '.png')).convert('RGBA'))

def fill_holes(m):
    ff = m.copy(); h, w = m.shape; cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    return (m | (ff == 0)).astype(np.uint8)

def visor_mask(im):
    """Koyu vizör camı: merkezdeki koyu bileşen, ışıklı yüz delikleri doldurulmuş, boyuna giden ince bağ kesilmiş."""
    hsv = cv2.cvtColor(im[..., :3], cv2.COLOR_RGB2HSV)
    dark = ((hsv[..., 2] < 70) & (im[..., 3] > 200)).astype(np.uint8)
    _, lab = cv2.connectedComponents(dark); m = (lab == lab[330, 560]).astype(np.uint8)
    m = fill_holes(cv2.morphologyEx(fill_holes(m), cv2.MORPH_CLOSE, ell(25)))
    o = cv2.morphologyEx(m, cv2.MORPH_OPEN, ell(41))
    _, lab = cv2.connectedComponents(o); o = (lab == lab[380, 560]).astype(np.uint8)
    return cv2.dilate(o, ell(9)) & m

def glow(im, rb=45, v=70):
    hsv = cv2.cvtColor(im[..., :3], cv2.COLOR_RGB2HSV)
    return (((im[..., 0].astype(int) - im[..., 2].astype(int)) > rb) & (hsv[..., 2] > v)).astype(np.uint8)

def gray(im): return cv2.cvtColor(im[..., :3], cv2.COLOR_RGB2GRAY).astype(np.float32) / 255 * (im[..., 3] / 255.0)

N = load(FACES['neutral']); Nm = visor_mask(N)
head = np.zeros(Nm.shape, np.uint8); head[150:600, 250:860] = 1
shell = (head & (1 - cv2.erode(Nm, ell(31)))).astype(np.uint8)   # hizalama yalnız kabuk ve vizör kenarından

def register(E):
    warp = np.eye(2, 3, dtype=np.float32); crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-7)
    a0, b0 = gray(N), gray(E)
    for s in (.25, .5, 1.0):
        a, b = cv2.resize(a0, None, fx=s, fy=s), cv2.resize(b0, None, fx=s, fy=s)
        mk = cv2.resize(shell, None, fx=s, fy=s, interpolation=cv2.INTER_NEAREST)
        w = warp.copy(); w[:, 2] *= s
        _, w = cv2.findTransformECC(cv2.GaussianBlur(a, (0, 0), 1.5), cv2.GaussianBlur(b, (0, 0), 1.5), w, cv2.MOTION_AFFINE, crit, mk, 5)
        w[:, 2] /= s; warp = w
    return warp

# Temiz levha: nötrün yüz izleri vizör camının çevresinden yumuşak ortalamayla doldurulur.
core = cv2.erode(Nm, ell(51))
gN = cv2.dilate(glow(N, 40) & core, ell(45)) & cv2.erode(Nm, ell(13))
src = np.where(gN[..., None] > 0, 0, N[..., :3]).astype(np.float32); wgt = (gN == 0).astype(np.float32) * Nm
fill = cv2.GaussianBlur(src * Nm[..., None], (0, 0), 25) / np.maximum(cv2.GaussianBlur(wgt, (0, 0), 25)[..., None], 1e-4)
al = cv2.GaussianBlur(gN.astype(np.float32), (0, 0), 6)[..., None]
plate = N.copy(); plate[..., :3] = np.clip(N[..., :3] * (1 - al) + fill * al, 0, 255).astype(np.uint8)

def save(a, name):
    im = Image.fromarray(a).crop(BOX)
    for w in WIDTHS:
        h = round(im.height * w / im.width)
        im.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA').save(os.path.join(OUT, f'{name}-{w}.webp'), lossless=True, quality=100, method=6)

os.makedirs(OUT, exist_ok=True)
save(plate, 'govde')
for face, file in FACES.items():
    if face == 'neutral':
        lay = N.copy(); m = al[..., 0]
    else:
        E = load(file); warp = register(E)
        W = cv2.warpAffine(E, warp, (1024, 1024), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP, borderValue=0)
        inV = cv2.erode(Nm & visor_mask(W), ell(25))
        g = cv2.dilate((glow(N) | glow(W)) & inV, ell(41)) & inV
        m = cv2.GaussianBlur(g.astype(np.float32), (0, 0), 7) * cv2.GaussianBlur(inV.astype(np.float32), (0, 0), 3)
        lay = W.copy()
        sc = np.sqrt(abs(np.linalg.det(warp[:, :2]))); print(f'{face}: kayma {warp[0,2]:.1f},{warp[1,2]:.1f} px ölçek {sc:.4f}')
    lay[..., 3] = np.clip(m * 255, 0, 255).astype(np.uint8)
    save(lay, f'yuz-{face}')
print('ok', OUT)
