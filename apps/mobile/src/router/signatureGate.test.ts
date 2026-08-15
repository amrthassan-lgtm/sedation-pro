import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { router } from './index';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';

/**
 * The clinical note is gated on the provider signature: an unsigned note is
 * not a record, so it must not be reachable by deep link, a stale back
 * button, or a restored session.
 *
 * A signature data URL's contents are irrelevant to the gate — only whether
 * one exists — so a short placeholder stands in for pad output.
 */
const SIGNED = 'data:image/png;base64,iVBORw0KGgo=';

/** Minimal chart that satisfies `isPhase1Complete`. */
function completePhase1(): void {
  const patient = usePatientStore();
  patient.name = 'Test Patient';
  patient.mrn = '999';
  patient.provider = 'Dr. Test, DMD';
  patient.careName = 'Companion';
  patient.carePhone = '555-0100';
  patient.weightLb = 180;
  patient.heightIn = 70;
  patient.age = 40;
  patient.lastExamDate = '2026-08-01';
  patient.nkdaConfirmed = true;
  patient.medsVerified = true;
  patient.osaStatus = 'none';
  patient.smokingStatus = 'never';
  patient.mallampati = 'II';
  patient.asaClass = 'II';
  patient.npoConfirmed = true;
  patient.consentObtained = true;
  patient.ekgPlaced = true;
  patient.emergencyDrugsAvailable = true;
  patient.monitoringEquipmentChecked = true;
  patient.diabetic = false;
}

describe('clinical-note signature gate', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    setActivePinia(createPinia());
    await router.replace('/phase/1');
    await router.isReady();
  });

  it('redirects to Phase 4 when the note is unsigned', async () => {
    completePhase1();
    useRecoveryStore().providerSignatureDataUrl = null;

    await router.push('/clinical-note');

    expect(router.currentRoute.value.path).toBe('/phase/4');
  });

  it('flips the attempted flag so Phase 4 rings the signature field', async () => {
    completePhase1();
    const recovery = useRecoveryStore();
    recovery.providerSignatureDataUrl = null;
    recovery.releaseAttempted = false;

    await router.push('/clinical-note');

    expect(recovery.releaseAttempted).toBe(true);
  });

  it('passes through once signed', async () => {
    completePhase1();
    useRecoveryStore().providerSignatureDataUrl = SIGNED;

    await router.push('/clinical-note');

    expect(router.currentRoute.value.path).toBe('/clinical-note');
  });

  /**
   * The gate must NOT depend on whether sedation was given. Phase 4 is
   * reachable whenever Phase 1 is complete, so an assessment-only case
   * (sedation deferred, no doses, no event log) still has to be able to
   * produce its note once signed — otherwise roughly half this practice's
   * notes become unreachable.
   */
  it('does not trap an assessment-only case', async () => {
    completePhase1();
    useRecoveryStore().providerSignatureDataUrl = SIGNED;

    await router.push('/clinical-note');

    expect(router.currentRoute.value.path).toBe('/clinical-note');
  });

  it('leaves settings reachable with Phase 1 incomplete', async () => {
    await router.push('/settings');

    expect(router.currentRoute.value.path).toBe('/settings');
  });

  it('still gates Phase 2-4 behind Phase 1', async () => {
    await router.push('/phase/3');

    expect(router.currentRoute.value.path).toBe('/phase/1');
  });
});
