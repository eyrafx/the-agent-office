/* Sakura petals on canvas. A layer is one or two canvases: a back canvas behind the content
   (many small, sharp petals, and the stars at night) and a front canvas above it (a few large,
   softer ones). Sprites are drawn once per colour and blur level, so a frame is only drawImage
   calls. Petal counts are capped by area, the canvas resolution is capped at 1.5x, and a layer
   stops when it is off screen, when the tab is hidden, or while another layer is told to pause it.
   With reduced motion a layer draws one still frame. */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function petalSprite(size, inner, edge, blur, glow) {
    const pad = Math.ceil(blur * 3 + (glow ? size * 0.6 : 2));
    const c = document.createElement('canvas');
    c.width = c.height = size + pad * 2;
    const g = c.getContext('2d');
    g.translate(pad + size / 2, pad + size / 2);
    if (blur) g.filter = `blur(${blur}px)`;
    if (glow) { g.shadowColor = glow; g.shadowBlur = size * 0.5; }
    const s = size / 2;
    // a sakura petal: rounded body, a small notch at the tip, a narrow base
    g.beginPath();
    g.moveTo(0, s);
    g.bezierCurveTo(-s * 0.95, s * 0.35, -s * 0.9, -s * 0.75, -s * 0.18, -s * 0.95);
    g.lineTo(0, -s * 0.72);
    g.lineTo(s * 0.18, -s * 0.95);
    g.bezierCurveTo(s * 0.9, -s * 0.75, s * 0.95, s * 0.35, 0, s);
    g.closePath();
    const grad = g.createLinearGradient(0, s, 0, -s);
    grad.addColorStop(0, inner); grad.addColorStop(1, edge);
    g.fillStyle = grad; g.fill();
    g.shadowBlur = 0; g.globalAlpha = 0.35; g.strokeStyle = '#fff'; g.lineWidth = Math.max(0.6, size / 26);
    g.beginPath(); g.moveTo(0, s * 0.8); g.quadraticCurveTo(-s * 0.08, 0, 0, -s * 0.55); g.stroke();
    return c;
  }

  function layer(opt) {
    let o = Object.assign({ size: 1, maxBack: 34, maxFront: 7, wind: 0.4, colors: [['#ffb3d1', '#fff0f6']], glow: null, frontBlur: [0, 0.8], stars: 0, starColor: '#fff4dc' }, opt);
    const fixed = !o.area;
    const canvases = [o.back && { el: o.back, front: false }, o.front && { el: o.front, front: true }].filter(Boolean);
    let sprites, W = 0, H = 0, petals = [], stars = [], running = false, raf = 0, last = 0, visible = true, held = false;
    const pointer = { x: -9999, y: -9999 };

    function makeSprites() {
      sprites = { back: [], front: [] };
      o.colors.forEach(([i, e]) => {
        sprites.back.push(petalSprite(24 * o.size, i, e, 0, o.glow), petalSprite(17 * o.size, i, e, 0.5, o.glow));
        sprites.front.push(petalSprite(40 * o.size, i, e, o.frontBlur[0], o.glow), petalSprite(54 * o.size, i, e, o.frontBlur[1], o.glow));
      });
    }

    function spawn(front, anywhere) {
      const set = front ? sprites.front : sprites.back;
      const z = front ? 0.8 + Math.random() * 0.5 : 0.35 + Math.random() * 0.55;
      return {
        img: set[(Math.random() * set.length) | 0], z, front,
        x: Math.random() * (W + 200) - 100,
        y: anywhere ? Math.random() * H : -70 - Math.random() * 110,
        vy: (18 + Math.random() * 22) * z * (front ? 1.5 : 1),
        sway: 18 + Math.random() * 40, freq: 0.4 + Math.random() * 0.9, ph: Math.random() * 6.28,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 1.6,
        flip: Math.random() * 6.28, vf: 1 + Math.random() * 2.2,
        scale: front ? 0.75 + Math.random() * 0.5 : 0.6 + Math.random() * 0.6, px: 0, py: 0
      };
    }

    function resize() {
      const r = fixed ? { width: innerWidth, height: innerHeight } : o.area.getBoundingClientRect();
      W = r.width; H = r.height;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvases.forEach(c => { c.el.width = Math.round(W * dpr); c.el.height = Math.round(H * dpr); c.ctx = c.el.getContext('2d'); c.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); });
      const k = Math.max(0.4, Math.min(1, (W * H) / (1440 * 900)));
      petals = [];
      for (let i = Math.round(o.maxBack * k); i--;) petals.push(spawn(false, true));
      for (let i = o.front ? Math.round(o.maxFront * k) : 0; i--;) petals.push(spawn(true, true));
      stars = [];
      for (let i = Math.round(o.stars * k); i--;) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.75, r: Math.random() < 0.12 ? 1.6 : 0.5 + Math.random() * 0.8, ph: Math.random() * 6.28, f: 0.6 + Math.random() * 1.8 });
    }

    function draw(t, dt) {
      canvases.forEach(c => c.ctx.clearRect(0, 0, W, H));
      const back = canvases.find(c => !c.front) || canvases[0], front = canvases.find(c => c.front) || back;
      if (stars.length) {
        const g = back.ctx; g.fillStyle = o.starColor;
        for (const s of stars) {
          g.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.f + s.ph));
          g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.283); g.fill();
          if (s.r > 1.4) { g.fillRect(s.x - 5, s.y - 0.4, 10, 0.8); g.fillRect(s.x - 0.4, s.y - 5, 0.8, 10); }
        }
        g.globalAlpha = 1;
      }
      for (const p of petals) {
        if (dt) {
          p.y += p.vy * dt;
          p.x += (o.wind * 40 * p.z + Math.cos(t * p.freq + p.ph) * p.sway * 0.6) * dt;
          p.rot += p.vr * dt; p.flip += p.vf * dt;
          const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
          if (d2 < 16000) { const f = (1 - d2 / 16000) * 260 * dt, d = Math.sqrt(d2) || 1; p.px += dx / d * f; p.py += dy / d * f; }
          p.px *= 0.94; p.py *= 0.94; p.x += p.px * dt * 8; p.y += p.py * dt * 8;
          if (p.y > H + 80 || p.x > W + 140 || p.x < -160) Object.assign(p, spawn(p.front, false));
        }
        const g = (p.front ? front : back).ctx, sw = p.img.width * p.scale, sh = p.img.height * p.scale;
        g.save();
        g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(p.flip)));
        g.globalAlpha = p.front ? 0.9 : 0.7 + p.z * 0.3;
        g.drawImage(p.img, -sw / 2, -sh / 2, sw, sh);
        g.restore();
      }
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
      draw(now / 1000, dt);
      if (running) raf = requestAnimationFrame(frame);
    }
    function sync() {
      const go = visible && !held && !document.hidden && !reduce.matches;
      if (go && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
      else if (!go && running) { running = false; cancelAnimationFrame(raf); }
      canvases.forEach(c => c.el.style.visibility = held ? 'hidden' : '');
    }

    makeSprites(); resize(); draw(0, 0); sync();
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); draw(0, 0); }, 150); });
    (fixed ? window : o.area).addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = fixed ? { left: 0, top: 0 } : o.area.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    }, { passive: true });
    if (!fixed) new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(o.area);
    document.addEventListener('visibilitychange', sync);
    reduce.addEventListener('change', () => { sync(); draw(0, 0); });

    return {
      // new colours, glow or stars (the day/night switch)
      set(next) { o = Object.assign(o, next); makeSprites(); resize(); draw(0, 0); },
      hold(v) { held = v; sync(); }
    };
  }

  window.Sakura = { layer };
})();
