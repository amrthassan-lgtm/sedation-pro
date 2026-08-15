import { createPinia, setActivePinia } from 'pinia';
import { computed } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClinicalNote } from './useClinicalNote';

const readCredentials = vi.fn();
const getPatient = vi.fn();
const postCommlog = vi.fn();
const uploadDocument = vi.fn();
const clinicalNoteToPdf = vi.fn();

vi.mock('@/services/od-credentials', () => ({
  readCredentials: () => readCredentials() as unknown,
}));

vi.mock('@/services/opendental', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/opendental')>('@/services/opendental');
  return {
    ...actual,
    getPatient: (...args: unknown[]) => getPatient(...args) as unknown,
    postCommlog: (...args: unknown[]) => postCommlog(...args) as unknown,
    uploadDocument: (...args: unknown[]) => uploadDocument(...args) as unknown,
  };
});

vi.mock('./clinicalNoteToPdf', () => ({
  clinicalNoteToPdf: (...args: unknown[]) => clinicalNoteToPdf(...args) as unknown,
}));

const { OdError } = await import('@/services/opendental');
const { useSendToChart, RATE_LIMIT_SPACING_MS } = await import('./useSendToChart');
const { useChartSendStore } = await import('@/stores/chart-send');
const { usePatientStore } = await import('@/stores/patient');

const NOTE: ClinicalNote = {
  header: {
    practice: 'Apex Dental',
    patient: 'Test Patient',
    mrn: '999',
    date: '2026-08-14',
    provider: 'Dr. Test, DMD',
    assistants: 'Assistant',
    procedure: 'Restorative treatment',
  },
  narrative: ['Narrative.'],
  sections: [],
  chronology: [],
  signatures: { providerDataUrl: null, companion: 'Companion', signedAt: '10:41' },
  disposition: { kind: 'sedation', released: true, at: '10:40' },
  generatedAt: '2026-08-14 13:30',
};

const note = computed(() => NOTE);

function setup(mrn = '999') {
  const patient = usePatientStore();
  patient.mrn = mrn;
  return { chart: useSendToChart(note), send: useChartSendStore() };
}

/** Walk the flow the operator does: tap, confirm the name, write. */
async function sendAndConfirm(chart: ReturnType<typeof useSendToChart>): Promise<void> {
  await chart.requestSend();
  await chart.confirmSend();
}

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
  readCredentials.mockReturnValue({ developerKey: 'D', customerKey: 'C' });
  getPatient.mockResolvedValue({
    PatNum: 999,
    LName: 'Test',
    FName: 'Patient',
    Birthdate: '1986-01-02',
  });
  postCommlog.mockResolvedValue(undefined);
  uploadDocument.mockResolvedValue({ docNum: 1 });
  clinicalNoteToPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('preconditions', () => {
  it('is inert with no credentials and points at settings', async () => {
    readCredentials.mockReturnValue(null);
    const { chart } = setup();

    expect(chart.precondition.value.ready).toBe(false);
    expect(chart.precondition.value.needsSettings).toBe(true);

    await chart.requestSend();
    expect(getPatient).not.toHaveBeenCalled();
  });

  it.each([
    ['', /Add the patient ID/],
    ['ABC-12', /digits only/],
  ])('refuses MRN %j', async (mrn, reason) => {
    const { chart } = setup(mrn);
    expect(chart.precondition.value.ready).toBe(false);
    expect(chart.precondition.value.reason).toMatch(reason);

    await chart.requestSend();
    expect(getPatient).not.toHaveBeenCalled();
  });
});

describe('the wrong-patient guard', () => {
  it('fails at lookup — before any write — when the ID is unknown', async () => {
    getPatient.mockRejectedValue(new OdError('http', 'not found', 404));
    const { chart } = setup();

    await chart.requestSend();

    expect(chart.confirmTarget.value).toBeNull();
    expect(chart.lookupError.value).toMatch(/No patient found for ID 999/);
    expect(postCommlog).not.toHaveBeenCalled();
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it('leads the confirmation with the name and date of birth, not the number', async () => {
    const { chart } = setup();

    await chart.requestSend();

    expect(chart.confirmTarget.value).toMatchObject({
      patNum: 999,
      name: 'Test, Patient',
      birthdate: '1986-01-02',
    });
    // Nothing is written until the provider confirms.
    expect(postCommlog).not.toHaveBeenCalled();
  });

  /**
   * The one hard stop in the chart-lookup work. Everything in Phase 1 is
   * advisory, but if the chart confirmed at the start of the case is not the
   * chart the note is about to be filed into, the MRN changed mid-case —
   * which is the wrong-patient scenario itself, not a stale field.
   */
  it('refuses when the chart resolved now is not the one the case started against', async () => {
    const patient = usePatientStore();
    patient.resolvedIdentity = {
      patNum: 999,
      lName: 'Rivera',
      fName: 'Dana',
      birthdate: '1987-01-01',
      resolvedAt: Date.now(),
      confirmedAt: Date.now(),
    };
    // Same ID, but the chart now names somebody else.
    getPatient.mockResolvedValue({
      PatNum: 999,
      LName: 'Okafor',
      FName: 'Sam',
      Birthdate: '1990-05-05',
    });
    const { chart } = setup();

    await chart.requestSend();

    expect(chart.confirmTarget.value).toBeNull();
    expect(chart.lookupError.value).toMatch(/started against Rivera, Dana/);
    expect(chart.lookupError.value).toMatch(/nothing has been written/i);

    await chart.confirmSend();
    expect(postCommlog).not.toHaveBeenCalled();
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it('proceeds when the identity still matches, ignoring case and spacing', async () => {
    const patient = usePatientStore();
    patient.resolvedIdentity = {
      patNum: 999,
      lName: ' test ',
      fName: 'PATIENT',
      birthdate: '1986-01-02',
      resolvedAt: Date.now(),
      confirmedAt: Date.now(),
    };
    const { chart } = setup();

    await chart.requestSend();

    expect(chart.lookupError.value).toBe('');
    expect(chart.confirmTarget.value).toMatchObject({ patNum: 999 });
  });

  it('does not stop a case that was never resolved at the start', async () => {
    // Offline at intake, or no keys then — an ordinary state, not a blocker.
    usePatientStore().resolvedIdentity = null;
    const { chart } = setup();

    await chart.requestSend();

    expect(chart.lookupError.value).toBe('');
    expect(chart.confirmTarget.value).not.toBeNull();
  });

  it('writes nothing if the operator cancels', async () => {
    const { chart } = setup();
    await chart.requestSend();
    chart.cancelSend();
    expect(postCommlog).not.toHaveBeenCalled();
  });
});

describe('a clean send', () => {
  it('writes both artifacts and records them', async () => {
    const { chart, send } = setup();

    await sendAndConfirm(chart);

    expect(postCommlog).toHaveBeenCalledTimes(1);
    expect(uploadDocument).toHaveBeenCalledTimes(1);
    expect(send.commlog.status).toBe('sent');
    expect(send.pdf.status).toBe('sent');
    expect(send.allSent).toBe(true);
  });

  it('prepends the attribution, since API writes have no author', async () => {
    const { chart } = setup();
    await sendAndConfirm(chart);

    const body = postCommlog.mock.calls[0]?.[0] as { note: string };
    expect(body.note).toMatch(/^Sedation note generated by Sedation Pro/);
    expect(body.note).toContain('APEX DENTAL');
  });

  it('blocks the primary action once everything is filed', async () => {
    const { chart } = setup();
    await sendAndConfirm(chart);

    expect(chart.precondition.value.ready).toBe(false);
    expect(chart.primaryLabel.value).toBe('Sent to chart');

    postCommlog.mockClear();
    await chart.requestSend();
    expect(postCommlog).not.toHaveBeenCalled();
  });
});

describe('irreversibility', () => {
  /**
   * The failure this whole design exists to prevent: the commlog lands, the
   * PDF does not, and the retry re-posts the note. A commlog cannot be
   * deleted through the API, so a second one is permanent.
   */
  it('never re-posts a commlog that already succeeded', async () => {
    uploadDocument.mockRejectedValueOnce(new OdError('http', 'rejected', 400));
    const { chart, send } = setup();

    await sendAndConfirm(chart);
    expect(send.commlog.status).toBe('sent');
    expect(send.pdf.status).toBe('failed');
    expect(chart.primaryLabel.value).toBe('Retry PDF only');

    postCommlog.mockClear();
    uploadDocument.mockClear();
    uploadDocument.mockResolvedValue({ docNum: 2 });

    await sendAndConfirm(chart);

    expect(postCommlog).not.toHaveBeenCalled();
    expect(uploadDocument).toHaveBeenCalledTimes(1);
    expect(send.allSent).toBe(true);
  });

  it('says plainly that nothing reached the chart when the first write fails', async () => {
    postCommlog.mockRejectedValue(new OdError('network', 'Could not reach Open Dental.'));
    uploadDocument.mockRejectedValue(new OdError('network', 'Could not reach Open Dental.'));
    const { chart, send } = setup();

    await sendAndConfirm(chart);

    expect(send.anythingSent).toBe(false);
    expect(chart.resultLines.value.some((l) => /Nothing was written/i.test(l.text))).toBe(true);
  });

  it('warns against resending once part of the note is filed', async () => {
    uploadDocument.mockRejectedValueOnce(new OdError('http', 'rejected', 400));
    const { chart } = setup();

    await sendAndConfirm(chart);

    const text = chart.resultLines.value.map((l) => l.text).join(' ');
    expect(text).toMatch(/already in the chart/i);
    expect(text).toMatch(/cannot be removed/i);
  });

  it('survives a reload with the sent marker intact', async () => {
    uploadDocument.mockRejectedValueOnce(new OdError('http', 'rejected', 400));
    const { chart } = setup();
    await sendAndConfirm(chart);

    // Fresh pinia, same localStorage — what a tablet reload looks like.
    setActivePinia(createPinia());
    const reloaded = setup();

    expect(reloaded.send.commlog.status).toBe('sent');
    expect(reloaded.chart.primaryLabel.value).toBe('Retry PDF only');
  });

  it('blocks sending when the MRN changed after a recorded send', async () => {
    const { chart } = setup();
    await sendAndConfirm(chart);

    usePatientStore().mrn = '1000';
    const moved = useSendToChart(note);

    expect(moved.precondition.value.ready).toBe(false);
    expect(moved.precondition.value.reason).toMatch(/MRN has changed/i);
  });
});

describe('rate limiting', () => {
  it('spaces the two writes for the 1 req/sec limit', async () => {
    vi.useFakeTimers();
    const { chart } = setup();

    await chart.requestSend();
    const pending = chart.confirmSend();

    // Let the commlog settle, then confirm the upload is still waiting.
    await vi.advanceTimersByTimeAsync(0);
    expect(postCommlog).toHaveBeenCalledTimes(1);
    expect(uploadDocument).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_SPACING_MS);
    await pending;
    expect(uploadDocument).toHaveBeenCalledTimes(1);
  });
});
