import { describe, beforeEach, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useSessionStore } from './session';
import { useEventLogStore } from './event-log';
import { useUndoStore } from './undo';
import { useToastStore } from './toast';
import { usePatientStore } from './patient';

describe('shell stores — single sources of truth', () => {
  beforeEach(() => {
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

    expect(patient.isPhase1Complete).toBe(true);
    expect(patient.completeness.percent).toBe(100);
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

    expect(patient.isPhase1Complete).toBe(true);
    expect(patient.completeness.total).toBe(15);

    patient.diabetic = true;
    expect(patient.completeness.total).toBe(16);
    expect(patient.isPhase1Complete).toBe(false);

    patient.baselineGlucose = 110;
    expect(patient.isPhase1Complete).toBe(true);
  });
});
