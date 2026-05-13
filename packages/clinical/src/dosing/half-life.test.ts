import { describe, expect, it } from 'vitest';

import { decayActiveDose } from './half-life';

describe('decayActiveDose', () => {
  it('returns the original dose at t=0', () => {
    expect(decayActiveDose(36, 0, 100)).toBe(36);
  });

  it('halves the dose after one half-life', () => {
    expect(decayActiveDose(36, 100, 100)).toBeCloseTo(18);
  });

  it('quarters the dose after two half-lives', () => {
    expect(decayActiveDose(72, 60, 30)).toBeCloseTo(18);
  });

  it('approaches zero asymptotically over many half-lives', () => {
    const value = decayActiveDose(36, 1000, 100);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(0.05);
  });

  it('treats negative elapsed time as no decay', () => {
    expect(decayActiveDose(36, -10, 100)).toBe(36);
  });

  it('returns 0 for non-positive original doses', () => {
    expect(decayActiveDose(0, 30, 100)).toBe(0);
    expect(decayActiveDose(-5, 30, 100)).toBe(0);
  });

  it('rejects non-positive half-lives', () => {
    expect(() => decayActiveDose(36, 30, 0)).toThrow(RangeError);
    expect(() => decayActiveDose(36, 30, -10)).toThrow(RangeError);
  });
});
