import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick, type EffectScope } from 'vue';

import { useAssessmentAudit } from './useAssessmentAudit';
import {
  PHASE1_AMENDMENT_EVENT,
  PHASE1_LOCK_EVENT,
  useEventLogStore,
  type LogEvent,
} from '@/stores/event-log';
import { usePatientStore } from '@/stores/patient';
import { useToastStore } from '@/stores/toast';

type Patient = ReturnType<typeof usePatientStore>;

function fillAllRequiredFields(patient: Patient): void {
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
  patient.timeOutPerformed = true;
  patient.teamReady = true;
  patient.emergencyDrugsAvailable = true;
  patient.monitoringEquipmentChecked = true;
}

function lockEvents(events: ReadonlyArray<LogEvent>): ReadonlyArray<LogEvent> {
  return events.filter((e) => e.event === PHASE1_LOCK_EVENT);
}

function amendmentEvents(events: ReadonlyArray<LogEvent>): ReadonlyArray<LogEvent> {
  return events.filter((e) => e.event === PHASE1_AMENDMENT_EVENT);
}

describe('useAssessmentAudit', () => {
  let scope: EffectScope | null = null;

  beforeEach(() => {
    // Stores persist to localStorage via persistRefs — clear before each test
    // so prior test state doesn't bleed in through hydration.
    window.localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    scope?.stop();
    scope = null;
    vi.useRealTimers();
  });

  function mountAudit(): void {
    scope = effectScope();
    scope.run(() => useAssessmentAudit());
  }

  it('locks exactly once on the first false → true transition of isPhase1Complete', async () => {
    const patient = usePatientStore();
    const log = useEventLogStore();
    mountAudit();

    expect(log.events.length).toBe(0);
    fillAllRequiredFields(patient);
    expect(patient.isPhase1Complete).toBe(true);
    await nextTick();

    expect(lockEvents(log.events).length).toBe(1);
    const lock = lockEvents(log.events)[0]!;
    expect(lock.details.Patient).toBe('Jane Doe');
    expect(lock.details.ASA).toBe('II');
    expect(lock.details.Mallampati).toBe('II');
    expect(lock.details.NPO).toBe('Yes');
  });

  it('surfaces a safe-tone toast when the lock fires', async () => {
    const patient = usePatientStore();
    const toast = useToastStore();
    mountAudit();

    fillAllRequiredFields(patient);
    await nextTick();

    expect(toast.current).not.toBeNull();
    expect(toast.current!.label).toBe('✓ Phase 1 locked');
    expect(toast.current!.tone).toBe('safe');
  });

  it('does not re-lock after a re-incomplete → re-complete cycle', async () => {
    const patient = usePatientStore();
    const log = useEventLogStore();
    mountAudit();

    fillAllRequiredFields(patient);
    await nextTick();
    expect(lockEvents(log.events).length).toBe(1);

    patient.npoConfirmed = false;
    await nextTick();
    expect(patient.isPhase1Complete).toBe(false);

    patient.npoConfirmed = true;
    await nextTick();
    expect(patient.isPhase1Complete).toBe(true);
    expect(lockEvents(log.events).length).toBe(1);
  });

  it('does not re-lock on hydration when the event log already contains a lock event', async () => {
    const log = useEventLogStore();
    log.append(PHASE1_LOCK_EVENT, { Patient: 'Prior', ASA: 'II' });
    const beforeMount = log.events.length;

    const patient = usePatientStore();
    mountAudit();
    fillAllRequiredFields(patient);
    await nextTick();

    expect(log.events.length).toBe(beforeMount);
    expect(lockEvents(log.events).length).toBe(1);
  });

  it('records one amendment after debounce when a clinical field changes post-lock', async () => {
    const patient = usePatientStore();
    const log = useEventLogStore();
    mountAudit();

    fillAllRequiredFields(patient);
    patient.baselineBp = { sbp: 138, dbp: 85 };
    await nextTick();
    expect(lockEvents(log.events).length).toBe(1);
    expect(amendmentEvents(log.events).length).toBe(0);

    patient.baselineBp = { sbp: 130, dbp: 80 };
    await nextTick();
    expect(amendmentEvents(log.events).length).toBe(0);

    vi.advanceTimersByTime(3000);
    expect(amendmentEvents(log.events).length).toBe(1);
    const amend = amendmentEvents(log.events)[0]!;
    expect(amend.details.BP).toBe('138/85 → 130/80');
  });

  it('does not record amendments for excluded admin/identity fields', async () => {
    const patient = usePatientStore();
    const log = useEventLogStore();
    mountAudit();

    fillAllRequiredFields(patient);
    await nextTick();
    expect(lockEvents(log.events).length).toBe(1);

    patient.name = 'Jane Smith';
    patient.mrn = '99999';
    patient.provider = 'Dr. Other';
    patient.assistants = 'X, Y';
    patient.procedure = 'EXT #19';
    patient.careName = 'New caregiver';
    patient.carePhone = '5550000';
    await nextTick();
    vi.advanceTimersByTime(3000);

    expect(amendmentEvents(log.events).length).toBe(0);
  });

  it('coalesces a burst of edits into one amendment via the 3s debounce', async () => {
    const patient = usePatientStore();
    const log = useEventLogStore();
    mountAudit();

    fillAllRequiredFields(patient);
    patient.baselineBp = { sbp: 140, dbp: 90 };
    await nextTick();
    expect(amendmentEvents(log.events).length).toBe(0);

    patient.baselineBp = { sbp: 138, dbp: 88 };
    await nextTick();
    vi.advanceTimersByTime(1000);

    patient.baselineBp = { sbp: 135, dbp: 86 };
    await nextTick();
    vi.advanceTimersByTime(1000);

    patient.baselineBp = { sbp: 130, dbp: 84 };
    await nextTick();
    vi.advanceTimersByTime(3000);

    expect(amendmentEvents(log.events).length).toBe(1);
    const amend = amendmentEvents(log.events)[0]!;
    expect(amend.details.BP).toBe('140/90 → 130/84');
  });

  it('records amendments against the most recent amendment, not the original lock snapshot', async () => {
    const patient = usePatientStore();
    const log = useEventLogStore();
    mountAudit();

    fillAllRequiredFields(patient);
    patient.baselineBp = { sbp: 140, dbp: 90 };
    await nextTick();

    patient.baselineBp = { sbp: 135, dbp: 85 };
    await nextTick();
    vi.advanceTimersByTime(3000);
    expect(amendmentEvents(log.events).length).toBe(1);

    patient.baselineBp = { sbp: 128, dbp: 82 };
    await nextTick();
    vi.advanceTimersByTime(3000);
    expect(amendmentEvents(log.events).length).toBe(2);
    expect(amendmentEvents(log.events)[1]!.details.BP).toBe('135/85 → 128/82');
  });
});
