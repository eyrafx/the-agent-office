import type { MascotState } from '../shared/contract';
import { EYE_BASE, JOINT_LIMITS, REST_JOINTS, type MascotRig } from './model';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Deterministic poses and damped transitions. No clocks or WebGL are needed by the rig. */
export class MascotMotion {
  private state: MascotState = 'idle';
  private elapsed = 0;
  private phase = 0;
  private pointer = { x: 0, y: 0 };
  constructor(private readonly rig: MascotRig) {}
  setState(state: MascotState): void { if (this.state !== state) { this.state = state; this.elapsed = 0; } }
  setPointer(x: number, y: number): void {
    this.pointer = { x: Number.isFinite(x) ? clamp(x, -1, 1) : 0, y: Number.isFinite(y) ? clamp(y, -1, 1) : 0 };
  }
  update(delta: number, reduced = false): void {
    const dt = Number.isFinite(delta) ? clamp(delta, 0, .05) : 0;
    if (!reduced) { this.elapsed += dt; this.phase += dt; }
    const t = reduced ? 0 : this.phase, age = reduced ? 0 : this.elapsed;
    const blend = reduced ? 1 : 1 - Math.exp(-dt * 8);
    const approach = (from: number, to: number) => reduced ? to : from + (to - from) * blend;
    const { root, head, body, eyes, arms } = this.rig;
    const resting = this.state === 'resting', dragged = this.state === 'dragged';
    root.position.y = approach(root.position.y, resting ? -.12 : dragged ? .14 : .012 * Math.sin(t * 1.7));
    root.rotation.z = approach(root.rotation.z, dragged ? .12 + .035 * Math.sin(t * 3) : this.state === 'error' ? .04 : 0);
    const replyNod = this.state === 'replyEnded' && age < 1.5 ? Math.sin(age * Math.PI / 1.5) * .19 : 0;
    head.rotation.y = approach(head.rotation.y, this.pointer.x * .21);
    head.rotation.x = approach(head.rotation.x, resting ? .19 : -this.pointer.y * .09 + replyNod);
    head.rotation.z = approach(head.rotation.z, this.state === 'waiting' ? -.06 : this.state === 'error' ? .09 : .012 * Math.sin(t));
    body.rotation.y = approach(body.rotation.y, this.state === 'working' ? Math.sin(t * 1.8) * .035 : 0);
    const blinkPhase = t % 4.9;
    const blink = !reduced && blinkPhase > 4.65 ? Math.max(.06, Math.abs(blinkPhase - 4.775) / .125) : 1;
    eyes.forEach((eye, i) => {
      eye.position.x = (i ? EYE_BASE.x : -EYE_BASE.x) + this.pointer.x * .045;
      eye.position.y = EYE_BASE.y + this.pointer.y * .035;
      const open = resting ? .14 : this.state === 'error' ? .6 : this.state === 'working' ? .78 : 1;
      eye.scale.y = reduced ? open : approach(eye.scale.y, open) * blink;
      eye.rotation.z = approach(eye.rotation.z, this.state === 'error' ? (i ? -.3 : .3) : 0);
    });
    arms.forEach((arm, i) => {
      const target: number[] = [...REST_JOINTS];
      target[0] += [0, -.06, -.14, .03, .02, -.12, -.2, -.05][i];
      target[1] += [0, .13, -.12, .08, -.04, .08, -.14, .09][i];
      target[2] += [0, -.13, .14, -.12, .1, -.08, .12, -.11][i];
      if (this.state === 'working') {
        const wave = reduced ? 0 : Math.sin(t * 3.1 + i * Math.PI / 2);
        target[0] += .07 * wave; target[1] += .14 * wave; target[2] -= .12 * wave;
      } else if (this.state === 'waiting' && i === 0) {
        target[0] = -.5; target[1] = .6; target[2] = .7 + (reduced ? 0 : .12 * Math.sin(t * 2.3));
      } else if (this.state === 'replyEnded' && i === 0 && (reduced || age < 1.9)) {
        const salute = reduced ? 1 : Math.sin(Math.min(1, age / 1.9) * Math.PI);
        target[0] += .9 * salute; target[1] += 1.5 * salute; target[2] += .6 * salute;
      } else if (this.state === 'resting') {
        // Tentacles droop and lie flat, tips only lightly curled.
        target[0] = -2.25; target[1] = .1; target[2] = .9;
      } else if (this.state === 'dragged') {
        // Hanging: arms trail downward and sway.
        target[0] = -2.3; target[1] = .15 + .12 * Math.sin(t * 3 + i); target[2] = .8;
      } else if (this.state === 'error' && (i === 0 || i === 4)) {
        // Two tentacles thrown up.
        target[0] = -.6; target[1] = -.3; target[2] = .6;
      } else if (this.state === 'idle') {
        target[1] += reduced ? 0 : .017 * Math.sin(t * 1.4 + i);
        // One tentacle raised in a loose wave.
        if (i === 0) { target[0] = -.85; target[1] = .55; target[2] = .9; }
      }
      arm.joints.forEach((joint, j) => {
        joint.rotation.z = clamp(approach(joint.rotation.z, target[j]), JOINT_LIMITS[j][0], JOINT_LIMITS[j][1]);
      });
    });
  }
}
