import { describe, expect, it } from 'vitest';

import { bmiFromImperial, bmiFromMetric, classifyBmi } from './bmi';

describe('bmiFromImperial', () => {
  it('computes BMI from pounds and inches', () => {
    const r = bmiFromImperial(180, 70);
    // 180 / 70² × 703 = 25.824…
    expect(r?.value).toBeCloseTo(25.82, 1);
    expect(r?.category).toBe('overweight');
  });

  it('returns null for missing or invalid inputs', () => {
    expect(bmiFromImperial(0, 70)).toBeNull();
    expect(bmiFromImperial(180, 0)).toBeNull();
    expect(bmiFromImperial(Number.NaN, 70)).toBeNull();
  });
});

describe('bmiFromMetric', () => {
  it('computes BMI from kg and cm', () => {
    const r = bmiFromMetric(70, 175);
    expect(r?.value).toBeCloseTo(22.86, 2);
    expect(r?.category).toBe('normal');
  });

  it('returns null for missing inputs', () => {
    expect(bmiFromMetric(0, 175)).toBeNull();
    expect(bmiFromMetric(70, 0)).toBeNull();
  });
});

describe('classifyBmi', () => {
  it('uses the standard CDC thresholds', () => {
    expect(classifyBmi(17)).toBe('underweight');
    expect(classifyBmi(18.5)).toBe('normal');
    expect(classifyBmi(24.9)).toBe('normal');
    expect(classifyBmi(25)).toBe('overweight');
    expect(classifyBmi(29.9)).toBe('overweight');
    expect(classifyBmi(30)).toBe('obese');
    expect(classifyBmi(39.9)).toBe('obese');
    expect(classifyBmi(40)).toBe('severe');
    expect(classifyBmi(55)).toBe('severe');
  });
});
