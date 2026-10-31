import { describe, expect, it } from 'vitest';
import { baseLook, CLIP_MS, finishedAgents, gazeAt, lookFile, MASCOT_TIMES, workingNow } from '../src/mascot/still';
import type { Session, SessionStatus, Snapshot } from '../src/shared/contract';

const session = (id: string, status: SessionStatus) => ({ key: { provider: 'claude', hostId: 'h', sessionId: id }, status }) as unknown as Session;
const snap = (...sessions: Session[]) => ({ sessions, requests: [] }) as unknown as Snapshot;

describe('Ada, the mascot', () => {
  it('shows one clip or still per lasting state; idle rests on the still only after a long quiet spell', () => {
    expect(baseLook('idle', 0)).toBe('idle');
    expect(baseLook('idle', MASCOT_TIMES.sleepyAfter - 1)).toBe('idle');
    expect(baseLook('idle', MASCOT_TIMES.sleepyAfter)).toBe('look-center');
    expect(baseLook('working', MASCOT_TIMES.sleepyAfter * 2)).toBe('idle');
    expect(baseLook('waiting', 0)).toBe('plead');
    expect(baseLook('error', 0)).toBe('plead');
    expect(baseLook('resting', 0)).toBe('look-center');
    expect(baseLook('dragged', 0)).toBe('look-up-left');
    expect(MASCOT_TIMES.sleepyAfter).toBeGreaterThanOrEqual(10 * 60_000);
  });
  it('shows only stills with reduced motion', () => {
    for (const state of ['idle', 'working', 'waiting', 'error', 'resting'] as const) expect(baseLook(state, 0, true)).toBe('look-center');
    expect(baseLook('dragged', 0, true)).toBe('look-up-left');
  });
  it('looks toward the cursor resting on it, with the gaze stills there are', () => {
    expect(gazeAt(0, 0)).toBe('look-center');
    expect(gazeAt(-.8, .3)).toBe('look-left');
    expect(gazeAt(-.8, -.6)).toBe('look-up-left');
    expect(gazeAt(.8, -.6)).toBe('look-right');
    expect(gazeAt(.1, -.9)).toBe('look-center');
  });
  it('picks the 512 px files from 1.5× pixel density up', () => {
    expect(lookFile('idle', 1)).toBe('/mascot/ada/idle-256.webp');
    expect(lookFile('plead', 1.25)).toBe('/mascot/ada/plead-256.webp');
    expect(lookFile('plead', 1.5)).toBe('/mascot/ada/plead-512.webp');
    expect(lookFile('look-center', 2)).toBe('/mascot/ada/look-center-512.png');
  });
  it('is glad when an agent that was working has finished its reply, not when it stops on an error or a question', () => {
    const before = workingNow(snap(session('a', 'working'), session('b', 'idle')));
    expect([...before]).toHaveLength(1);
    expect(finishedAgents(before, snap(session('a', 'replyEnded'), session('b', 'idle')))).toBe(true);
    expect(finishedAgents(before, snap(session('a', 'working'), session('b', 'replyEnded')))).toBe(false);
    expect(finishedAgents(before, snap(session('a', 'error')))).toBe(false);
    expect(finishedAgents(before, snap(session('a', 'waiting')))).toBe(false);
  });
  it('ships every clip and still it shows, at both sizes', () => {
    const files = Object.keys(import.meta.glob('../public/mascot/ada/*')).map(p => p.split('/').pop());
    for (const look of [...Object.keys(CLIP_MS), 'plead-hold', 'look-center', 'look-left', 'look-right', 'look-up-left'] as const)
      for (const dpr of [1, 2]) expect(files).toContain(lookFile(look as never, dpr).split('/').pop());
  });
});
