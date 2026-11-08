import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fmtClock, fmtDuration, nowClock, parseCalendarDay } from './format';

describe('format', () => {
  it('fmtClock renders hours and minutes and is empty for no timestamp', () => {
    const noon = new Date(2026, 0, 1, 12, 5).getTime();
    expect(fmtClock(noon)).toMatch(/12:05/);
    expect(fmtClock(null)).toBeUndefined();
    expect(fmtClock(undefined)).toBeUndefined();
  });

  it('nowClock has the same shape as fmtClock(Date.now())', () => {
    expect(nowClock()).toMatch(/\d{1,2}:\d{2}/);
  });

  it('fmtDuration pads seconds and floors negatives to zero', () => {
    expect(fmtDuration(0)).toBe('0:00');
    expect(fmtDuration(65)).toBe('1:05');
    expect(fmtDuration(600)).toBe('10:00');
    expect(fmtDuration(-4)).toBe('0:00');
    expect(fmtDuration(59.9)).toBe('0:59');
  });
});

describe('parseCalendarDay (Florida time)', () => {
  const realTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = realTz;
  });

  it('keeps a YYYY-MM-DD on its own calendar day, where new Date() slips to the day before', () => {
    expect(new Date('2024-11-28').getDate()).toBe(27); // the bug this guards against
    const d = parseCalendarDay('2024-11-28');
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2024, 11, 28]);
    expect(d.getHours()).toBe(0);
  });

  it('keeps month boundaries: the 1st stays the 1st', () => {
    const d = parseCalendarDay('2026-03-01');
    expect([d.getMonth() + 1, d.getDate()]).toEqual([3, 1]);
  });

  it('passes other strings through and flags garbage as invalid', () => {
    expect(parseCalendarDay('2026-11-08T14:30:00Z').toISOString()).toBe('2026-11-08T14:30:00.000Z');
    expect(Number.isNaN(parseCalendarDay('not a date').getTime())).toBe(true);
  });
});
