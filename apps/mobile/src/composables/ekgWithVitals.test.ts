import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick, type EffectScope } from 'vue';

import { confirmEkgWithVitals, setEkgByHand } from './ekgWithVitals';
import { useAssessmentAudit } from './useAssessmentAudit';
import {
  PHASE1_AMENDMENT_EVENT,
  PHASE1_LOCK_EVENT,
  useEventLogStore,
  type LogEvent,
} from '@/stores/event-log';
import { usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';

function amendments(events: ReadonlyArray<LogEvent>): ReadonlyArray<LogEvent> {
  return events.filter((e) => e.event === PHASE1_AMENDMENT_EVENT);
}

function fillAssessmentWithoutEkg(): void {
  const patient = usePatientStore();
  patient.name = 'Test Patient';
  patient.mrn = '12345';
  patient.provider = 'Dr. Jordan Rivera';
  patient.careName = 'Sam Patient';
  patient.carePhone = '5551234567';
  patient.weightLb = 180;
  patient.heightIn = 70;
  patient.age = 45;
  patient.lastExamDate = '2025-12-01';
  patient.nkdaConfirmed = true;
  patient.medsVerified = true;
  patient.osaStatus = 'none';
  patient.smokingStatus = 'never';
  patient.mallampati = 'II';
  patient.asaClass = 'II';
  patient.npoConfirmed = true;
  patient.consentObtained = true;
  patient.emergencyDrugsAvailable = true;
  patient.monitoringEquipmentChecked = true;
}

describe('confirmEkgWithVitals', () => {
  let scope: EffectScope | null = null;

  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    scope?.stop();
    scope = null;
    vi.useRealTimers();
  });

  /** Phase 1 opened: its audit watches the assessment from here on. */
  function openPhase1(): void {
    scope = effectScope();
    scope.run(() => useAssessmentAudit());
  }

  function leavePhase1(): void {
    scope?.stop();
    scope = null;
  }

  /** The assessment as the assistant leaves it: complete and locked, leads not on yet. */
  async function lockWithoutEkg(): Promise<void> {
    openPhase1();
    fillAssessmentWithoutEkg();
    await nextTick();
    leavePhase1();
    const lock = useEventLogStore().events.find((e) => e.event === PHASE1_LOCK_EVENT);
    expect(lock?.details['EKG placed']).toBe('—');
  }

  it('ticks the box, which is what lifts the warning and unlocks the IV sedatives', () => {
    const patient = usePatientStore();
    expect(patient.ekgPlaced).toBe(false);

    confirmEkgWithVitals();

    expect(patient.ekgPlaced).toBe(true);
  });

  it('writes the row a hand tick in Phase 1 writes, once the assessment is locked', async () => {
    const log = useEventLogStore();
    await lockWithoutEkg();

    confirmEkgWithVitals();

    expect(amendments(log.events).map((e) => e.details)).toEqual([{ 'EKG placed': '— → Yes' }]);
  });

  it('writes no row before the lock: the lock row itself will carry the tick', () => {
    const log = useEventLogStore();

    confirmEkgWithVitals();

    expect(log.events).toEqual([]);
  });

  it('is undone whole: the box and the row', async () => {
    const patient = usePatientStore();
    const log = useEventLogStore();
    await lockWithoutEkg();

    const undo = confirmEkgWithVitals();
    undo();

    expect(patient.ekgPlaced).toBe(false);
    expect(amendments(log.events)).toEqual([]);
  });

  it('leaves a box ticked by hand alone, and Undo does not untick it', async () => {
    const patient = usePatientStore();
    const log = useEventLogStore();
    await lockWithoutEkg();
    patient.ekgPlaced = true;

    const undo = confirmEkgWithVitals();
    expect(amendments(log.events)).toEqual([]);

    undo();
    expect(patient.ekgPlaced).toBe(true);
  });

  it('is not logged a second time when Phase 1 is opened and edited afterwards', async () => {
    const patient = usePatientStore();
    const log = useEventLogStore();
    await lockWithoutEkg();
    confirmEkgWithVitals();

    openPhase1();
    patient.asaClass = 'III';
    await nextTick();
    vi.advanceTimersByTime(3000);

    const rows = amendments(log.events).map((e) => Object.keys(e.details));
    expect(rows).toEqual([['EKG placed'], ['ASA']]);
  });

  it('leaves no row behind when the stamp is undone with Phase 1 open', async () => {
    const patient = usePatientStore();
    const log = useEventLogStore();
    await lockWithoutEkg();
    const undo = confirmEkgWithVitals();

    openPhase1();
    undo();
    await nextTick();
    vi.advanceTimersByTime(3000);

    expect(patient.ekgPlaced).toBe(false);
    expect(amendments(log.events)).toEqual([]);
  });

  it('logs a hand untick after the stamp as its own change', async () => {
    const patient = usePatientStore();
    const log = useEventLogStore();
    await lockWithoutEkg();
    confirmEkgWithVitals();

    openPhase1();
    patient.ekgPlaced = false;
    await nextTick();
    vi.advanceTimersByTime(3000);

    expect(amendments(log.events).map((e) => e.details)).toEqual([
      { 'EKG placed': '— → Yes' },
      { 'EKG placed': 'Yes → —' },
    ]);
  });

  describe('the box ticked by hand on the Pre-Op Vitals card', () => {
    it('writes the row a hand tick always wrote, on a locked assessment', async () => {
      const patient = usePatientStore();
      const log = useEventLogStore();
      await lockWithoutEkg();

      setEkgByHand(true);

      expect(patient.ekgPlaced).toBe(true);
      expect(amendments(log.events).map((e) => e.details)).toEqual([{ 'EKG placed': '— → Yes' }]);
    });

    it('is taken back by Undo: the box and the row', async () => {
      const patient = usePatientStore();
      const log = useEventLogStore();
      await lockWithoutEkg();

      setEkgByHand(true);
      useUndoStore().undo();

      expect(patient.ekgPlaced).toBe(false);
      expect(amendments(log.events)).toEqual([]);
    });

    it('logs an untick as its own change', async () => {
      const log = useEventLogStore();
      await lockWithoutEkg();

      setEkgByHand(true);
      setEkgByHand(false);

      expect(amendments(log.events).map((e) => e.details)).toEqual([
        { 'EKG placed': '— → Yes' },
        { 'EKG placed': 'Yes → —' },
      ]);
    });

    it('writes nothing before the lock, and nothing for a tap that changes nothing', async () => {
      const patient = usePatientStore();
      const log = useEventLogStore();

      setEkgByHand(true);
      expect(patient.ekgPlaced).toBe(true);
      expect(log.events).toEqual([]);

      patient.ekgPlaced = false;
      await lockWithoutEkg();
      setEkgByHand(false);
      expect(amendments(log.events)).toEqual([]);
    });

    it('leaves the stamp nothing to add once the box is ticked by hand', async () => {
      const log = useEventLogStore();
      await lockWithoutEkg();

      setEkgByHand(true);
      confirmEkgWithVitals();

      expect(amendments(log.events)).toHaveLength(1);
    });
  });
});
