import { describe, expect, it } from 'vitest';

import { fmtClock, fmtStoryClock } from './time';

describe('clocks', () => {
  it('formats the run clock as m:ss', () => {
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(65.9)).toBe('1:05');
    expect(fmtClock(-3)).toBe('0:00');
  });

  it('formats the story clock from the scenario start', () => {
    expect(fmtStoryClock(10 * 60 + 42, 0, false)).toBe('10:42 AM');
    expect(fmtStoryClock(10 * 60 + 42, 67, true)).toBe('10:43:07 AM');
    expect(fmtStoryClock(11 * 60 + 58, 180, false)).toBe('12:01 PM');
    expect(fmtStoryClock(0, 0, false)).toBe('12:00 AM');
  });
});
