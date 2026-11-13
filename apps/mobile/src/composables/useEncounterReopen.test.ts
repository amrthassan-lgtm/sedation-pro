import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';

import { ORAL_PREMED_EVENT, REOPEN_EVENT, useEncounterReopen } from './useEncounterReopen';
import { useNoteFreeze } from './useNoteFreeze';
import { useChartSendStore } from '@/stores/chart-send';
import { useEventLogStore } from '@/stores/event-log';
import { useIVStore } from '@/stores/iv';
import { useNoteArchiveStore } from '@/stores/note-archive';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';

const SIGNED = 'data:image/png;base64,iVBORw0KGgo=';
const DAY = 24 * 60 * 60 * 1000;

function mount(): void {
  const scope = effectScope();
  scope.run(() => {
    useNoteFreeze();
    useEncounterReopen();
  });
}

/** A signed, completed assessment whose note is archived and filed to the chart. */
async function completedAssessment(at: number): Promise<string> {
  const patient = usePatientStore();
  patient.name = 'Testpatient, Sample';
  patient.mrn = '4242';
  const recovery = useRecoveryStore();
  recovery.providerSignatureDataUrl = SIGNED;
  recovery.releasedAt = at;
  await nextTick();
  const chart = useChartSendStore();
  chart.bindPatient(4242, 'Testpatient, Sample · 1990-01-01');
  chart.markCommlogSent();
  chart.markPdfSent();
  return recovery.noteFrozenId ?? '';
}

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
});

describe('a completed assessment that goes on to sedation', () => {
  it('leaves a completed assessment alone while no sedative is given', async () => {
    mount();
    const frozenId = await completedAssessment(Date.now() - 21 * DAY);
    await nextTick();

    const recovery = useRecoveryStore();
    expect(recovery.releasedAt).not.toBeNull();
    expect(recovery.providerSignatureDataUrl).toBe(SIGNED);
    expect(recovery.noteFrozenId).toBe(frozenId);
    expect(useChartSendStore().allSent).toBe(true);
  });

  it('hands the sign-off back when the first IV dose is logged', async () => {
    mount();
    const frozenId = await completedAssessment(Date.now() - 21 * DAY);
    expect(frozenId).not.toBe('');

    useIVStore().logDose({ drug: 'versed', mg: 2 });
    await nextTick();

    const recovery = useRecoveryStore();
    expect(recovery.releasedAt).toBeNull();
    expect(recovery.providerSignatureDataUrl).toBeNull();
    expect(recovery.noteFrozenId).toBeNull();
    const chart = useChartSendStore();
    expect(chart.commlog.status).toBe('idle');
    expect(chart.pdf.status).toBe('idle');
    // The assessment's own note is still in Saved Notes.
    expect(useNoteArchiveStore().find(frozenId)).toBeDefined();
    expect(useEventLogStore().events.some((e) => e.event === REOPEN_EVENT)).toBe(true);
  });

  it('does the same for an in-office oral dose', async () => {
    mount();
    await completedAssessment(Date.now() - DAY);

    useEventLogStore().append(ORAL_PREMED_EVENT, { Drug: 'Triazolam' });
    await nextTick();

    expect(useRecoveryStore().releasedAt).toBeNull();
    expect(useRecoveryStore().providerSignatureDataUrl).toBeNull();
  });

  it('archives the sedation note separately once released and signed', async () => {
    mount();
    const assessmentId = await completedAssessment(Date.now() - 21 * DAY);
    useIVStore().logDose({ drug: 'versed', mg: 2 });
    await nextTick();

    const recovery = useRecoveryStore();
    recovery.providerSignatureDataUrl = SIGNED;
    recovery.releasedAt = Date.now() + 1000;
    await nextTick();

    const archive = useNoteArchiveStore();
    expect(archive.count).toBe(2);
    expect(recovery.noteFrozenId).not.toBeNull();
    expect(recovery.noteFrozenId).not.toBe(assessmentId);
    // A real sedation release is after the sedative, so it stays released.
    expect(recovery.releasedAt).not.toBeNull();
  });

  it('puts the closed assessment back when the dose is undone', async () => {
    mount();
    const releasedAt = Date.now() - 21 * DAY;
    const frozenId = await completedAssessment(releasedAt);
    const iv = useIVStore();
    const dose = iv.logDose({ drug: 'versed', mg: 2 });
    await nextTick();

    iv.removeDoseById(dose.id);
    await nextTick();

    const recovery = useRecoveryStore();
    expect(recovery.releasedAt).toBe(releasedAt);
    expect(recovery.providerSignatureDataUrl).toBe(SIGNED);
    expect(recovery.noteFrozenId).toBe(frozenId);
    // Still marked as filed: the assessment cannot be sent a second time.
    expect(useChartSendStore().allSent).toBe(true);
    expect(useNoteArchiveStore().count).toBe(1);
    expect(useEventLogStore().events.some((e) => e.event === REOPEN_EVENT)).toBe(false);
  });

  it('repairs a case that was already in the broken state at launch', async () => {
    const recovery = useRecoveryStore();
    recovery.providerSignatureDataUrl = SIGNED;
    recovery.releasedAt = Date.now() - 21 * DAY;
    recovery.noteFrozenId = 'note-old';
    useIVStore().logDose({ drug: 'versed', mg: 2 });

    mount();
    await nextTick();

    expect(recovery.releasedAt).toBeNull();
    expect(recovery.providerSignatureDataUrl).toBeNull();
    expect(recovery.noteFrozenId).toBeNull();
  });

  it('never reopens an ordinary sedation case released after its doses', async () => {
    mount();
    useIVStore().logDose({ drug: 'versed', mg: 2 });
    const recovery = useRecoveryStore();
    recovery.providerSignatureDataUrl = SIGNED;
    recovery.releasedAt = Date.now() + 30 * 60 * 1000;
    await nextTick();
    await nextTick();

    expect(recovery.releasedAt).not.toBeNull();
    expect(recovery.providerSignatureDataUrl).toBe(SIGNED);
    expect(useEventLogStore().events.some((e) => e.event === REOPEN_EVENT)).toBe(false);
  });
});
