import { describe, expect, it } from 'vitest';

import {
  PHASE1_CONDITIONAL_GLUCOSE,
  PHASE1_REQUIRED_FIELDS,
  phase1Completeness,
} from './phase1-completeness';

const ALL_FILLED: Record<string, unknown> = {
  pt: 'Jane Doe',
  mrn: '123456',
  prov: 'Dr. Hassan',
  care_name: 'John Doe',
  care_phone: '555-1234',
  weight: 175,
  height: 68,
  patient_age: 42,
  last_exam: '2025-01-15',
  meds_verified: true,
  osa_history: 'none',
  smoking_status: 'never',
  mallampati: 'I',
  asa_class: 'II',
  npo_confirmed: true,
};

describe('phase1Completeness', () => {
  it('ships exactly 15 unconditional required fields across 6 steps', () => {
    expect(PHASE1_REQUIRED_FIELDS).toHaveLength(15);
    const steps = new Set(PHASE1_REQUIRED_FIELDS.map((f) => f.step));
    expect(steps.size).toBe(6);
  });

  it('returns complete=true when all fields are filled', () => {
    const r = phase1Completeness({ values: ALL_FILLED });
    expect(r.complete).toBe(true);
    expect(r.done).toBe(15);
    expect(r.total).toBe(15);
    expect(r.percent).toBe(100);
    expect(r.missing).toEqual([]);
  });

  it('reports missing fields with id, label, and step', () => {
    const partial = { ...ALL_FILLED, pt: '', mrn: '   ' };
    const r = phase1Completeness({ values: partial });
    expect(r.complete).toBe(false);
    expect(r.done).toBe(13);
    expect(r.missing.map((m) => m.id).sort()).toEqual(['mrn', 'pt']);
    const ptField = r.missing.find((m) => m.id === 'pt');
    expect(ptField?.step).toBe(1);
  });

  it('treats unchecked checkboxes (boolean false) as missing', () => {
    const r = phase1Completeness({ values: { ...ALL_FILLED, npo_confirmed: false } });
    expect(r.complete).toBe(false);
    expect(r.missing.some((m) => m.id === 'npo_confirmed')).toBe(true);
  });

  it('adds baseline_glucose to the required set when diabetic === yes', () => {
    const without = phase1Completeness({ values: ALL_FILLED, diabetic: 'yes' });
    expect(without.complete).toBe(false);
    expect(without.total).toBe(16);
    expect(without.missing.some((m) => m.id === PHASE1_CONDITIONAL_GLUCOSE.id)).toBe(true);

    const withGlucose = phase1Completeness({
      values: { ...ALL_FILLED, baseline_glucose: 110 },
      diabetic: 'yes',
    });
    expect(withGlucose.complete).toBe(true);
    expect(withGlucose.total).toBe(16);
  });

  it('does not require glucose for non-diabetic patients', () => {
    expect(phase1Completeness({ values: ALL_FILLED, diabetic: 'no' }).total).toBe(15);
    expect(phase1Completeness({ values: ALL_FILLED, diabetic: null }).total).toBe(15);
  });

  it('rounds the percent to the nearest integer', () => {
    const r = phase1Completeness({ values: { ...ALL_FILLED, pt: '' } });
    // 14 / 15 = 93.33% → 93
    expect(r.percent).toBe(93);
  });
});
