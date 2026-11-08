import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { alcoholBucketValue, formatAlcoholBucket, usePatientStore } from './patient';

/** A chart that satisfies every required Phase 1 field. */
function fillPhase1(): ReturnType<typeof usePatientStore> {
  const p = usePatientStore();
  p.name = 'Test Patient';
  p.mrn = '999';
  p.provider = 'Dr. Test, DMD';
  p.careName = 'Companion';
  p.carePhone = '555-0100';
  p.weightLb = 180;
  p.heightIn = 70;
  p.age = 40;
  p.lastExamDate = '2026-08-01';
  p.nkdaConfirmed = true;
  p.medsVerified = true;
  p.osaStatus = 'none';
  p.smokingStatus = 'never';
  p.mallampati = 'II';
  p.asaClass = 'II';
  p.npoConfirmed = true;
  p.consentObtained = true;
  p.ekgPlaced = true;
  p.emergencyDrugsAvailable = true;
  p.monitoringEquipmentChecked = true;
  p.diabetic = false;
  return p;
}

describe('patient store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  describe('Phase 1 gate (the source of truth for the router and the drawer)', () => {
    it('an empty chart is incomplete and lists what is missing', () => {
      const p = usePatientStore();
      expect(p.isPhase1Complete).toBe(false);
      expect(p.completeness.missing.length).toBeGreaterThan(0);
      expect(p.completeness.done).toBeLessThan(p.completeness.total);
    });

    it('a filled chart is complete', () => {
      const p = fillPhase1();
      expect(p.isPhase1Complete).toBe(true);
      expect(p.completeness.done).toBe(p.completeness.total);
    });

    it('NKDA satisfies allergies; unticking it with an empty list reopens the gate', () => {
      const p = fillPhase1();
      p.nkdaConfirmed = false;
      expect(p.isPhase1Complete).toBe(false);
      p.allergiesList = 'Penicillin';
      expect(p.isPhase1Complete).toBe(true);
    });

    it('a diabetic needs a baseline glucose before the gate opens', () => {
      const p = fillPhase1();
      p.diabetic = true;
      expect(p.isPhase1Complete).toBe(false);
      p.baselineGlucose = 112;
      expect(p.isPhase1Complete).toBe(true);
    });

    it('turning diabetic off wipes the glucose so it cannot reach the chart', () => {
      const p = fillPhase1();
      p.diabetic = true;
      p.baselineGlucose = 112;
      p.diabetic = false;
      expect(p.baselineGlucose).toBeNull();
    });

    it('the red-ring flag clears itself once the chart completes', async () => {
      const p = usePatientStore();
      p.markValidationAttempted();
      expect(p.phase1ValidationAttempted).toBe(true);
      fillPhase1();
      await Promise.resolve();
      expect(p.phase1ValidationAttempted).toBe(false);
    });

    it('each sticky-bar clearance tap re-fires the scroll request', () => {
      const p = usePatientStore();
      const before = p.phase1ScrollRequests;
      p.requestMissingFieldScroll();
      p.requestMissingFieldScroll();
      expect(p.phase1ScrollRequests).toBe(before + 2);
      expect(p.phase1ValidationAttempted).toBe(true);
    });
  });

  describe('safety alerts', () => {
    it('a low-risk chart raises none', () => {
      expect(fillPhase1().safetyAlerts).toEqual([]);
    });

    it('flags ASA III, OSA, Mallampati III and diabetes', () => {
      const p = fillPhase1();
      p.asaClass = 'III';
      p.osaStatus = 'osa-diagnosed';
      p.mallampati = 'III';
      p.diabetic = true;
      const codes = p.safetyAlerts.map((a) => a.code);
      expect(codes).toEqual(expect.arrayContaining(['asa', 'osa', 'mallampati', 'diabetes']));
      expect(p.safetyAlerts.find((a) => a.code === 'diabetes')?.tone).toBe('caution');
    });

    it('BMI is caution from 30 and danger from 40', () => {
      const p = fillPhase1();
      p.heightIn = 70;
      p.weightLb = 220; // BMI ~31.6
      expect(p.safetyAlerts.find((a) => a.code === 'bmi')?.tone).toBe('caution');
      p.weightLb = 290; // BMI ~41.6
      expect(p.safetyAlerts.find((a) => a.code === 'bmi')?.tone).toBe('danger');
      p.weightLb = 180; // BMI ~25.8
      expect(p.safetyAlerts.find((a) => a.code === 'bmi')).toBeUndefined();
    });

    it('age is caution from 65 and danger from 75', () => {
      const p = fillPhase1();
      p.age = 64;
      expect(p.safetyAlerts.find((a) => a.code === 'age')).toBeUndefined();
      p.age = 65;
      expect(p.safetyAlerts.find((a) => a.code === 'age')?.tone).toBe('caution');
      p.age = 75;
      expect(p.safetyAlerts.find((a) => a.code === 'age')?.tone).toBe('danger');
    });
  });

  describe('alcohol buckets', () => {
    it('maps weekly drinks to the chip buckets, including legacy exact counts', () => {
      expect(alcoholBucketValue(null)).toBeNull();
      expect(alcoholBucketValue(0)).toBe(0);
      expect(alcoholBucketValue(3)).toBe(4);
      expect(alcoholBucketValue(7)).toBe(4);
      expect(alcoholBucketValue(8)).toBe(11);
      expect(alcoholBucketValue(30)).toBe(15);
    });

    it('prints the band, not the stored midpoint', () => {
      expect(formatAlcoholBucket(null)).toBe('—');
      expect(formatAlcoholBucket(0)).toBe('0');
      expect(formatAlcoholBucket(5)).toBe('1–7');
      expect(formatAlcoholBucket(12)).toBe('8–14');
      expect(formatAlcoholBucket(20)).toBe('15+');
    });
  });
});
