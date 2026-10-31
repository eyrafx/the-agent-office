import { describe, it, expect } from 'vitest';
import { nextRing, repeatDays, repeatOf } from '../src/notch/alarms';
import { nextReminder, WATER_DEFAULTS, type WaterDoc } from '../src/notch/water';
import { fileKind, sizeText } from '../src/notch/shelf';
import { cleanNotes } from '../src/notch/notes';

// A local moment: Wednesday 28 October 2026, at the hour and minute given.
const wed = (h: number, m = 0) => new Date(2026, 9, 28, h, m, 0, 0);

describe('alarm days', () => {
  it('keeps a choice of days plainly, and reads it back', () => {
    expect(repeatOf([])).toBe('once');
    expect(repeatOf([4, 0, 1, 2, 3])).toBe('weekdays');
    expect(repeatOf([0, 1, 2, 3, 4, 5, 6])).toBe('daily');
    expect(repeatOf([5, 2, 2])).toBe('days:2,5');
    expect(repeatDays('days:2,5')).toEqual([2, 5]);
    expect(repeatDays('weekdays')).toEqual([0, 1, 2, 3, 4]);
    expect(repeatDays('once')).toEqual([]);
    // A weekly one repeats on its own day (a Wednesday here).
    expect(repeatDays('weekly', '2026-10-28T09:00')).toEqual([2]);
  });
  it('says when it rings next, on the days chosen', () => {
    // Weekdays 07:30, seen on Wednesday at 08:00: Thursday.
    expect(nextRing('07:30', [0, 1, 2, 3, 4], wed(8))).toEqual(new Date(2026, 9, 29, 7, 30));
    // Weekends only: Saturday.
    expect(nextRing('07:30', [5, 6], wed(8))).toEqual(new Date(2026, 9, 31, 7, 30));
    // No day: once, today while it is still ahead.
    expect(nextRing('22:00', [], wed(8))).toEqual(new Date(2026, 9, 28, 22, 0));
  });
});

describe('water reminder', () => {
  const doc = (over: Partial<WaterDoc>): WaterDoc => ({ ...WATER_DEFAULTS, remind: true, ...over });
  it('is none while reminders are off', () => { expect(nextReminder({ ...WATER_DEFAULTS }, wed(10).getTime())).toBeNull(); });
  it('comes `every` minutes after the last drink, within the hours chosen', () => {
    expect(nextReminder(doc({ log: [{ at: wed(10).getTime(), ml: 250 }] }), wed(10, 30).getTime())).toBe(wed(11, 30).getTime());
    // Nothing drunk yet: the first one is `every` after the day's start.
    expect(nextReminder(doc({}), wed(9, 5).getTime())).toBe(wed(10, 30).getTime());
  });
  it('waits for the next day past the hours or with the goal reached', () => {
    expect(nextReminder(doc({ log: [{ at: wed(21).getTime(), ml: 250 }] }), wed(21, 10).getTime())).toBe(new Date(2026, 9, 29, 10, 30).getTime());
    expect(nextReminder(doc({ goal: 500, log: [{ at: wed(10).getTime(), ml: 500 }] }), wed(10, 30).getTime())).toBe(new Date(2026, 9, 29, 10, 30).getTime());
  });
});

describe('shelf and notes', () => {
  it('names a file by its kind', () => {
    expect(fileKind('Teklif.PDF')).toMatchObject({ label: 'PDF' });
    expect(fileKind('foto.jpeg').label).toBe('JPEG');
    expect(fileKind('Belgeler', true).label).toBe('');
    expect(fileKind('README').label).toBe('');
  });
  it('writes sizes with the decimal mark of the language', () => {
    expect(sizeText(2_400_000)).toBe('2,3 MB');
    expect(sizeText(2_400_000, 'en-GB')).toBe('2.3 MB');
    expect(sizeText(42_000)).toBe('41 KB');
  });
  it('trusts only known note fields', () => {
    const [x] = cleanNotes({ items: [{ id: 'a', text: 'Not', kind: 'note', done: true, due: '2026-10-28T09:00', created: 1, updated: 2 }] });
    expect(x).toEqual({ id: 'a', text: 'Not', kind: 'note', done: false, created: 1, updated: 2 });
  });
});
