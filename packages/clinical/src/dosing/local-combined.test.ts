import { describe, expect, it } from 'vitest';

import { localCombined, type LocalDose } from './local-combined';

const T0 = 1_700_000_000_000;

describe('localCombined', () => {
  it('returns an all-safe baseline with no doses', () => {
    const r = localCombined([], 180, T0);
    expect(r.combinedPercent).toBe(0);
    expect(r.severity).toBe('safe');
    expect(r.perDrug).toEqual([]);
  });

  it('returns safe when patient weight is missing or invalid', () => {
    const doses: LocalDose[] = [{ drugId: 'lidocaine-2-epi100k', carpules: 5, givenAt: T0 }];
    expect(localCombined(doses, 0, T0).combinedPercent).toBe(0);
    expect(localCombined(doses, -10, T0).combinedPercent).toBe(0);
  });

  it('classifies a single drug below 70% as safe', () => {
    // 80 kg patient (≈176 lb), lidocaine maxDose 7 mg/kg = 560 mg. 5 carpules
    // × 36 mg = 180 mg → ~32% at t=0.
    const r = localCombined(
      [{ drugId: 'lidocaine-2-epi100k', carpules: 5, givenAt: T0 }],
      176.37, // 80 kg
      T0,
    );
    expect(r.perDrug).toHaveLength(1);
    expect(r.perDrug[0]?.percent).toBeGreaterThan(30);
    expect(r.perDrug[0]?.percent).toBeLessThan(35);
    expect(r.severity).toBe('safe');
  });

  it('decays the active percentage over time using each drugs half-life', () => {
    // Septocaine half-life 30 min — at 30 min after dose, active mg halves.
    const doses: LocalDose[] = [{ drugId: 'septocaine-4-epi100k', carpules: 3, givenAt: T0 }];
    const att0 = localCombined(doses, 176.37, T0);
    const at30 = localCombined(doses, 176.37, T0 + 30 * 60_000);
    expect(at30.combinedPercent).toBeCloseTo(att0.combinedPercent / 2, 1);
  });

  it('sums percentages across drugs to compute the Malamed combined total', () => {
    const doses: LocalDose[] = [
      { drugId: 'lidocaine-2-epi100k', carpules: 5, givenAt: T0 },
      { drugId: 'septocaine-4-epi100k', carpules: 3, givenAt: T0 },
    ];
    const r = localCombined(doses, 176.37, T0);
    const sum = r.perDrug.reduce((a, d) => a + d.percent, 0);
    expect(r.combinedPercent).toBeCloseTo(sum);
  });

  it('flags combined load 70–89% as caution and 90%+ as limit', () => {
    // 80 kg patient, both lidocaine and septocaine (each 7 mg/kg = 560 mg).
    // Lidocaine 10 carp × 36 = 360 mg = ~64%
    // Septocaine 3 carp × 72 = 216 mg = ~38%
    // Combined ~102% → limit
    const doses: LocalDose[] = [
      { drugId: 'lidocaine-2-epi100k', carpules: 10, givenAt: T0 },
      { drugId: 'septocaine-4-epi100k', carpules: 3, givenAt: T0 },
    ];
    const r = localCombined(doses, 176.37, T0);
    expect(r.combinedPercent).toBeGreaterThan(100);
    expect(r.severity).toBe('limit');
  });

  it('groups multiple doses of the same drug into one perDrug entry', () => {
    const doses: LocalDose[] = [
      { drugId: 'lidocaine-2-epi100k', carpules: 2, givenAt: T0 },
      { drugId: 'lidocaine-2-epi100k', carpules: 3, givenAt: T0 + 5 * 60_000 },
    ];
    const r = localCombined(doses, 176.37, T0 + 10 * 60_000);
    expect(r.perDrug).toHaveLength(1);
    expect(r.perDrug[0]?.carpulesGiven).toBe(5);
  });

  it('ignores unknown drug ids and non-positive carpule counts', () => {
    const doses: LocalDose[] = [
      { drugId: 'made-up-drug', carpules: 99, givenAt: T0 },
      { drugId: 'lidocaine-2-epi100k', carpules: 0, givenAt: T0 },
      { drugId: 'lidocaine-2-epi100k', carpules: -2, givenAt: T0 },
    ];
    const r = localCombined(doses, 176.37, T0);
    expect(r.perDrug).toEqual([]);
    expect(r.combinedPercent).toBe(0);
  });
});
