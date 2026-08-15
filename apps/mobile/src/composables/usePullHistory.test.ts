import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readCredentials = vi.fn();
const getDiseases = vi.fn();
const getAllergies = vi.fn();
const getMedications = vi.fn();

vi.mock('@/services/od-credentials', () => ({
  readCredentials: () => readCredentials() as unknown,
}));

vi.mock('@/services/opendental', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/opendental')>('@/services/opendental');
  return {
    ...actual,
    getDiseases: (...a: unknown[]) => getDiseases(...a) as unknown,
    getAllergies: (...a: unknown[]) => getAllergies(...a) as unknown,
    getMedications: (...a: unknown[]) => getMedications(...a) as unknown,
  };
});

const { OdError } = await import('@/services/opendental');
const { usePullHistory, CHART_READ_SPACING_MS } = await import('./usePullHistory');
const { usePatientStore } = await import('@/stores/patient');

const VOCAB = ['CVD', 'Hypertension', 'Diabetes', 'Asthma', 'GERD'];
const PAT = 4242;

/** Drive the three sequential reads to completion. */
async function runPull(h: ReturnType<typeof usePullHistory>): Promise<void> {
  const done = h.pull(PAT);
  await vi.advanceTimersByTimeAsync(CHART_READ_SPACING_MS * 2 + 50);
  await done;
  await nextTick();
}

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.useFakeTimers();
  readCredentials.mockReturnValue({ developerKey: 'D', customerKey: 'C' });
  getDiseases.mockResolvedValue([]);
  getAllergies.mockResolvedValue([]);
  getMedications.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('inert without credentials', () => {
  it('makes no request', async () => {
    readCredentials.mockReturnValue(null);
    const h = usePullHistory(VOCAB);

    await h.pull(PAT);

    expect(getDiseases).not.toHaveBeenCalled();
    expect(h.canPull.value).toBe(false);
  });
});

describe('fetching', () => {
  it('reads the three lists sequentially, never in parallel', async () => {
    const h = usePullHistory(VOCAB);
    const done = h.pull(PAT);

    // Only the first read has gone out until the rate-limit gap elapses.
    await vi.advanceTimersByTimeAsync(0);
    expect(getDiseases).toHaveBeenCalledTimes(1);
    expect(getAllergies).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(CHART_READ_SPACING_MS);
    expect(getAllergies).toHaveBeenCalledTimes(1);
    expect(getMedications).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(CHART_READ_SPACING_MS);
    await done;
    expect(getMedications).toHaveBeenCalledTimes(1);
    expect(h.status.value).toBe('ready');
  });

  it('reports a failure without changing a single field', async () => {
    getDiseases.mockRejectedValue(new OdError('network', 'Could not reach Open Dental.'));
    const patient = usePatientStore();
    patient.allergiesList = 'Penicillin';
    const h = usePullHistory(VOCAB);

    await runPull(h);

    expect(h.status.value).toBe('error');
    expect(h.error.value).toMatch(/Could not reach/);
    expect(patient.allergiesList).toBe('Penicillin');
  });
});

describe('proposing, not applying', () => {
  it('changes nothing until the clinician accepts', async () => {
    getDiseases.mockResolvedValue([{ diseaseDefName: 'Asthma', ProbStatus: 'Active' }]);
    getAllergies.mockResolvedValue([{ defDescription: 'Latex', StatusIsActive: 'true' }]);
    const patient = usePatientStore();
    const h = usePullHistory(VOCAB);

    await runPull(h);

    expect(patient.medicalProblems).toEqual([]);
    expect(patient.allergiesList).toBe('');

    h.acceptAll();
    expect(patient.medicalProblems).toContain('Asthma');
    expect(patient.allergiesList).toBe('Latex');
  });

  /**
   * The clinician typed it after talking to the person in the chair; the
   * chart is second-hand. Accepting is explicit, per field.
   */
  it('does not silently overwrite what the clinician already typed', async () => {
    getAllergies.mockResolvedValue([{ defDescription: 'Latex', StatusIsActive: 'true' }]);
    const patient = usePatientStore();
    patient.allergiesList = 'Shellfish — anaphylaxis';
    const h = usePullHistory(VOCAB);

    await runPull(h);
    expect(patient.allergiesList).toBe('Shellfish — anaphylaxis');

    h.accept('allergies');
    expect(patient.allergiesList).toBe('Latex');
  });

  it('adds chart conditions without dropping ones already entered', async () => {
    getDiseases.mockResolvedValue([{ diseaseDefName: 'Asthma', ProbStatus: 'Active' }]);
    const patient = usePatientStore();
    patient.medicalProblems = ['Chronic pain'];
    const h = usePullHistory(VOCAB);

    await runPull(h);
    h.accept('problems');

    expect(patient.medicalProblems).toEqual(['Chronic pain', 'Asthma']);
  });

  it('marks a field as no-change when the chart adds nothing', async () => {
    getDiseases.mockResolvedValue([{ diseaseDefName: 'Asthma', ProbStatus: 'Active' }]);
    const patient = usePatientStore();
    patient.medicalProblems = ['Asthma'];
    const h = usePullHistory(VOCAB);

    await runPull(h);

    expect(h.proposals.value.find((p) => p.key === 'problems')?.changes).toBe(false);
  });
});

describe('interaction with existing store wiring', () => {
  /**
   * `medicalProblems` containing 'Diabetes' is bidirectionally bound to the
   * `diabetic` boolean, which in turn gates the required baseline-glucose
   * field. Writing through the array lets that watcher fire; setting
   * `diabetic` directly, or bypassing the array, would desync them.
   */
  it('keeps the diabetic flag in sync when Diabetes arrives from the chart', async () => {
    getDiseases.mockResolvedValue([{ diseaseDefName: 'diabetes', ProbStatus: 'Active' }]);
    const patient = usePatientStore();
    expect(patient.diabetic).toBe(false);

    const h = usePullHistory(VOCAB);
    await runPull(h);
    h.accept('problems');
    await nextTick();

    expect(patient.medicalProblems).toContain('Diabetes');
    expect(patient.diabetic).toBe(true);
  });
});

describe('warnings', () => {
  it('surfaces a chart that claims NKDA and lists allergies', async () => {
    getAllergies.mockResolvedValue([
      { defDescription: '*NKDA', StatusIsActive: 'true' },
      { defDescription: 'Penicillin', StatusIsActive: 'true' },
    ]);
    const h = usePullHistory(VOCAB);

    await runPull(h);

    expect(h.warnings.value.join(' ')).toMatch(/contradict/i);
  });

  it('stays quiet on an ordinary chart', async () => {
    getAllergies.mockResolvedValue([{ defDescription: '*NKDA', StatusIsActive: 'true' }]);
    const h = usePullHistory(VOCAB);

    await runPull(h);

    expect(h.warnings.value).toEqual([]);
    expect(h.proposals.value.find((p) => p.key === 'allergies')?.chartText).toBe('NKDA');
  });
});
