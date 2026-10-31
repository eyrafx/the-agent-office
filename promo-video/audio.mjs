// The film's music: one calm original piece, written and synthesized here note by note (no samples,
// no loops, no music from anywhere else, so there is nothing to license). 72 BPM in D major: a soft
// electric piano alone, a warm pad underneath, then a quiet bass and a light pulse lift it while the
// office is on screen, and it settles on one long chord under the end card. No sound effects at all:
// nothing is tied to a cut, the cuts are simply placed on its beats (the film's own timing).
// Usage: node audio.mjs <cues.json> <out.wav>
import { readFileSync, writeFileSync } from 'node:fs';

const [cuesFile, outFile] = process.argv.slice(2);
const { duration, music = { bpm: 72 } } = JSON.parse(readFileSync(cuesFile, 'utf8'));
const SR = 48000, N = Math.ceil(duration * SR);
const BEAT = 60 / music.bpm, BAR = 4 * BEAT;
const dry = [new Float32Array(N), new Float32Array(N)], wet = [new Float32Array(N), new Float32Array(N)];
const db = d => 10 ** (d / 20);
const hz = n => 440 * 2 ** ((n - 69) / 12);
const NOTE = Object.fromEntries(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((n, i) => [n, i]));
/** 'F#4' → MIDI number. */
const midi = s => { const m = /^([A-G]#?)(-?\d)$/.exec(s); return 12 * (Number(m[2]) + 1) + NOTE[m[1]]; };
function put(i, l, r, send) { if (i < 0 || i >= N) return; dry[0][i] += l; dry[1][i] += r; wet[0][i] += l * send; wet[1][i] += r * send; }

// ——— the harmony: one chord a bar ———
const D = ['D3', 'A3', 'C#4', 'E4', 'F#4'], Bm = ['B2', 'F#3', 'A3', 'C#4', 'D4'], G = ['G2', 'D3', 'F#3', 'A3', 'B3'];
const Asus = ['A2', 'E3', 'G3', 'B3', 'D4'], Em = ['E2', 'B2', 'G3', 'D4', 'F#4'], A9 = ['A2', 'E3', 'G3', 'B3', 'C#4'];
// Dmaj9 Bm9 Gmaj9 A9sus4, again, then Em9 and A9 lead home to Dmaj9 (on the end card).
const BEAT_HOME = music.home ?? 36, HOME_BAR = Math.round(BEAT_HOME / 4);
const CYCLE = [[D, 'D2'], [Bm, 'B1'], [G, 'G1'], [Asus, 'A1']];
const PLAN = Array.from({ length: HOME_BAR }, (_, b) => b === HOME_BAR - 2 ? [Em, 'E2'] : b === HOME_BAR - 1 ? [A9, 'A1'] : CYCLE[b % 4]);
PLAN.push([D, 'D2'], [D, 'D2']);
const CHORDS = PLAN.map(([c]) => c.map(midi));
const ROOTS = PLAN.map(([, r]) => midi(r));
const LIFT = (music.lift ?? 18) * BEAT, HOME = HOME_BAR * BAR; // the lift (bass and pulse) and the end card
const bars = Math.ceil(duration / BAR);

/** Electric piano: a soft two-operator FM tine, its brightness falling as the note rings. */
function ep(t0, n, vel, len = 2.6, pan = 0) {
  const f = hz(n), start = Math.round(t0 * SR), tau = 1.9 * (220 / f) ** .35, total = Math.round((len + .5) * SR);
  const g = vel * db(-20), lg = Math.cos((pan + 1) * Math.PI / 4), rg = Math.sin((pan + 1) * Math.PI / 4);
  for (let k = 0; k < total; k++) {
    const t = k / SR, rel = t > len ? Math.max(0, 1 - (t - len) / .5) : 1;
    const env = Math.min(1, t / .004) * Math.exp(-t / tau) * rel;
    const idx = (.35 + 1.4 * vel) * Math.exp(-t * 3.2);
    const s = (Math.sin(2 * Math.PI * f * t + idx * Math.sin(2 * Math.PI * f * t)) + .12 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 6)) * env * g;
    put(start + k, s * lg, s * rg, .55);
  }
}
/** A chord, rolled gently from the bottom. */
function chord(t0, notes, vel, len, roll = .028) { notes.forEach((n, i) => ep(t0 + i * roll, n, vel * (i === notes.length - 1 ? 1 : .82), len, -.35 + .7 * i / (notes.length - 1))); }

/** Pad: three slightly detuned sines per note, slow in and out, a little darker at the bottom. */
function pad(t0, notes, len, level) {
  const start = Math.round(t0 * SR), total = Math.round((len + 1.6) * SR);
  const voices = notes.map((n, i) => ({ f: hz(n + 12 * (n < 50 ? 1 : 0)), w: 1 / (1 + i * .25) }));
  const lp = [0, 0];
  for (let k = 0; k < total; k++) {
    const t = k / SR, env = Math.min(1, t / 1.4) ** 2 * (t > len ? Math.max(0, 1 - (t - len) / 1.6) : 1);
    let l = 0, r = 0;
    for (const { f, w } of voices) {
      l += w * (Math.sin(2 * Math.PI * f * .9985 * t) + .6 * Math.sin(2 * Math.PI * f * 1.0021 * t + 1.3));
      r += w * (Math.sin(2 * Math.PI * f * 1.0016 * t + .7) + .6 * Math.sin(2 * Math.PI * f * .9978 * t + 2.1));
    }
    lp[0] += .05 * (l - lp[0]); lp[1] += .05 * (r - lp[1]);
    put(start + k, lp[0] * env * level, lp[1] * env * level, .8);
  }
}

/** Bass: a round sine with a touch of its octave. */
function bass(t0, n, len, vel = 1) {
  const f = hz(n), start = Math.round(t0 * SR), total = Math.round((len + .3) * SR);
  for (let k = 0; k < total; k++) {
    const t = k / SR, env = Math.min(1, t / .02) * Math.exp(-t * .55) * (t > len ? Math.max(0, 1 - (t - len) / .3) : 1);
    const s = (Math.sin(2 * Math.PI * f * t) + .22 * Math.sin(4 * Math.PI * f * t)) * env * vel * db(-24);
    put(start + k, s, s, .1);
  }
}

/** Pulse: light, high, short notes in eighths (a plucked bell), the chord's tones going up. */
function pluck(t0, n, vel, pan) {
  const f = hz(n), start = Math.round(t0 * SR), total = Math.round(.9 * SR);
  const lg = Math.cos((pan + 1) * Math.PI / 4), rg = Math.sin((pan + 1) * Math.PI / 4);
  for (let k = 0; k < total; k++) {
    const t = k / SR, env = Math.min(1, t / .003) * Math.exp(-t * 7);
    const s = (Math.sin(2 * Math.PI * f * t) + .3 * Math.sin(2 * Math.PI * f * 2.001 * t) * Math.exp(-t * 14)) * env * vel * db(-27);
    put(start + k, s * lg, s * rg, .7);
  }
}

// ——— the arrangement ———
for (let b = 0; b < bars; b++) {
  const t = b * BAR, c = CHORDS[Math.min(b, CHORDS.length - 1)], home = t >= HOME - .01;
  if (home) {
    if (b === HOME_BAR) { chord(t, c, .62, BAR * 2 - .3, .045); ep(t + 2 * BEAT, c[4] + 12, .22, 4.5, .3); }
    continue;
  }
  // Beat 1: the chord; beat 3 and a half: one quiet answer (from bar 4, a softer chord on beat 3 too).
  chord(t, c, b < 2 ? .5 : .54, BAR - .2);
  if (t >= LIFT - BAR) chord(t + 2 * BEAT, c.slice(1), .3, 2 * BEAT - .1, .02);
  ep(t + 3.5 * BEAT, c[c.length - 1] + 12, .2, 1.4, .4);
}
// Pad: from the third bar to the end, one long breath per chord.
for (let b = 2; b < bars; b++) pad(b * BAR, CHORDS[Math.min(b, CHORDS.length - 1)], b >= HOME_BAR ? duration - b * BAR : BAR, b >= HOME_BAR ? db(-29) : db(-31));
// Bass and pulse: the lift, from the office to the end card.
for (let b = Math.floor(LIFT / BAR); b < bars; b++) {
  const t = b * BAR, r = ROOTS[b];
  if (b >= HOME_BAR) { if (b === HOME_BAR) bass(t, r, BAR * 2, .9); continue; }
  if (t >= LIFT - .01) bass(t, r, 2 * BEAT - .1);
  if (t + 2 * BEAT >= LIFT - .01) bass(t + 2 * BEAT, r, 2 * BEAT - .1, .8);
  const c = CHORDS[b], line = [c[1] + 12, c[2] + 12, c[3] + 12, c[4] + 12, c[3] + 12, c[2] + 12, c[4] + 12, c[3] + 12];
  for (let i = 0; i < 8; i++) {
    const at = t + i * BEAT / 2; if (at < LIFT - .01) continue;
    const swell = Math.min(1, (at - LIFT) / BAR);
    pluck(at, line[i], (i % 2 ? .55 : .8) * (.5 + .5 * swell), i % 2 ? .35 : -.35);
  }
}

// ——— a room: a small Schroeder reverb on the send ———
function reverb(x, seed) {
  const combs = [1557, 1617, 1491, 1422].map(d => ({ d: d + seed, buf: new Float32Array(d + seed), i: 0, lp: 0 }));
  const aps = [225, 556].map(d => ({ d: d + Math.round(seed / 2), buf: new Float32Array(d + Math.round(seed / 2)), i: 0 }));
  const y = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    let s = 0;
    for (const c of combs) { const o = c.buf[c.i]; c.lp = o * .72 + c.lp * .28; c.buf[c.i] = x[n] * .5 + c.lp * .86; c.i = (c.i + 1) % c.d; s += o; }
    for (const a of aps) { const o = a.buf[a.i], v = o - .5 * s; a.buf[a.i] = s + .5 * v; a.i = (a.i + 1) % a.d; s = v; }
    y[n] = s * .25;
  }
  return y;
}
const rv = [reverb(wet[0], 0), reverb(wet[1], 23)];

// ——— master: fade in, a gentle arc, a clean fade out to silence at the last frame ———
const out = [new Float32Array(N), new Float32Array(N)];
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fin = Math.min(1, t / 1.2), fout = Math.min(1, Math.max(0, (duration - .15 - t) / 3.2));
  const g = fin * (fout ** 1.5);
  for (const ch of [0, 1]) out[ch][i] = (dry[ch][i] + rv[ch][i] * .9) * g;
}
// A soft ceiling, then the peak to −3 dBFS (build.mjs sets the loudness, low and steady).
let peak = 0; for (const ch of out) for (let i = 0; i < N; i++) { ch[i] = Math.tanh(ch[i] * 1.2) / 1.2; peak = Math.max(peak, Math.abs(ch[i])); }
const gain = db(-3) / (peak || 1);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) for (const ch of [0, 1]) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[ch][i] * gain)) * 32767), 44 + i * 4 + ch * 2);
writeFileSync(outFile, buf);
console.log(`${outFile}: ${(N / SR).toFixed(2)} s at ${music.bpm} BPM, gain ${gain.toFixed(2)}`);
