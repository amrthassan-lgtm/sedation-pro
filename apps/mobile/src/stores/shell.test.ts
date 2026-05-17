import { describe, beforeEach, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import { useSessionStore } from './session';
import { useEventLogStore } from './event-log';
import { useUndoStore } from './undo';
import { useToastStore } from './toast';
import { usePatientStore } from './patient';
import { useIVStore } from './iv';

describe('shell stores — single sources of truth', () => {
  beforeEach(() => {
    // persistRefs() reads from localStorage on store init; without clearing,
    // values written by an earlier test would re-hydrate the next store and
    // mask the assertion under test.
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('session.setPhase remembers the last step per phase', () => {
    const session = useSessionStore();
    expect(session.currentPhase).toBe('phase1');

    session.setStep(3);
    expect(session.currentStep).toBe(3);

    session.setPhase('phase3');
    expect(session.currentPhase).toBe('phase3');
    expect(session.currentStep).toBeNull();

    session.setStep(6);
    session.setPhase('phase1');
    expect(session.currentStep).toBe(3);

    session.setPhase('phase3');
    expect(session.currentStep).toBe(6);
  });

  it('undo.stamp appends an event and undo restores the previous state', () => {
    const undo = useUndoStore();
    const eventLog = useEventLogStore();
    const toast = useToastStore();

    expect(eventLog.count).toBe(0);
    expect(undo.canUndo).toBe(false);
    expect(toast.current).toBeNull();

    let reverted = 0;
    undo.stamp({
      event: 'Synthetic test event',
      details: { Drug: 'Versed', Dose: '1 mg' },
      toast: { label: '✓ Versed 1 mg', tone: 'safe' },
      revert: () => {
        reverted += 1;
      },
    });

    expect(eventLog.count).toBe(1);
    expect(undo.canUndo).toBe(true);
    expect(toast.current?.label).toBe('✓ Versed 1 mg');

    const popped = undo.undo();
    expect(popped).toBe(true);
    expect(eventLog.count).toBe(0);
    expect(undo.canUndo).toBe(false);
    expect(reverted).toBe(1);
    expect(toast.current).toBeNull();
  });

  it('iv.restoreGasState reverts both flags so undo of N₂O ON returns to the prior state', () => {
    const iv = useIVStore();
    const undo = useUndoStore();

    // Cold start — neither flag set.
    expect(iv.n2oOn).toBe(false);
    expect(iv.o2OnlyOn).toBe(false);

    const prevN2oOn = iv.n2oOn;
    const prevO2OnlyOn = iv.o2OnlyOn;
    iv.setN2oOn();
    undo.stamp({
      event: 'N₂O/O₂ ON',
      details: { Route: 'Inhalation' },
      toast: { label: '✓ N₂O/O₂ ON', tone: 'safe' },
      revert: () => iv.restoreGasState(prevN2oOn, prevO2OnlyOn),
    });
    expect(iv.n2oOn).toBe(true);
    expect(iv.o2OnlyOn).toBe(false);

    expect(undo.undo()).toBe(true);
    expect(iv.n2oOn).toBe(false);
    expect(iv.o2OnlyOn).toBe(false);

    // Same shape for the OFF transition — from (on, off) → (off, on) → undo
    // must put it back to (on, off), not (off, off).
    iv.setN2oOn();
    const prev2N2oOn = iv.n2oOn;
    const prev2O2OnlyOn = iv.o2OnlyOn;
    iv.setN2oOff();
    undo.stamp({
      event: 'N₂O/O₂ OFF · O₂ 100% ON',
      details: {},
      toast: { label: '✓ N₂O off', tone: 'safe' },
      revert: () => iv.restoreGasState(prev2N2oOn, prev2O2OnlyOn),
    });
    expect(iv.n2oOn).toBe(false);
    expect(iv.o2OnlyOn).toBe(true);

    expect(undo.undo()).toBe(true);
    expect(iv.n2oOn).toBe(true);
    expect(iv.o2OnlyOn).toBe(false);
  });

  it('undo.undo returns false when the stack is empty', () => {
    const undo = useUndoStore();
    expect(undo.undo()).toBe(false);
  });

  it('undo.stamp caps the stack at 25 entries', () => {
    const undo = useUndoStore();
    for (let i = 0; i < 30; i += 1) {
      undo.stamp({
        event: `evt ${i}`,
        toast: { label: `evt ${i}`, tone: 'safe' },
      });
    }
    expect(undo.count).toBe(25);
  });

  it('patient.isPhase1Complete reflects phase1Completeness from the engine', () => {
    const patient = usePatientStore();
    expect(patient.isPhase1Complete).toBe(false);

    patient.name = 'Jane Doe';
    patient.mrn = '12345';
    patient.provider = 'Dr. Hassan';
    patient.careName = 'John Doe';
    patient.carePhone = '5551234567';
    patient.weightLb = 180;
    patient.heightIn = 70;
    patient.age = 45;
    patient.lastExamDate = '2025-12-01';
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

    expect(patient.isPhase1Complete).toBe(true);
    expect(patient.completeness.percent).toBe(100);
  });

  it('patient.safetyAlerts flags geriatric tiers at 65 and 75', () => {
    const patient = usePatientStore();
    expect(patient.safetyAlerts.find((a) => a.code === 'age')).toBeUndefined();

    patient.age = 64;
    expect(patient.safetyAlerts.find((a) => a.code === 'age')).toBeUndefined();

    patient.age = 65;
    const caution = patient.safetyAlerts.find((a) => a.code === 'age');
    expect(caution).toBeDefined();
    expect(caution!.tone).toBe('caution');
    expect(caution!.label).toBe('Age 65');

    patient.age = 75;
    const danger = patient.safetyAlerts.find((a) => a.code === 'age');
    expect(danger!.tone).toBe('danger');
  });

  it('patient.markValidationAttempted flips the flag and resets once complete', async () => {
    const patient = usePatientStore();
    expect(patient.phase1ValidationAttempted).toBe(false);

    patient.markValidationAttempted();
    expect(patient.phase1ValidationAttempted).toBe(true);

    // Fill the full required set so isPhase1Complete flips to true; the
    // watcher inside the store should clear the validation flag on the same
    // tick so the red rings auto-dismiss.
    patient.name = 'Jane Doe';
    patient.mrn = '12345';
    patient.provider = 'Dr. Hassan';
    patient.careName = 'John Doe';
    patient.carePhone = '5551234567';
    patient.weightLb = 180;
    patient.heightIn = 70;
    patient.age = 45;
    patient.lastExamDate = '2025-12-01';
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

    expect(patient.isPhase1Complete).toBe(true);
    await nextTick();
    expect(patient.phase1ValidationAttempted).toBe(false);
  });

  it('patient.reset clears the validation-attempted flag', () => {
    const patient = usePatientStore();
    patient.markValidationAttempted();
    expect(patient.phase1ValidationAttempted).toBe(true);
    patient.reset();
    expect(patient.phase1ValidationAttempted).toBe(false);
  });

  it('flipping diabetic back to no wipes the baseline glucose', async () => {
    const patient = usePatientStore();
    patient.diabetic = true;
    patient.baselineGlucose = 142;
    expect(patient.baselineGlucose).toBe(142);
    patient.diabetic = false;
    await nextTick();
    expect(patient.baselineGlucose).toBeNull();
  });

  it('patient.completeness adds baseline_glucose when diabetic is yes', () => {
    const patient = usePatientStore();
    patient.name = 'Jane';
    patient.mrn = '1';
    patient.provider = 'Dr.';
    patient.careName = 'A';
    patient.carePhone = '1';
    patient.weightLb = 100;
    patient.heightIn = 60;
    patient.age = 30;
    patient.lastExamDate = '2026-01-01';
    patient.medsVerified = true;
    patient.osaStatus = 'none';
    patient.smokingStatus = 'never';
    patient.mallampati = 'I';
    patient.asaClass = 'I';
    patient.npoConfirmed = true;
    patient.consentObtained = true;
    patient.ekgPlaced = true;
    patient.emergencyDrugsAvailable = true;
    patient.monitoringEquipmentChecked = true;

    expect(patient.isPhase1Complete).toBe(true);
    expect(patient.completeness.total).toBe(19);

    patient.diabetic = true;
    expect(patient.completeness.total).toBe(20);
    expect(patient.isPhase1Complete).toBe(false);

    patient.baselineGlucose = 110;
    expect(patient.isPhase1Complete).toBe(true);
  });
});
