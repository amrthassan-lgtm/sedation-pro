import { describe, expect, it } from 'vitest';

import { fmtClock, fmtDuration, nowClock } from './format';

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
