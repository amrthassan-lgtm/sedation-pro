import { describe, expect, it } from 'vitest';

import { ivSedationStatus, versedCeilingMg } from './iv-ceiling';

describe('versedCeilingMg', () => {
  it('returns the base 15 mg ceiling when no opioid is on board', () => {
    expect(versedCeilingMg(false)).toBe(15);
  });

  it('reduces the Versed ceiling 30% when fentanyl/opioid is on board', () => {
    expect(versedCeilingMg(true)).toBeCloseTo(10.5);
  });

  it('honours a custom synergy reduction', () => {
    const reduced = versedCeilingMg(true, {
      versedMaxMg: 20,
      fentanylMaxMcg: 200,
      benzoOpioidSynergyReduction: 0.5,
    });
    expect(reduced).toBe(10);
  });

  it('clamps invalid reduction values into the safe range', () => {
    expect(
      versedCeilingMg(true, {
        versedMaxMg: 10,
        fentanylMaxMcg: 100,
        benzoOpioidSynergyReduction: -1,
      }),
    ).toBe(10);
    const result = versedCeilingMg(true, {
      versedMaxMg: 10,
      fentanylMaxMcg: 100,
      benzoOpioidSynergyReduction: 2,
    });
    expect(result).toBeCloseTo(0.01, 5);
  });
});

describe('ivSedationStatus', () => {
  it('reports an all-safe baseline at zero dose', () => {
    const s = ivSedationStatus(0, 0);
    expect(s.versed.severity).toBe('safe');
    expect(s.fentanyl.severity).toBe('safe');
    expect(s.combined.severity).toBe('safe');
    expect(s.combined.percent).toBe(0);
  });

  it('uses the synergy-reduced Versed ceiling when fentanyl is on board', () => {
    const s = ivSedationStatus(10, 25);
    // 10 mg of a 10.5 mg ceiling → ~95.2%
    expect(s.versed.ceiling).toBeCloseTo(10.5);
    expect(s.versed.percent).toBeCloseTo((10 / 10.5) * 100);
  });

  it('classifies Versed at 70%+ as caution and 90%+ as limit', () => {
    expect(ivSedationStatus(10.5, 0).versed.severity).toBe('caution');
    expect(ivSedationStatus(13.6, 0).versed.severity).toBe('limit');
  });

  it('classifies the combined load using the average of both percentages', () => {
    // Synergy: 50 mcg Fentanyl on board ⇒ Versed ceiling = 10.5 mg
    // 7.5 mg / 10.5 mg = ~71.4 %
    // 50 mcg / 100 mcg = 50 %
    const s = ivSedationStatus(7.5, 50);
    expect(s.versed.percent).toBeCloseTo(71.4, 1);
    expect(s.fentanyl.percent).toBe(50);
    expect(s.combined.percent).toBeCloseTo((s.versed.percent + s.fentanyl.percent) / 2);
    expect(s.combined.severity).toBe('safe');
  });

  it('caps reported percentages at 200% so over-limit displays stay bounded', () => {
    const s = ivSedationStatus(100, 1000);
    expect(s.versed.percent).toBeLessThanOrEqual(200);
    expect(s.fentanyl.percent).toBeLessThanOrEqual(200);
  });
});
