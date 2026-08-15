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
  allergies: 'NKDA',
  meds_verified: true,
  osa_history: 'none',
  smoking_status: 'never',
  mallampati: 'I',
  asa_class: 'II',
  npo_confirmed: true,
  consent_obtained: true,
  ekg_placed: true,
  emergency_drugs_available: true,
  monitoring_equipment_checked: true,
};

describe('phase1Completeness', () => {
  /**
   * The note used to print a blank allergy field as "NKDA" — turning
   * "nobody asked" into a positive claim about the patient. Requiring the
   * field is what lets the note assert NKDA honestly.
   */
  it('requires allergies, satisfied by a list or an explicit NKDA', () => {
    const blank = phase1Completeness({ values: { ...ALL_FILLED, allergies: '' } });
    expect(blank.complete).toBe(false);
    expect(blank.missing.map((m) => m.id)).toContain('allergies');

    expect(phase1Completeness({ values: { ...ALL_FILLED, allergies: 'NKDA' } }).complete).toBe(
      true,
    );
    expect(
      phase1Completeness({ values: { ...ALL_FILLED, allergies: 'Penicillin' } }).complete,
    ).toBe(true);
  });

  it('ships exactly 20 unconditional required fields across 6 steps', () => {
    expect(PHASE1_REQUIRED_FIELDS).toHaveLength(20);
    const steps = new Set(PHASE1_REQUIRED_FIELDS.map((f) => f.step));
    expect(steps.size).toBe(6);
  });

  it('returns complete=true when all fields are filled', () => {
    const r = phase1Completeness({ values: ALL_FILLED });
    expect(r.complete).toBe(true);
    expect(r.done).toBe(20);
    expect(r.total).toBe(20);
    expect(r.percent).toBe(100);
    expect(r.missing).toEqual([]);
  });

  it('reports missing fields with id, label, and step', () => {
    const partial = { ...ALL_FILLED, pt: '', mrn: '   ' };
    const r = phase1Completeness({ values: partial });
    expect(r.complete).toBe(false);
    expect(r.done).toBe(18);
    expect(r.missing.map((m) => m.id).sort()).toEqual(['mrn', 'pt']);
    const ptField = r.missing.find((m) => m.id === 'pt');
    expect(ptField?.step).toBe(1);
  });

  it('treats unchecked checkboxes (boolean false) as missing', () => {
    const r = phase1Completeness({ values: { ...ALL_FILLED, npo_confirmed: false } });
    expect(r.complete).toBe(false);
    expect(r.missing.some((m) => m.id === 'npo_confirmed')).toBe(true);
  });

  it('treats unchecked informed-consent as missing', () => {
    const r = phase1Completeness({ values: { ...ALL_FILLED, consent_obtained: false } });
    expect(r.complete).toBe(false);
    expect(r.missing.some((m) => m.id === 'consent_obtained')).toBe(true);
  });

  it('treats unchecked safety-checklist items as missing', () => {
    const r = phase1Completeness({
      values: {
        ...ALL_FILLED,
        ekg_placed: false,
        emergency_drugs_available: false,
        monitoring_equipment_checked: false,
      },
    });
    expect(r.complete).toBe(false);
    expect(r.missing.map((m) => m.id).sort()).toEqual([
      'ekg_placed',
      'emergency_drugs_available',
      'monitoring_equipment_checked',
    ]);
  });

  it('adds baseline_glucose to the required set when diabetic === yes', () => {
    const without = phase1Completeness({ values: ALL_FILLED, diabetic: 'yes' });
    expect(without.complete).toBe(false);
    expect(without.total).toBe(21);
    expect(without.missing.some((m) => m.id === PHASE1_CONDITIONAL_GLUCOSE.id)).toBe(true);

    const withGlucose = phase1Completeness({
      values: { ...ALL_FILLED, baseline_glucose: 110 },
      diabetic: 'yes',
    });
    expect(withGlucose.complete).toBe(true);
    expect(withGlucose.total).toBe(21);
  });

  it('does not require glucose for non-diabetic patients', () => {
    expect(phase1Completeness({ values: ALL_FILLED, diabetic: 'no' }).total).toBe(20);
    expect(phase1Completeness({ values: ALL_FILLED, diabetic: null }).total).toBe(20);
  });

  it('rounds the percent to the nearest integer', () => {
    const r = phase1Completeness({ values: { ...ALL_FILLED, pt: '' } });
    // 19 / 20 = 95%
    expect(r.percent).toBe(95);
  });
});
