import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readCredentials = vi.fn();
const getPatient = vi.fn();

vi.mock('@/services/od-credentials', () => ({
  readCredentials: () => readCredentials() as unknown,
}));

vi.mock('@/services/opendental', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/opendental')>('@/services/opendental');
  return { ...actual, getPatient: (...a: unknown[]) => getPatient(...a) as unknown };
});

const { OdError } = await import('@/services/opendental');
const { useMrnResolve, MRN_DEBOUNCE_MS } = await import('./useMrnResolve');
const { usePatientStore } = await import('@/stores/patient');

/** Invented chart record — no real patient data in fixtures. */
const CHART = { PatNum: 4242, LName: 'Rivera', FName: 'Dana', Birthdate: '1987-01-01' };

/** Let the debounce fire and the resolve promise settle. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(MRN_DEBOUNCE_MS + 10);
  await nextTick();
}

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.useFakeTimers();
  readCredentials.mockReturnValue({ developerKey: 'D', customerKey: 'C' });
  getPatient.mockResolvedValue(CHART);
  vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('inert without credentials', () => {
  it('makes no request and shows nothing', async () => {
    readCredentials.mockReturnValue(null);
    const patient = usePatientStore();
    const r = useMrnResolve();

    patient.mrn = '4242';
    await settle();

    expect(getPatient).not.toHaveBeenCalled();
    expect(r.enabled.value).toBe(false);
    expect(r.status.value).toBe('idle');
  });
});

describe('the resolve state machine', () => {
  it('debounces a burst of keystrokes into one request', async () => {
    const patient = usePatientStore();
    useMrnResolve();

    patient.mrn = '4';
    await nextTick();
    patient.mrn = '42';
    await nextTick();
    patient.mrn = '4242';
    await settle();

    expect(getPatient).toHaveBeenCalledTimes(1);
    expect(getPatient.mock.calls[0]?.[0]).toBe(4242);
  });

  it('resolves to the chart name, DOB and computed age', async () => {
    const patient = usePatientStore();
    const r = useMrnResolve();

    patient.mrn = '4242';
    await settle();

    expect(r.status.value).toBe('resolved');
    expect(r.chartName.value).toBe('Rivera, Dana');
    expect(r.chartBirthdate.value).toBe('1987-01-01');
    expect(r.chartAge.value).toBe(39);
  });

  it('stores the identity so send-time can compare against it', async () => {
    const patient = usePatientStore();
    useMrnResolve();

    patient.mrn = '4242';
    await settle();

    expect(patient.resolvedIdentity).toMatchObject({
      patNum: 4242,
      lName: 'Rivera',
      fName: 'Dana',
    });
  });

  /** A strong warning, never a gate — walk-ins and emergencies exist. */
  it('reports not-found without blocking anything', async () => {
    getPatient.mockRejectedValue(new OdError('http', 'no such patient', 404));
    const patient = usePatientStore();
    const r = useMrnResolve();

    patient.mrn = '4242';
    await settle();

    expect(r.status.value).toBe('not-found');
    expect(patient.resolvedIdentity).toBeNull();
    // The field itself is untouched: the clinician can carry on typing.
    expect(patient.mrn).toBe('4242');
  });

  it('treats a network failure as unverifiable, not as a claim about the patient', async () => {
    getPatient.mockRejectedValue(new OdError('network', 'Could not reach Open Dental.'));
    const patient = usePatientStore();
    const r = useMrnResolve();

    patient.mrn = '4242';
    await settle();

    expect(r.status.value).toBe('unavailable');
    expect(r.unavailableReason.value).toMatch(/Could not reach/);
  });

  it('clears a stale resolution the moment the MRN stops being valid', async () => {
    const patient = usePatientStore();
    const r = useMrnResolve();

    patient.mrn = '4242';
    await settle();
    expect(r.status.value).toBe('resolved');

    // Half-typed: the previous patient's name must not linger under the field.
    patient.mrn = '';
    await nextTick();
    expect(r.status.value).toBe('idle');
    expect(r.chartName.value).toBe('');
    expect(patient.resolvedIdentity).toBeNull();
  });

  /**
   * Two requests genuinely in flight: the first is left hanging until after
   * the second has resolved. Without the sequence guard the late arrival
   * would overwrite the current patient's name with the previous one's — the
   * field would read as verified while naming somebody else.
   */
  it('ignores a slow early response that a newer keystroke superseded', async () => {
    const patient = usePatientStore();
    const r = useMrnResolve();

    let releaseFirst: ((v: unknown) => void) | undefined;
    getPatient.mockImplementationOnce(
      () =>
        new Promise((res) => {
          releaseFirst = res;
        }),
    );

    patient.mrn = '1';
    await vi.advanceTimersByTimeAsync(MRN_DEBOUNCE_MS + 10); // first request in flight
    expect(getPatient).toHaveBeenCalledTimes(1);

    patient.mrn = '4242';
    await settle(); // second request fires and resolves
    expect(r.chartName.value).toBe('Rivera, Dana');

    releaseFirst?.({ PatNum: 1, LName: 'Stale', FName: 'Old', Birthdate: '1970-01-01' });
    await nextTick();

    expect(r.chartName.value).toBe('Rivera, Dana');
    expect(patient.resolvedIdentity?.patNum).toBe(4242);
  });
});

describe('re-checking an unchanged MRN', () => {
  /**
   * Found by driving the real UI. Blur fires `resolveNow`, and blur is what
   * happens when the clinician taps the "Pull history from chart" button
   * sitting directly below the field. Re-querying flipped the status back to
   * `checking`, which unmounted that button mid-tap — so the tap landed on
   * nothing and the feature appeared dead.
   */
  it('stays resolved instead of flipping back to checking', async () => {
    const patient = usePatientStore();
    const r = useMrnResolve();

    patient.mrn = '4242';
    await settle();
    expect(r.status.value).toBe('resolved');

    await r.resolveNow(); // what blur does

    expect(r.status.value).toBe('resolved');
    expect(getPatient).toHaveBeenCalledTimes(1);
  });

  it('does re-check once the MRN actually changes', async () => {
    const patient = usePatientStore();
    useMrnResolve();

    patient.mrn = '4242';
    await settle();
    patient.mrn = '4243';
    await settle();

    expect(getPatient).toHaveBeenCalledTimes(2);
  });
});

describe('cross-checks against what was typed', () => {
  it('flags a different name and offers the chart spelling', async () => {
    const patient = usePatientStore();
    patient.name = 'John Smith';
    const r = useMrnResolve();

    patient.mrn = '4242';
    await settle();

    const nameMismatch = r.mismatches.value.find((m) => m.kind === 'name');
    expect(nameMismatch).toBeDefined();

    r.applyChartName();
    expect(patient.name).toBe('Rivera, Dana');
    expect(r.mismatches.value.find((m) => m.kind === 'name')).toBeUndefined();
  });

  it('stays quiet when the typed name matches in any order or case', async () => {
    const patient = usePatientStore();
    patient.name = 'dana rivera';
    const r = useMrnResolve();

    patient.mrn = '4242';
    await settle();

    expect(r.mismatches.value).toEqual([]);
  });

  /**
   * The case that motivated the feature: the note recorded an age two years
   * below what the chart's birthdate gives. Age feeds dosing judgement.
   */
  it('flags an age that disagrees with the chart birthdate and offers the computed one', async () => {
    const patient = usePatientStore();
    patient.age = 37;
    const r = useMrnResolve();

    patient.mrn = '4242';
    await settle();

    const ageMismatch = r.mismatches.value.find((m) => m.kind === 'age');
    expect(ageMismatch?.chartValue).toBe('39');

    r.applyChartAge();
    expect(patient.age).toBe(39);
    expect(r.mismatches.value.find((m) => m.kind === 'age')).toBeUndefined();
  });

  it('does not nag when the clinician has not typed an age yet', async () => {
    const patient = usePatientStore();
    patient.age = null;
    const r = useMrnResolve();

    patient.mrn = '4242';
    await settle();

    expect(r.mismatches.value.find((m) => m.kind === 'age')).toBeUndefined();
  });
});
