import { describe, expect, it } from 'vitest';

import { classifyBp } from './bp';

describe('classifyBp', () => {
  it('classifies normal BP (< 120 / < 80)', () => {
    const r = classifyBp(115, 75);
    expect(r?.category).toBe('normal');
    expect(r?.severity).toBe('safe');
  });

  it('classifies elevated (120-129 / < 80)', () => {
    expect(classifyBp(125, 78)?.category).toBe('elevated');
  });

  it('classifies stage 1 hypertension (130-139 or 80-89)', () => {
    expect(classifyBp(135, 78)?.category).toBe('stage-1');
    expect(classifyBp(118, 85)?.category).toBe('stage-1');
  });

  it('classifies stage 2 hypertension (≥ 140 or ≥ 90)', () => {
    const r = classifyBp(150, 88);
    expect(r?.category).toBe('stage-2');
    expect(r?.severity).toBe('caution');
  });

  it('upgrades stage 2 severity to limit when SBP > 159 or DBP > 99', () => {
    expect(classifyBp(160, 88)?.severity).toBe('limit');
    expect(classifyBp(145, 100)?.severity).toBe('limit');
  });

  it('classifies hypertensive crisis at 180/120 and above', () => {
    expect(classifyBp(185, 110)?.category).toBe('crisis');
    expect(classifyBp(160, 125)?.category).toBe('crisis');
    expect(classifyBp(185, 110)?.severity).toBe('crisis');
  });

  it('returns null for missing or invalid readings', () => {
    expect(classifyBp(0, 80)).toBeNull();
    expect(classifyBp(120, 0)).toBeNull();
    expect(classifyBp(Number.NaN, 80)).toBeNull();
  });
});
