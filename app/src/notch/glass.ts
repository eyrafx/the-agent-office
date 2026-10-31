/**
 * Smoked glass for the notch shapes, drawn on the GPU from the live desktop
 * frame behind the window. The look follows the approved reference (a dark
 * macOS panel over a light wallpaper): a charcoal smoke through which the
 * background stays visible as soft, darkened shapes (leaves behind the panel
 * still read as leaves; text behind does not), a hairline light border, a
 * slightly brighter top edge and a very soft sheen. No light mode:
 * the glass is always dark, so white labels always read.
 * Each shape has an opacity, so the Limits panel's glass fades with its
 * content when it opens and closes.
 * The page's own content (text, buttons) is drawn on top by the DOM.
 */
/** `s`: shoulder radius of a shape flush with the screen top (its top corners curve out along the edge). */
export interface GlassShape { x: number; y: number; w: number; h: number; r: number; flush: boolean; alpha?: number; s?: number }
export interface GlassFrame { x: number; y: number; w: number; h: number }
export interface Glass {
  setFrame(source: ImageBitmap | HTMLCanvasElement, rect: GlassFrame): void;
  /** 0–100; 50 is the approved look (how much of the background passes through the smoke). */
  setDarkness(darkness: number): void;
  draw(shapes: GlassShape[]): void;
  dispose(): void;
}

const vertex = `#version 300 es
in vec2 aPos; uniform vec2 uView; out vec2 vPos;
void main() { vPos = (aPos * .5 + .5) * uView; vPos.y = uView.y - vPos.y; gl_Position = vec4(aPos, 0., 1.); }`;

const fragment = `#version 300 es
precision highp float;
uniform sampler2D uSoft;
uniform vec4 uFrame;
uniform vec4 uShapes[2];
uniform vec2 uRadius, uFlush, uShoulder;
uniform int uCount;
uniform float uDpr;
uniform vec2 uAlpha;
uniform float uPass;
in vec2 vPos; out vec4 outColor;

float sdBox(vec2 p, vec4 s, float r, float flush) {
  // A shape flush with the screen top has no top edge: extend it upwards.
  s.y -= flush * 80.0; s.w += flush * 80.0;
  vec2 h = s.zw * .5, q = abs(p - (s.xy + h)) - h + r;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
}
// The shoulders: beside each top corner, a square (reaching a little into the body, so the
// seam inside is not an edge) less a circle, so the island's sides curve out to the screen edge.
float shoulders(vec2 p, vec4 s, float k) {
  if (k < .5) return 1e5;
  float m = 12.;
  vec2 hl = vec2((k + m) * .5, (k + 80.) * .5);
  vec2 ql = abs(p - vec2(s.x - k + hl.x, s.y - 80. + hl.y)) - hl;
  float sqL = length(max(ql, 0.)) + min(max(ql.x, ql.y), 0.);
  float dL = max(sqL, k - length(p - vec2(s.x - k, s.y + k)));
  vec2 qr = abs(p - vec2(s.x + s.z - m + hl.x, s.y - 80. + hl.y)) - hl;
  float sqR = length(max(qr, 0.)) + min(max(qr.x, qr.y), 0.);
  float dR = max(sqR, k - length(p - vec2(s.x + s.z + k, s.y + k)));
  return min(dL, dR);
}
float shape(vec2 p, vec4 s, float r, float flush, float k) { return min(sdBox(p, s, r, flush), shoulders(p, s, k * flush)); }
float field(vec2 p, out int which) {
  float d = shape(p, uShapes[0], uRadius.x, uFlush.x, uShoulder.x);
  which = 0;
  if (uCount < 2) return d;
  float d1 = shape(p, uShapes[1], uRadius.y, uFlush.y, uShoulder.y);
  if (d1 < d) which = 1;
  return min(d, d1);
}
vec2 uvOf(vec2 p) { return (p - uFrame.xy) / uFrame.zw; }

void main() {
  int which; float sd = field(vPos, which);
  float alpha = clamp(.5 - sd * uDpr, 0., 1.) * (which == 1 ? uAlpha.y : uAlpha.x);
  if (alpha <= 0.) { outColor = vec4(0.); return; }
  float d = max(-sd, 0.);
  int w2; vec2 e = vec2(.75, 0.);
  vec2 n = normalize(vec2(field(vPos + e.xy, w2) - field(vPos - e.xy, w2), field(vPos + e.yx, w2) - field(vPos - e.yx, w2)) + 1e-5);
  // Body: the blurred background seen through charcoal smoke (almost half of
  // it passes). A soft knee keeps bright backgrounds from washing the glass
  // out: a light wall (~0.8) ends near #515351, dark leaves on it near
  // #262827, so shapes read clearly while white labels keep their contrast.
  vec3 bg = texture(uSoft, uvOf(vPos)).rgb;
  vec3 c = bg * uPass + vec3(.03, .031, .032);
  c = c / (1. + c * .6);
  // Very soft top-lit sheen.
  vec4 s = uShapes[which];
  float fy = clamp((vPos.y - max(s.y, 0.)) / max(s.w, 1.), 0., 1.);
  c += .018 * (1. - fy);
  // Hairline border: faint all round, a little brighter where it faces the
  // light (top left), plus a soft inner glow just inside it. It never shines
  // brighter than what is behind the glass: over a light wall it is the
  // approved hairline, over a dark app it was a light contour (measured over
  // #0d0d0f: body 18, edge 42), so there the edge stays as dark as the smoke.
  vec2 light = normalize(vec2(-.55, -.83));
  float facing = max(dot(n, light), 0.);
  float rim = exp(-d / .7), glow = exp(-d / 5.);
  c = min(c + rim * (.1 + .08 * facing) + glow * .022, max(c, bg));
  outColor = vec4(min(c, 1.) * alpha, alpha);
}`;

export function createGlass(canvas: HTMLCanvasElement): Glass | null {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const compile = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link');
  gl.useProgram(program);
  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(program, name);
  const loc = { view: u('uView'), frame: u('uFrame'), shapes: u('uShapes'), radius: u('uRadius'), flush: u('uFlush'), shoulder: u('uShoulder'), count: u('uCount'), dpr: u('uDpr'), alpha: u('uAlpha'), soft: u('uSoft'), pass: u('uPass') };
  let pass = .45;
  const softTex = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, softTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 10, 12, 255]));
  gl.uniform1i(loc.soft, 0);
  // Blurred copy: drawn on a padded canvas (stretched frame around it), so the
  // blur does not fade at the frame's edges.
  const pad = document.createElement('canvas'), soft = document.createElement('canvas');
  const padCtx = pad.getContext('2d')!, softCtx = soft.getContext('2d')!;
  let frame: GlassFrame = { x: 0, y: 0, w: 1, h: 1 };
  const BLUR = 11; // CSS px: shapes behind stay as soft forms, text is lost

  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return dpr;
  };

  return {
    setFrame(source, rect) {
      frame = rect;
      // Blurred at half the frame's resolution.
      const sw = Math.max(1, Math.round(source.width / 2)), sh = Math.max(1, Math.round(source.height / 2));
      const blur = BLUR * sw / rect.w, m = Math.ceil(blur * 3);
      if (pad.width !== sw + 2 * m || pad.height !== sh + 2 * m) { pad.width = sw + 2 * m; pad.height = sh + 2 * m; }
      if (soft.width !== sw || soft.height !== sh) { soft.width = sw; soft.height = sh; }
      padCtx.drawImage(source, 0, 0, pad.width, pad.height); padCtx.drawImage(source, m, m, sw, sh);
      softCtx.filter = `blur(${blur}px)`; softCtx.drawImage(pad, -m, -m); softCtx.filter = 'none';
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, softTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, soft);
    },
    draw(shapes) {
      const dpr = fit();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const list = shapes.filter(s => s.w > 1 && s.h > 1).slice(0, 2);
      if (!list.length) return;
      // Only the shapes' own box is drawn (with room for the shoulders and the soft edge): the
      // canvas covers the whole window, and shading all of it on every frame of an opening made
      // frames late on a 4K screen.
      const pad = 24;
      const x0 = Math.max(0, Math.min(...list.map(s => s.x - (s.s ?? 0))) - pad), x1 = Math.min(canvas.clientWidth, Math.max(...list.map(s => s.x + s.w + (s.s ?? 0))) + pad);
      const y1 = Math.min(canvas.clientHeight, Math.max(...list.map(s => s.y + s.h)) + pad);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(Math.floor(x0 * dpr), Math.floor(canvas.height - y1 * dpr), Math.ceil((x1 - x0) * dpr), Math.ceil(y1 * dpr));
      const rects = new Float32Array(8);
      list.forEach((s, i) => rects.set([s.x, s.y, s.w, s.h], i * 4));
      gl.uniform2f(loc.view, canvas.clientWidth, canvas.clientHeight);
      gl.uniform4f(loc.frame, frame.x, frame.y, frame.w, frame.h);
      gl.uniform4fv(loc.shapes, rects);
      gl.uniform2f(loc.radius, list[0].r, list[1]?.r ?? 0);
      gl.uniform2f(loc.flush, list[0].flush ? 1 : 0, list[1]?.flush ? 1 : 0);
      gl.uniform2f(loc.shoulder, list[0].s ?? 0, list[1]?.s ?? 0);
      gl.uniform1i(loc.count, list.length); gl.uniform1f(loc.dpr, dpr);
      gl.uniform2f(loc.alpha, list[0].alpha ?? 1, list[1]?.alpha ?? 1);
      gl.uniform1f(loc.pass, pass);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    setDarkness(darkness) { pass = .65 - Math.max(0, Math.min(100, darkness)) / 100 * .4; },
    dispose() { gl.deleteTexture(softTex); gl.deleteBuffer(quad); gl.deleteProgram(program); gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}
