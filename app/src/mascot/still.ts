import { sessionId, type MascotState, type Snapshot } from '../shared/contract';
import type { MascotController } from './renderer';
import './sprite.css';

/**
 * Product mascot: Ada, the orange robot octopus. Every move is a clip made by the video model
 * (transparent animated WebP, public/mascot/ada/); nothing is moved or drawn in code, the mascot
 * only switches files. All clips start and end on the same base pose in one shared frame, so a
 * switch never jumps. Idle it loops the blinking idle clip (also at work); something waiting for
 * the user makes it plead; an agent that finished makes it giggle once, an agent that starts hops
 * once, the app's start waves, a click makes it shy. Where no clip fits (long quiet, resting,
 * dragged) and with reduced motion it shows a still. In the open island it waves as it opens, hops
 * now and then (6–12 s) while idle; for as long as a cursor rests on it, it looks at the viewer
 * with bright eyes (plead cut in three: in, a short ping-pong hold of its peak frames, out),
 * and off to one side the gaze still toward it.
 * Every file is fetched ahead, so a switch never waits on the disk.
 */
export type MascotClip = 'idle' | 'hop' | 'giggle' | 'wave' | 'plead' | 'shy' | 'plead-in' | 'plead-out';
export type MascotGaze = 'look-center' | 'look-left' | 'look-right' | 'look-up-left';
export type MascotLook = MascotClip | MascotGaze | 'plead-hold';
/** Length of each clip (ms, from the clips' manifests: 16 fps). */
export const CLIP_MS: Record<MascotClip, number> = { idle: 1812, hop: 2000, giggle: 2000, wave: 2062, plead: 2062, shy: 2562, 'plead-in': 806, 'plead-out': 806 };
/** The hold loop (peak frames 12–17–13 of plead, 16 fps): ending on its loop seam keeps "out" seamless. */
export const HOLD_LOOP_MS = 620;
const labels: Record<MascotState, string> = { idle: 'Hazır', working: 'Çalışıyor', waiting: 'Yanıt bekliyor', replyEnded: 'Yanıt tamamlandı', error: 'Dikkat gerekiyor', resting: 'Dinleniyor', dragged: 'Taşınıyor' };
/** Quiet this long and the idle loop rests on the still. */
export const MASCOT_TIMES = { sleepyAfter: 10 * 60_000 };

/** What a lasting state shows (a one-off clip — wave, hop, giggle, shy — plays over it once). */
export function baseLook(state: MascotState, quietFor: number, reduced = false): MascotLook {
  if (state === 'dragged') return 'look-up-left';
  if (reduced || state === 'resting') return 'look-center';
  if (state === 'waiting' || state === 'error') return 'plead';
  return state === 'idle' && quietFor >= MASCOT_TIMES.sleepyAfter ? 'look-center' : 'idle';
}

/** The gaze still toward a cursor at (x, y) from Ada's middle, each -1…1 of half her box (y down). */
export function gazeAt(x: number, y: number): MascotGaze {
  if (x < -.35) return y < -.2 ? 'look-up-left' : 'look-left';
  return x > .35 ? 'look-right' : 'look-center';
}

/** The file for a look at the screen's pixel density: 512 px from 1.5× up, else 256 px. */
export function lookFile(look: MascotLook, dpr: number): string {
  return `/mascot/ada/${look}-${dpr >= 1.5 ? 512 : 256}.${look.startsWith('look-') ? 'png' : 'webp'}`;
}

/** The agents working in a snapshot (their ids). */
export function workingNow(snapshot: Snapshot): Set<string> { return new Set(snapshot.sessions.filter(s => s.status === 'working').map(s => sessionId(s.key))); }
/** Whether an agent that was working has finished its reply since (not stopped on an error or a question). */
export function finishedAgents(before: Set<string>, snapshot: Snapshot): boolean {
  return snapshot.sessions.some(s => before.has(sessionId(s.key)) && (s.status === 'replyEnded' || s.status === 'idle'));
}

export function createStillMascot(element: HTMLElement, reducedMotion = false): MascotController {
  const stage = document.createElement('div'); stage.className = 'sprite-mascot'; stage.setAttribute('role', 'img');
  const frame = document.createElement('div'); frame.className = 'mascot-layers'; stage.append(frame); element.append(stage);

  let reduced = reducedMotion, disposed = false, state: MascotState = 'idle', shown: MascotLook | null = null, shownImg: HTMLImageElement | null = null;
  let quietSince = Date.now(), passing: { clip: MascotClip; until: number } | null = null, token = 0;
  let passTimer: ReturnType<typeof setTimeout> | undefined, hopTimer: ReturnType<typeof setTimeout> | undefined;
  let open = false, gaze: MascotGaze | null = null, over = false, holdSince = 0;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  // Each file is read once; every showing gets a fresh blob URL, so a clip always starts at its
  // first frame (one image URL shares one animation timeline in the browser).
  const blobs = new Map<string, Promise<Blob | null>>();
  const source = async (look: MascotLook) => {
    const file = lookFile(look, window.devicePixelRatio || 1);
    if (!blobs.has(file)) blobs.set(file, fetch(file).then(r => r.ok ? r.blob() : null).catch(() => null));
    const blob = await blobs.get(file);
    return blob ? URL.createObjectURL(blob) : file;
  };
  // Every file for this screen, fetched ahead (one after another, after the first look).
  const LOOKS: MascotLook[] = ['idle', 'wave', 'plead', 'hop', 'giggle', 'shy', 'plead-in', 'plead-hold', 'plead-out', 'look-center', 'look-left', 'look-right', 'look-up-left'];
  const preload = setTimeout(() => void LOOKS.reduce((all, look) => all.then(() => source(look).then(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); })), Promise.resolve()), 300);
  const release = (i: HTMLImageElement) => { if (i.src.startsWith('blob:')) URL.revokeObjectURL(i.src); i.remove(); };
  const show = async (look: MascotLook) => {
    if (look === shown) return;
    shown = look; stage.dataset.look = look;
    const mine = ++token, url = await source(look);
    const next = document.createElement('img'); next.alt = ''; next.draggable = false; next.src = url;
    try { await next.decode(); } catch { /* shown as it loads */ }
    if (mine !== token || disposed) { release(next); return; }
    // The new file goes on top; the old one leaves two frames later, so no frame is ever empty.
    const old = shownImg; shownImg = next; frame.append(next); if (look === 'plead-hold') holdSince = performance.now();
    if (old) requestAnimationFrame(() => requestAnimationFrame(() => release(old)));
  };
  // Held by the cursor (open island): the peak of plead, or toward a side the gaze still.
  const held = () => over && open && !reduced;
  const current = (): MascotLook => passing && passing.until > Date.now() ? passing.clip : gaze ?? (held() ? 'plead-hold' : baseLook(state, Date.now() - quietSince, reduced));
  const render = () => { if (!disposed) void show(current()); };
  const play = (clip: MascotClip) => {
    if (reduced) { render(); return; }
    passing = { clip, until: Date.now() + CLIP_MS[clip] }; clearTimeout(passTimer);
    passTimer = setTimeout(() => {
      passing = null;
      // Clips end on the base pose, plead-in on its peak: the next file always starts where it ended.
      if (clip === 'plead-in' && (!held() || gaze)) play('plead-out');
      else if (clip !== 'plead-in' && held() && !gaze) play('plead-in');
      else render();
    }, CLIP_MS[clip]);
    shown = null; render();
  };
  // Open and idle: a gentle hop every 6–12 s (not while the cursor rests on it or another clip plays).
  const nextHop = () => { clearTimeout(hopTimer); if (open) hopTimer = setTimeout(() => { if (!passing && !gaze && !over && current() === 'idle') play('hop'); nextHop(); }, 6000 + Math.random() * 6000); };
  // The cursor on it: toward a side the gaze still that way; in the middle the clip or base, since
  // look-center is the base pose (its box is the layout box, the island scales it).
  const look = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect(); if (!r.width) return;
    const toward = gazeAt((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1), next = toward === 'look-center' ? null : toward;
    if (next === gaze) return;
    const was = gaze; gaze = next;
    if (held() && !passing) { if (!was && shown === 'plead-hold') { play('plead-out'); return; } if (was && !next) { play('plead-in'); return; } }
    render();
  };
  // Landing on it in the open island: it looks up at the viewer with bright eyes and keeps looking.
  const greet = () => { over = true; clearTimeout(leaveTimer); if (held() && !passing && !gaze && shown !== 'plead-hold') play('plead-in'); };
  // Leaving: from the hold, "out" starts on the hold's loop seam (at most one loop later).
  const unlook = () => {
    over = false; gaze = null; clearTimeout(leaveTimer);
    if (passing || shown !== 'plead-hold') { if (!passing) render(); return; }
    leaveTimer = setTimeout(() => { if (!over && shown === 'plead-hold') play('plead-out'); }, HOLD_LOOP_MS - (performance.now() - holdSince) % HOLD_LOOP_MS);
  };
  stage.addEventListener('pointerenter', greet); stage.addEventListener('pointermove', look); stage.addEventListener('pointerleave', unlook);
  // Long quiet: the idle loop settles on the still (checked now and then).
  const quietTimer = setInterval(render, 30_000);
  // A click (where it can be clicked: the open island's header, the office's corner).
  const poke = () => { quietSince = Date.now(); play('shy'); };
  stage.addEventListener('click', poke);

  const apply = (next: MascotState) => {
    const prev = state;
    // "Finished" is a moment, not a state: underneath it the mascot is idle (or still waits).
    if (next === 'replyEnded') next = prev === 'waiting' || prev === 'error' ? prev : 'idle';
    state = next;
    if (next !== 'idle' || prev !== 'idle') quietSince = Date.now();
    stage.dataset.state = next; stage.setAttribute('aria-label', `AgentOffice maskot — ${labels[next]}`);
  };
  const setState = (next: MascotState) => {
    const prev = state, ended = next === 'replyEnded';
    apply(next);
    if (ended && state === 'idle') play('giggle');
    else if (state === 'working' && prev !== 'working') play('hop');
    else { if (passing && state !== prev && (state === 'waiting' || state === 'error' || state === 'dragged')) { passing = null; clearTimeout(passTimer); } render(); }
  };
  apply('idle'); render(); play('wave');
  return {
    setState,
    setPointer() {},
    setVisible(next) { stage.style.visibility = next ? 'visible' : 'hidden'; },
    setOpen(next) { if (next === open) return; open = next; if (!open) { gaze = null; over = false; clearTimeout(leaveTimer); } nextHop(); if (open) play('wave'); else render(); },
    setReducedMotion(next) { if (next === reduced) return; reduced = next; if (reduced) { passing = null; clearTimeout(passTimer); } render(); },
    dispose() { disposed = true; token++; clearTimeout(passTimer); clearTimeout(hopTimer); clearTimeout(leaveTimer); clearTimeout(preload); clearInterval(quietTimer); stage.removeEventListener('click', poke); stage.removeEventListener('pointerenter', greet); stage.removeEventListener('pointermove', look); stage.removeEventListener('pointerleave', unlook); if (shownImg) release(shownImg); stage.remove(); },
  };
}
