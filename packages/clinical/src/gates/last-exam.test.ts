import { describe, expect, it } from 'vitest';

import { lastExamCheck, lastExamCutoffMonths } from './last-exam';

describe('lastExamCutoffMonths', () => {
  it('returns 24 months under 50', () => {
    expect(lastExamCutoffMonths(20)).toBe(24);
    expect(lastExamCutoffMonths(49)).toBe(24);
    expect(lastExamCutoffMonths(49.9)).toBe(24);
  });

  it('returns 12 months from 50 through 59', () => {
    expect(lastExamCutoffMonths(50)).toBe(12);
    expect(lastExamCutoffMonths(55)).toBe(12);
    expect(lastExamCutoffMonths(59.5)).toBe(12);
  });

  it('returns 6 months at 60 and above', () => {
    expect(lastExamCutoffMonths(60)).toBe(6);
    expect(lastExamCutoffMonths(85)).toBe(6);
  });

  it('falls back to the most generous tier on bad input', () => {
    expect(lastExamCutoffMonths(Number.NaN)).toBe(24);
  });
});

describe('lastExamCheck', () => {
  const NOW = new Date('2026-05-13T00:00:00Z');

  it('treats a missing exam date as invalid', () => {
    expect(lastExamCheck(null, 45, NOW).valid).toBe(false);
    expect(lastExamCheck(undefined, 45, NOW).valid).toBe(false);
  });

  it('accepts a 12-month-old exam for a 40-year-old (24-mo tier)', () => {
    const oneYearAgo = new Date('2025-05-13T00:00:00Z');
    expect(lastExamCheck(oneYearAgo, 40, NOW).valid).toBe(true);
  });

  it('rejects a 14-month-old exam for a 55-year-old (12-mo tier)', () => {
    const fourteenMonthsAgo = new Date('2025-03-13T00:00:00Z');
    const r = lastExamCheck(fourteenMonthsAgo, 55, NOW);
    expect(r.valid).toBe(false);
    expect(r.cutoffMonths).toBe(12);
  });

  it('rejects an 8-month-old exam for a 70-year-old (6-mo tier)', () => {
    const eightMonthsAgo = new Date('2025-09-13T00:00:00Z');
    const r = lastExamCheck(eightMonthsAgo, 70, NOW);
    expect(r.valid).toBe(false);
    expect(r.cutoffMonths).toBe(6);
  });

  it('accepts an exam right at the cutoff for the patient age', () => {
    const sixMonthsAgo = new Date('2025-11-13T00:00:00Z');
    expect(lastExamCheck(sixMonthsAgo, 70, NOW).valid).toBe(true);
  });
});
