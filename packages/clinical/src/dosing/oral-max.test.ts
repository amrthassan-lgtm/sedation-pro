import { describe, expect, it } from 'vitest';

import { lorazepamMax, triazolamMax } from './oral-max';

describe('triazolamMax', () => {
  it('returns weightLb/100 mg for normal weights', () => {
    expect(triazolamMax(150)?.mg).toBeCloseTo(1.5);
    expect(triazolamMax(180)?.mg).toBeCloseTo(1.8);
  });

  it('caps at 200 lb so the max dose is 2 mg', () => {
    expect(triazolamMax(220)?.mg).toBe(2);
    expect(triazolamMax(400)?.mg).toBe(2);
  });

  it('computes whole 0.25 mg tablets via floor', () => {
    expect(triazolamMax(100)?.tablets).toBe(4); // 1.0 mg = 4 tabs
    expect(triazolamMax(125)?.tablets).toBe(5); // 1.25 mg = 5 tabs
    expect(triazolamMax(124)?.tablets).toBe(4); // 1.24 mg = 4 tabs (floored)
  });

  it('returns null for non-positive or non-finite weights', () => {
    expect(triazolamMax(0)).toBeNull();
    expect(triazolamMax(-10)).toBeNull();
    expect(triazolamMax(Number.NaN)).toBeNull();
  });
});

describe('lorazepamMax', () => {
  it('returns weightLb/25 mg with no cap', () => {
    expect(lorazepamMax(150)?.mg).toBeCloseTo(6);
    expect(lorazepamMax(50)?.mg).toBeCloseTo(2);
  });

  it('computes whole 2 mg tablets via floor', () => {
    expect(lorazepamMax(50)?.tablets).toBe(1); // 2.0 mg = 1 tab
    expect(lorazepamMax(100)?.tablets).toBe(2); // 4.0 mg = 2 tabs
    expect(lorazepamMax(125)?.tablets).toBe(2); // 5.0 mg = 2 tabs (floored)
  });

  it('returns null for non-positive or non-finite weights', () => {
    expect(lorazepamMax(0)).toBeNull();
    expect(lorazepamMax(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
