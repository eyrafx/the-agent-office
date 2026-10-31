import { describe, expect, it } from 'vitest';
import { clockOf, fromShown, nextAt, roundedNow, toShown } from '../src/notch/alarms';

describe('a new alarm\'s time', () => {
  it('is now, rounded up to the next five minutes', () => {
    expect(roundedNow(new Date(2026, 9, 28, 18, 24, 10))).toBe('18:25');
    expect(roundedNow(new Date(2026, 9, 28, 18, 25, 0))).toBe('18:30');
    expect(roundedNow(new Date(2026, 9, 28, 18, 21))).toBe('18:25');
    expect(roundedNow(new Date(2026, 9, 28, 23, 58))).toBe('00:00');
  });
  it('rings at the next such moment (tomorrow when it has passed today)', () => {
    const now = new Date(2026, 9, 28, 23, 58);
    expect(nextAt(roundedNow(now), now)).toBe('2026-10-29T00:00');
    const noon = new Date(2026, 9, 28, 12, 2);
    expect(nextAt(roundedNow(noon), noon)).toBe('2026-10-28T12:05');
  });
});

describe('the clock of each language', () => {
  it('is 12-hour where the locale writes it so, with its own words for the halves of the day', () => {
    expect(clockOf('en-US')).toMatchObject({ h12: true, am: 'AM', pm: 'PM' });
    expect(clockOf('ko-KR')).toMatchObject({ h12: true, am: '오전', pm: '오후' });
    for (const l of ['tr-TR', 'de-DE', 'fr-FR', 'es-ES', 'pt-BR', 'it-IT', 'ru-RU', 'ja-JP', 'zh-CN']) expect(clockOf(l).h12, l).toBe(false);
  });
  it('shows the hour 1–12 on a 12-hour clock and keeps the value 24-hour', () => {
    expect([0, 7, 12, 13, 23].map(h => toShown(h, true))).toEqual([{ hour: 12, pm: false }, { hour: 7, pm: false }, { hour: 12, pm: true }, { hour: 1, pm: true }, { hour: 11, pm: true }]);
    expect([[12, false], [7, false], [12, true], [1, true], [11, true]].map(([h, pm]) => fromShown(h as number, pm as boolean, true))).toEqual([0, 7, 12, 13, 23]);
    expect(fromShown(25, false, false)).toBe(23); expect(fromShown(0, false, true)).toBe(0);
    expect(toShown(18, false)).toEqual({ hour: 18, pm: true });
  });
});
