import { sessionId, type MascotState, type Snapshot } from '../shared/contract';
import type { MascotController } from './renderer';
import './sprite.css';

/**
 * Product mascot: the chibi octopus, made by design/mascot_chibi.py. One body that never moves or
 * splits; only the face inside the dark visor changes, as layers over it that cross-fade (~150 ms).
 * Idle it blinks now and then (the real closed-eyes face, at uneven intervals, now and then twice);
 * at work it looks focused; when something waits for the user it is surprised for a moment, then
 * waits wide-eyed; when an agent finishes it is happy for a few seconds; after a long quiet spell
 * it gets sleepy; a click surprises it. With reduced motion faces change at once and it does not blink.
 */
export type MascotFace = 'neutral' | 'happy' | 'waiting' | 'sleepy' | 'surprised' | 'focused' | 'blink';
const FACES: MascotFace[] = ['neutral', 'happy', 'waiting', 'sleepy', 'surprised', 'focused', 'blink'];
const labels: Record<MascotState, string> = { idle: 'Ready', working: 'Working', waiting: 'Waiting for a reply', replyEnded: 'Reply complete', error: 'Needs attention', resting: 'Resting', dragged: 'Moving' };
/** Times (ms): how long a passing face stays, and how long quiet lasts before it gets sleepy. */
export const MASCOT_TIMES = { happy: 4000, arrival: 1000, poke: 1100, sleepyAfter: 10 * 60_000, fade: 150 };

/** The face a lasting state shows (a passing one — happy, surprised — lies over it for a while). */
export function baseFace(state: MascotState, quietFor: number): MascotFace {
  switch (state) {
    case 'working': return 'focused';
    case 'waiting': case 'error': return 'waiting';
    case 'resting': return 'sleepy';
    case 'dragged': return 'surprised';
    default: return quietFor >= MASCOT_TIMES.sleepyAfter ? 'sleepy' : 'neutral';
  }
}

/** The agents working in a snapshot (their ids). */
export function workingNow(snapshot: Snapshot): Set<string> { return new Set(snapshot.sessions.filter(s => s.status === 'working').map(s => sessionId(s.key))); }
/** Whether an agent that was working has finished its reply since (not stopped on an error or a question). */
export function finishedAgents(before: Set<string>, snapshot: Snapshot): boolean {
  return snapshot.sessions.some(s => before.has(sessionId(s.key)) && (s.status === 'replyEnded' || s.status === 'idle'));
}

export function createStillMascot(element: HTMLElement, reducedMotion = false): MascotController {
  const stage = document.createElement('div'); stage.className = 'sprite-mascot'; stage.setAttribute('role', 'img');
  const frame = document.createElement('div'); frame.className = 'mascot-layers';
  const img = (src: string, cls: string) => { const i = document.createElement('img'); i.className = cls; i.alt = ''; i.decoding = 'async'; i.draggable = false; i.src = src; return i; };
  const faces = Object.fromEntries(FACES.map(f => [f, img(`/mascot/chibi/yuz-${f}-128.webp`, 'face')])) as Record<MascotFace, HTMLImageElement>;
  frame.append(img('/mascot/chibi/govde-128.webp', 'body'), ...FACES.map(f => faces[f])); stage.append(frame); element.append(stage);

  let reduced = reducedMotion, visible = true, state: MascotState = 'idle', shown: MascotFace | null = null;
  let quietSince = Date.now(), passing: { face: MascotFace; until: number } | null = null, blinking = false;
  let passTimer: ReturnType<typeof setTimeout> | undefined, blinkTimer: ReturnType<typeof setTimeout> | undefined;
  const awake = () => visible && !reduced && document.visibilityState === 'visible';
  const show = (face: MascotFace, ms = MASCOT_TIMES.fade) => {
    stage.style.setProperty('--face-fade', `${reduced ? 0 : ms}ms`);
    if (face === shown) return;
    for (const f of FACES) faces[f].classList.toggle('on', f === face);
    shown = face; stage.dataset.face = face;
  };
  const current = (): MascotFace => passing && passing.until > Date.now() ? passing.face : baseFace(state, Date.now() - quietSince);
  const render = () => { if (!blinking) show(current()); };
  const pass = (face: MascotFace, ms: number) => {
    passing = { face, until: Date.now() + ms }; clearTimeout(passTimer);
    passTimer = setTimeout(() => { passing = null; render(); }, ms); render();
  };
  // A blink: quickly to closed eyes, a short rest, open again with a softer fade.
  const blink = (twice: boolean) => {
    const open = current();
    if (!awake() || blinking || !['neutral', 'focused', 'waiting'].includes(open)) return;
    blinking = true; show('blink', 70);
    setTimeout(() => {
      blinking = false; show(current(), 120);
      if (twice) setTimeout(() => blink(false), 260);
    }, 140);
  };
  const nextBlink = () => { blinkTimer = setTimeout(() => { blink(Math.random() < .2); render(); nextBlink(); }, 2600 + Math.random() * 3900); };
  nextBlink();
  // A click (where it can be clicked: the open island's header, the office's corner).
  const poke = () => { quietSince = Date.now(); pass('surprised', MASCOT_TIMES.poke); };
  stage.addEventListener('click', poke);

  const apply = (next: MascotState) => {
    const prev = state;
    // "Finished" is a moment, not a state: underneath it the mascot is idle (or still waits).
    if (next === 'replyEnded') next = prev === 'waiting' || prev === 'error' ? prev : 'idle';
    state = next;
    if (next !== 'idle' || prev !== 'idle') quietSince = Date.now();
    stage.dataset.state = next; stage.setAttribute('aria-label', `AgentOffice mascot — ${labels[next]}`);
  };
  const setState = (next: MascotState) => {
    const prev = state, ended = next === 'replyEnded';
    apply(next);
    if (state === 'waiting' && prev !== 'waiting') pass('surprised', MASCOT_TIMES.arrival);
    else if (ended && state === 'idle') pass('happy', MASCOT_TIMES.happy);
    else if (passing && (state === 'waiting' || state === 'error') && passing.face === 'happy') { passing = null; clearTimeout(passTimer); }
    render();
  };
  apply('idle'); render();
  return {
    setState,
    setPointer() {},
    setVisible(next) { visible = next; stage.style.visibility = next ? 'visible' : 'hidden'; },
    setReducedMotion(next) { reduced = next; blinking = false; shown = null; show(current()); },
    dispose() { clearTimeout(blinkTimer); clearTimeout(passTimer); stage.removeEventListener('click', poke); stage.remove(); },
  };
}
