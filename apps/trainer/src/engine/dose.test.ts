import { describe, expect, it } from 'vitest';
import { EMERGENCY_PROTOCOLS } from '@sedation-pro/clinical';

import { formatMass, parseConcentrationMcgPerMl, parseDoseRange, toMcg } from './dose';

describe('reading the protocols own dose strings', () => {
  it('parses single values and ranges in every mass unit', () => {
    expect(parseDoseRange('125 mg')).toEqual({ minMcg: 125_000, maxMcg: 125_000, unit: 'mg' });
    expect(parseDoseRange('0.4-2 mg')).toEqual({ minMcg: 400, maxMcg: 2_000, unit: 'mg' });
    expect(parseDoseRange('10-20 mcg')).toEqual({ minMcg: 10, maxMcg: 20, unit: 'mcg' });
    expect(parseDoseRange('25 g')).toEqual({ minMcg: 25_000_000, maxMcg: 25_000_000, unit: 'g' });
  });

  it('declines doses that are not a plain mass', () => {
    expect(parseDoseRange('4-8 puffs')).toBeNull();
    expect(parseDoseRange('0.6 mg/lb')).toBeNull();
  });

  it('takes the first concentration from a labelled string', () => {
    expect(parseConcentrationMcgPerMl('0.4 mg/ml')).toBe(400);
    expect(parseConcentrationMcgPerMl('10 mcg/ml (after dilution)')).toBe(10);
    expect(parseConcentrationMcgPerMl('0.1 mg/ml (0.5 mg/5 ml vial)')).toBe(100);
    expect(parseConcentrationMcgPerMl('1 mg/ml vial or 1 mg/10 ml prefilled')).toBe(1_000);
    expect(parseConcentrationMcgPerMl(undefined)).toBeNull();
  });

  it('every injectable callout with a single-drug volume agrees with dose / concentration', () => {
    // The trainer grades by mass. This holds the protocols' three numbers
    // (dose, concentration, volume) together, so mass and volume can never
    // disagree about what a correct draw is.
    let checked = 0;
    for (const p of EMERGENCY_PROTOCOLS) {
      for (const step of p.steps) {
        const d = step.drug;
        if (!d?.volume || d.drawTable !== undefined) continue;
        const range = parseDoseRange(d.dose);
        const conc = parseConcentrationMcgPerMl(d.concentration);
        const ml = /^([\d.]+) ml/.exec(d.volume);
        if (range === null || conc === null || !ml || range.minMcg !== range.maxMcg) continue;
        expect(Number(ml[1]) * conc, `${p.id} ${d.name}`).toBeCloseTo(range.minMcg, 6);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(8);
  });

  it('formats a mass in the unit a clinician would say', () => {
    expect(formatMass(400)).toBe('400 mcg');
    expect(formatMass(1_200)).toBe('1.2 mg');
    expect(formatMass(toMcg(20, 'mg'))).toBe('20 mg');
    expect(formatMass(15)).toBe('15 mcg');
  });

  it('chooses the unit after rounding, so float noise never reads as 1000 mcg', () => {
    expect(formatMass(999.9999999999999)).toBe('1 mg');
    expect(formatMass(999_999.9999)).toBe('1 g');
    expect(formatMass(999.4)).toBe('999.4 mcg');
  });
});
