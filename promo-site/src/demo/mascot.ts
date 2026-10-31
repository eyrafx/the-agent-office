// The island's mascot as the app shows it: the approved sprite (still.ts), never the three.js rig.
import type { MascotController } from '@app/mascot/renderer';
import { createStillMascot } from '@app/mascot/still';
export type { MascotController };
export function createMascot(element: HTMLElement, options: { compact?: boolean; reducedMotion?: boolean } = {}): MascotController {
  return createStillMascot(element, options.reducedMotion);
}
