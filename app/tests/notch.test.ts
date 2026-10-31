import { setLanguage, t } from '../src/i18n';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CLOSE_TOLERANCE_MS, createNotchController } from '../src/notch/controller';
afterEach(() => vi.useRealTimers());
describe('notch hover and pin', () => {
  it('opens on first contact and closes only after the short tolerance', () => {
    vi.useFakeTimers(); const changed = vi.fn(); const fsm = createNotchController(changed);
    fsm.enter(); expect(changed).toHaveBeenLastCalledWith(true);
    fsm.leave(); vi.advanceTimersByTime(CLOSE_TOLERANCE_MS - 1); expect(fsm.expanded).toBe(true);
    vi.advanceTimersByTime(1); expect(fsm.expanded).toBe(false); fsm.dispose();
  });
  it('cancels closing on reenter (crossing to the limits panel) and stays open while pinned', () => {
    vi.useFakeTimers(); const fsm = createNotchController(() => {}); fsm.open(); fsm.leave();
    vi.advanceTimersByTime(CLOSE_TOLERANCE_MS - 40); fsm.enter(); vi.advanceTimersByTime(600); expect(fsm.expanded).toBe(true);
    fsm.pin(); fsm.leave(); vi.advanceTimersByTime(1000); expect(fsm.expanded).toBe(true);
    fsm.pin(); fsm.leave(); vi.advanceTimersByTime(CLOSE_TOLERANCE_MS); expect(fsm.expanded).toBe(false);
    fsm.dispose();
  });
});
import { renderLimits, windowView } from '../src/notch/limits';
setLanguage('tr'); const l = t;
describe('limits panel data', () => {
  it('shows a reading only while its window has not reset', () => {
    const now = Date.UTC(2026, 9, 22, 12);
    expect(windowView({ windowMinutes: 300, usedPercent: 28, resetsAt: now + 3600000 }, now, l, 'tr-TR')).toMatchObject({ label: '5 saat', value: '%28 kullanıldı', left: '%72 kaldı', percent: 28 });
    expect(windowView({ windowMinutes: 10080, usedPercent: 90, resetsAt: now - 1 }, now, l, 'tr-TR')).toMatchObject({ label: 'Hafta', value: 'Yenilendi', percent: null });
  });
  it('names model windows and says when each resets', () => {
    const now = Date.UTC(2026, 9, 22, 12);
    const fable = windowView({ windowMinutes: 10080, usedPercent: 41, resetsAt: now + (2 * 24 + 3) * 3600000, model: 'Fable' }, now, l, 'tr-TR');
    expect(fable.label).toBe('Hafta · Fable');
    expect(fable.detail).toContain('2 gün 3 sa. sonra');
    expect(windowView({ windowMinutes: 300, usedPercent: 12, resetsAt: now + 134 * 60000 }, now, l, 'tr-TR').detail).toContain('2 sa. 14 dk. sonra sıfırlanır');
  });
  it('never invents data for a source without readings or in demo mode', () => {
    const base = { schemaVersion: 1 as const, revision: 1, sessions: [], requests: [], history: [], connections: [] };
    const live = renderLimits({ ...base, mode: 'live', limits: [{ provider: 'codex', windows: [{ windowMinutes: 300, usedPercent: 4 }], updatedAt: 0, source: 'test' }] }, l, 'tr-TR', 60000);
    expect(live).toContain('Claude limitleri okunuyor');
    expect(live).toContain('%4 kullanıldı');
    expect(renderLimits({ ...base, mode: 'demo', limits: [{ provider: 'codex', windows: [{ windowMinutes: 300, usedPercent: 4 }], updatedAt: 0, source: 'test' }] }, l, 'tr-TR')).not.toContain('%4');
  });
});
