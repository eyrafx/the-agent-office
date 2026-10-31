// Generated wallpapers: soft abstract light (no photo, no logo), drawn once per size. Each stage is a
// small "screen"; its island's smoked glass is drawn from the very same picture (see main.ts).

type Blob = [x: number, y: number, r: number, color: string, alpha: number];
interface Palette { base: [string, string]; blobs: Blob[] }

export const PALETTES: Record<string, Palette> = {
  hero: { base: ['#0b0a16', '#07080b'], blobs: [[.5, -.05, .55, '#ff9a3d', .55], [.18, .2, .5, '#6a2bd1', .55], [.86, .25, .48, '#0f8f9a', .45], [.62, .55, .6, '#3b1660', .55], [.3, .75, .45, '#ff5d73', .18]] },
  agents: { base: ['#120c18', '#0a0a10'], blobs: [[.5, -.1, .6, '#ff9a3d', .6], [.1, .7, .6, '#7b2ff7', .45], [.95, .8, .5, '#ff4f8b', .3]] },
  media: { base: ['#130a1a', '#08070d'], blobs: [[.25, .1, .6, '#ff4f8b', .55], [.85, .3, .55, '#5b2a86', .6], [.5, 1, .6, '#ffb36b', .3]] },
  notes: { base: ['#07130f', '#06090a'], blobs: [[.7, 0, .6, '#2fd1a0', .45], [.15, .6, .6, '#0f5f73', .55], [.9, .9, .4, '#e8d36b', .2]] },
  focus: { base: ['#170a0a', '#0a0707'], blobs: [[.4, 0, .6, '#ff6a3d', .55], [.9, .55, .55, '#8a1f4f', .5], [.1, .9, .45, '#ffb84d', .25]] },
  alarms: { base: ['#080b18', '#06070c'], blobs: [[.55, -.05, .6, '#3d7bff', .5], [.12, .55, .55, '#2a1b6e', .6], [.9, .85, .45, '#7ad7ff', .25]] },
  water: { base: ['#061218', '#05080b'], blobs: [[.45, 0, .6, '#34c3ff', .5], [.9, .6, .55, '#0b5d8a', .55], [.1, .9, .5, '#5ef0d0', .28]] },
  shelf: { base: ['#110b18', '#08070c'], blobs: [[.6, -.05, .6, '#b06bff', .5], [.1, .45, .55, '#ff9f6b', .32], [.85, .95, .55, '#3a2a8a', .5]] },
  cta: { base: ['#120b08', '#07080b'], blobs: [[.5, 1.05, .7, '#ff9a3d', .6], [.12, .2, .45, '#6a2bd1', .35], [.9, .2, .45, '#0f8f9a', .3]] },
};

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

export function paint(canvas: HTMLCanvasElement, name: string) {
  const p = PALETTES[name] ?? PALETTES.hero;
  const w = Math.max(1, Math.min(2400, Math.round(canvas.clientWidth))), h = Math.max(1, Math.min(2400, Math.round(canvas.clientHeight)));
  if (canvas.width === w && canvas.height === h && canvas.dataset.painted === name) return false;
  canvas.width = w; canvas.height = h; canvas.dataset.painted = name;
  const g = canvas.getContext('2d')!;
  const base = g.createLinearGradient(0, 0, 0, h); base.addColorStop(0, p.base[0]); base.addColorStop(1, p.base[1]);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const span = Math.max(w, h);
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, r, color, alpha] of p.blobs) {
    const cx = x * w, cy = y * h, rad = r * span;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, hexA(color, alpha)); grad.addColorStop(.45, hexA(color, alpha * .45)); grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }
  g.globalCompositeOperation = 'source-over';
  // Fine grain against banding.
  const random = rng(w * 31 + h * 17 + name.length);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (random() - .5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return true;
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}
