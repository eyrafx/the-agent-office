import type { MascotState } from '../shared/contract';
import type { MascotController } from './renderer';
import './sprite.css';

/**
 * Product mascot: the approved picture, in layers made from it by
 * design/mascot_katmanlari.py. The body is never cut apart; only two things
 * move. The eyes' light blinks: the arcs close into a thin glowing line, rest a
 * moment and open with a slight give, at uneven intervals, now and then twice.
 * The raised arm, from its first joint up, waves briefly every 7–11 s, turning
 * about the joint the body keeps. At rest the layers are the picture itself.
 * States show as a soft glow around it. Pre-scaled copies (Lanczos,
 * premultiplied) keep it crisp at notch and office sizes.
 */
const LAYERS = ['under', 'arm', 'body', 'eyeL', 'eyeR'] as const;
const sources = (name: string) => [192, 384, 768].map(w => `/mascot/layers/${name}-${w}.png ${w}w`).join(', ');
const labels: Record<MascotState, string> = { idle: 'Ready', working: 'Working', waiting: 'Waiting for a reply', replyEnded: 'Reply complete', error: 'Needs attention', resting: 'Resting', dragged: 'Moving' };
const BLINK: Keyframe[] = [
  { transform: 'scale(1,1)', filter: 'brightness(1)', easing: 'cubic-bezier(.55,0,.9,.4)' },
  { transform: 'scale(1.05,.17)', filter: 'brightness(1.45)', offset: .34 },
  { transform: 'scale(1.05,.17)', filter: 'brightness(1.45)', offset: .5, easing: 'cubic-bezier(.15,.75,.3,1)' },
  { transform: 'scale(.99,1.06)', filter: 'brightness(1)', offset: .82, easing: 'ease-in-out' },
  { transform: 'scale(1,1)', filter: 'brightness(1)' },
];
// Up, back, up again, settling.
const WAVE: Keyframe[] = [0, -9, 2, -8, 1, -5, 0].map((deg, i, all) => ({ transform: `rotate(${deg}deg)`, offset: i / (all.length - 1), easing: 'cubic-bezier(.45,0,.55,1)' }));

export function createStillMascot(element: HTMLElement, reducedMotion = false): MascotController {
  const stage = document.createElement('div'); stage.className = 'sprite-mascot'; stage.setAttribute('role', 'img');
  const frame = document.createElement('div'); frame.className = 'mascot-layers';
  const images = LAYERS.map(name => {
    const img = document.createElement('img'); img.className = name; img.alt = ''; img.decoding = 'async'; img.draggable = false;
    img.srcset = sources(name); img.src = `/mascot/layers/${name}-384.png`; return img;
  });
  frame.append(...images); stage.append(frame); element.append(stage);
  // Pick the copy for the box's real device size, not the whole viewport.
  const fit = () => { const sizes = `${Math.max(1, Math.round(frame.offsetWidth))}px`; images.forEach(img => { img.sizes = sizes; }); };
  const observer = new ResizeObserver(fit); observer.observe(frame); fit();
  const eyes = images.filter(img => img.className.startsWith('eye')), arm = images[LAYERS.indexOf('arm')];
  let reduced = reducedMotion, visible = true, state: MascotState = 'idle';
  let blinkTimer: ReturnType<typeof setTimeout> | undefined, waveTimer: ReturnType<typeof setTimeout> | undefined;
  const awake = () => visible && !reduced && document.visibilityState === 'visible';
  const blink = () => {
    eyes.forEach(eye => eye.animate(BLINK, { duration: 270 }));
    if (Math.random() < .2) setTimeout(() => { if (awake()) eyes.forEach(eye => eye.animate(BLINK, { duration: 240 })); }, 330);
  };
  const nextBlink = () => { blinkTimer = setTimeout(() => { if (awake()) blink(); nextBlink(); }, 2600 + Math.random() * 3900); };
  // No wave while resting, on an error or while being dragged.
  const nextWave = (delay = 7000 + Math.random() * 4000) => { waveTimer = setTimeout(() => { if (awake() && !['resting', 'error', 'dragged'].includes(state)) arm.animate(WAVE, { duration: 2100 }); nextWave(); }, delay); };
  nextBlink(); nextWave(1500);
  const still = () => frame.getAnimations({ subtree: true }).forEach(a => a.cancel());
  const apply = (next: MascotState) => { state = next; stage.dataset.state = next; stage.setAttribute('aria-label', `AgentOffice mascot — ${labels[next]}`); };
  apply('idle');
  return {
    setState: apply,
    setPointer() {},
    setVisible(next) { visible = next; stage.style.visibility = next ? 'visible' : 'hidden'; if (!next) still(); },
    setReducedMotion(next) { reduced = next; if (next) still(); },
    dispose() { clearTimeout(blinkTimer); clearTimeout(waveTimer); observer.disconnect(); stage.remove(); },
  };
}
