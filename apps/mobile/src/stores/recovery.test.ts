import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { usePatientStore } from './patient';
import { useRecoveryStore } from './recovery';

describe('recovery store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('recovery vitals stamp and undo', () => {
    const r = useRecoveryStore();
    expect(r.endStampedAt).toBeNull();
    r.stampRecoveryVitals();
    expect(r.endStampedAt).not.toBeNull();
    r.clearRecoveryStamp();
    expect(r.endStampedAt).toBeNull();
  });

  it('IV out and release keep the FIRST time, so a double tap cannot move the record', () => {
    const r = useRecoveryStore();
    r.stampIvOut();
    const ivOut = r.ivOutAt;
    r.stampIvOut();
    expect(r.ivOutAt).toBe(ivOut);
    r.stampReleased();
    const released = r.releasedAt;
    r.stampReleased();
    expect(r.releasedAt).toBe(released);
    r.clearIvOut();
    r.clearReleased();
    expect(r.ivOutAt).toBeNull();
    expect(r.releasedAt).toBeNull();
  });

  it('companion counts as documented only with both name and relation', () => {
    const r = useRecoveryStore();
    r.companionName = 'Pat';
    expect(r.companionDocumented).toBe(false);
    r.companionRelation = '  ';
    expect(r.companionDocumented).toBe(false);
    r.companionRelation = 'Spouse';
    expect(r.companionDocumented).toBe(true);
  });

  it('turning diabetic off wipes the end-of-case glucose', () => {
    const patient = usePatientStore();
    const r = useRecoveryStore();
    patient.diabetic = true;
    r.endGlucose = 140;
    patient.diabetic = false;
    expect(r.endGlucose).toBeNull();
  });

  it('reset clears the signature, stamps and discharge checklist', () => {
    const r = useRecoveryStore();
    r.providerSignatureDataUrl = 'data:image/png;base64,AAAA';
    r.stampRecoveryVitals();
    r.stampIvOut();
    r.stampReleased();
    r.setDischarge('escortedToVehicle', true);
    r.releaseAttempted = true;
    r.reset();
    expect(r.providerSignatureDataUrl).toBeNull();
    expect(r.endStampedAt).toBeNull();
    expect(r.ivOutAt).toBeNull();
    expect(r.releasedAt).toBeNull();
    expect(r.releaseAttempted).toBe(false);
    expect(Object.values(r.discharge).every((v) => v === false)).toBe(true);
  });

  describe('the signing time (v1 audit)', () => {
    const at = (h: number, m: number, s = 0) => new Date(2026, 10, 16, h, m, s).getTime();
    afterEach(() => {
      vi.useRealTimers();
    });

    it('is when ink first goes on the pad, and more strokes keep it', () => {
      vi.useFakeTimers({ now: at(14, 0) });
      const r = useRecoveryStore();
      r.providerSignatureDataUrl = 'data:image/png;base64,AAA';
      expect(r.providerSignedAt).toBe(at(14, 0));

      vi.setSystemTime(at(14, 0, 5));
      r.providerSignatureDataUrl = 'data:image/png;base64,BBB';
      expect(r.providerSignedAt).toBe(at(14, 0));
    });

    it('clearing the pad clears it, and signing again stamps the new time', () => {
      vi.useFakeTimers({ now: at(14, 0) });
      const r = useRecoveryStore();
      r.providerSignatureDataUrl = 'data:image/png;base64,AAA';
      r.providerSignatureDataUrl = null;
      expect(r.providerSignedAt).toBeNull();

      vi.setSystemTime(at(14, 3));
      r.providerSignatureDataUrl = 'data:image/png;base64,CCC';
      expect(r.providerSignedAt).toBe(at(14, 3));
    });

    it('a case reopened after a reload keeps its own time', () => {
      localStorage.setItem(
        'sedation-pro:recovery:v6',
        JSON.stringify({
          providerSignatureDataUrl: 'data:image/png;base64,AAA',
          providerSignedAt: at(9, 30),
        }),
      );
      setActivePinia(createPinia());
      expect(useRecoveryStore().providerSignedAt).toBe(at(9, 30));
    });

    it('a signature from before the time was kept has none, rather than a guessed one', () => {
      localStorage.setItem(
        'sedation-pro:recovery:v6',
        JSON.stringify({ providerSignatureDataUrl: 'data:image/png;base64,AAA' }),
      );
      setActivePinia(createPinia());
      expect(useRecoveryStore().providerSignedAt).toBeNull();
    });

    it('reset clears it', () => {
      const r = useRecoveryStore();
      r.providerSignatureDataUrl = 'data:image/png;base64,AAA';
      r.reset();
      expect(r.providerSignedAt).toBeNull();
    });
  });
});
