import { computed, ref, type ComputedRef, type Ref } from 'vue';

import {
  mapDiseasesToProblems,
  summariseAllergies,
  summariseMedications,
  type OdAllergyRow,
  type OdDiseaseRow,
  type OdMedicationRow,
} from './chartHistory';
import { readCredentials } from '@/services/od-credentials';
import {
  describeOdError,
  getAllergies,
  getDiseases,
  getMedications,
  isOdError,
} from '@/services/opendental';
import { usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';

/**
 * Pull the patient's problems, allergies and medications from Open Dental
 * and PROPOSE them for the Phase 1 history fields.
 *
 * Two rules shape this:
 *
 * 1. **Nothing is applied without acceptance.** The clinician typed what
 *    they typed after talking to the person in the chair; the chart is
 *    second-hand and goes stale. A sedation assessment is the moment you
 *    find out it has. The per-field confirmation is the feature, not
 *    friction around it.
 * 2. **It is explicitly triggered, never automatic.** MRN resolution is one
 *    fast call that has to stay responsive while typing; this is three more
 *    against a 1 req/sec limit, so it only runs when asked.
 */

/** Sequential spacing for the three reads — the API allows 1 req/sec. */
export const CHART_READ_SPACING_MS = 1100;

export type PullStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ProposalKey = 'problems' | 'allergies' | 'medications';

export interface Proposal {
  readonly key: ProposalKey;
  readonly label: string;
  /** What the chart says, ready to display. */
  readonly chartText: string;
  /** What the field holds right now. */
  readonly currentText: string;
  /** False when the chart adds nothing over what is already there. */
  readonly changes: boolean;
  readonly applied: boolean;
}

export interface UsePullHistory {
  readonly status: Ref<PullStatus>;
  readonly error: Ref<string>;
  readonly proposals: ComputedRef<ReadonlyArray<Proposal>>;
  /** Contradictions worth a warning rather than a silent resolution. */
  readonly warnings: ComputedRef<ReadonlyArray<string>>;
  readonly fetchedAt: Ref<number | null>;
  /** Row counts from the last successful read. */
  readonly counts: Ref<{ problems: number; allergies: number; medications: number }>;
  readonly canPull: ComputedRef<boolean>;
  pull: (patNum: number) => Promise<void>;
  accept: (key: ProposalKey) => void;
  acceptAll: () => void;
  dismiss: () => void;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function usePullHistory(vocabulary: ReadonlyArray<string>): UsePullHistory {
  const patient = usePatientStore();
  const undo = useUndoStore();

  const status = ref<PullStatus>('idle');
  const error = ref('');
  const fetchedAt = ref<number | null>(null);
  const applied = ref<Set<ProposalKey>>(new Set());

  /** What the chart actually returned, for a concrete "it worked" readout. */
  const counts = ref<{ problems: number; allergies: number; medications: number }>({
    problems: 0,
    allergies: 0,
    medications: 0,
  });
  const chartProblems = ref<ReadonlyArray<string>>([]);
  const chartAllergies = ref('');
  const chartMedications = ref('');
  const nkdaContradiction = ref(false);

  const canPull = computed(() => readCredentials() !== null);

  async function pull(patNum: number): Promise<void> {
    const creds = readCredentials();
    if (creds === null) return;

    status.value = 'loading';
    error.value = '';
    applied.value = new Set();
    try {
      // Sequential, never parallel: three concurrent reads earn a 429 on a
      // 1 req/sec key and the whole pull fails for no reason.
      const diseases = (await getDiseases(patNum, creds)) as ReadonlyArray<OdDiseaseRow>;
      await sleep(CHART_READ_SPACING_MS);
      const allergies = (await getAllergies(patNum, creds)) as ReadonlyArray<OdAllergyRow>;
      await sleep(CHART_READ_SPACING_MS);
      const meds = (await getMedications(patNum, creds)) as ReadonlyArray<OdMedicationRow>;

      chartProblems.value = mapDiseasesToProblems(diseases, vocabulary).all;
      const allergySummary = summariseAllergies(allergies);
      chartAllergies.value = allergySummary.text;
      nkdaContradiction.value = allergySummary.contradiction;
      chartMedications.value = summariseMedications(meds);

      counts.value = {
        problems: chartProblems.value.length,
        allergies:
          allergySummary.text === ''
            ? 0
            : allergySummary.nkda
              ? 1
              : allergySummary.text.split(', ').length,
        medications: chartMedications.value === '' ? 0 : chartMedications.value.split(', ').length,
      };
      fetchedAt.value = Date.now();
      status.value = 'ready';
    } catch (e) {
      // A failed read costs nothing but the offer — the form stays fully
      // usable, and nothing changes.
      error.value = isOdError(e) ? describeOdError(e) : 'Could not reach the chart.';
      status.value = 'error';
    }
  }

  const proposals = computed<ReadonlyArray<Proposal>>(() => {
    if (status.value !== 'ready') return [];

    const problemsNew = chartProblems.value.filter((p) => !patient.medicalProblems.includes(p));
    return [
      {
        key: 'problems' as const,
        label: 'Medical problems',
        chartText: chartProblems.value.join(', ') || '— none active —',
        currentText: patient.medicalProblems.join(', ') || '—',
        changes: problemsNew.length > 0,
        applied: applied.value.has('problems'),
      },
      {
        key: 'allergies' as const,
        label: 'Allergies',
        chartText: chartAllergies.value || '— nothing recorded —',
        currentText: patient.allergiesList.trim() || '—',
        changes:
          chartAllergies.value !== '' && chartAllergies.value !== patient.allergiesList.trim(),
        applied: applied.value.has('allergies'),
      },
      {
        key: 'medications' as const,
        label: 'Medications',
        chartText: chartMedications.value || '— nothing recorded —',
        currentText: patient.medicationsList.trim() || '—',
        changes:
          chartMedications.value !== '' &&
          chartMedications.value !== patient.medicationsList.trim(),
        applied: applied.value.has('medications'),
      },
    ];
  });

  const warnings = computed<ReadonlyArray<string>>(() => {
    const out: string[] = [];
    if (nkdaContradiction.value) {
      out.push(
        'The chart records NKDA *and* specific allergies. Those contradict each other — ' +
          'confirm with the patient before accepting either.',
      );
    }
    return out;
  });

  /**
   * Add the chart's entries to a free-text field without discarding what the
   * clinician typed.
   *
   * Replacing was the original behaviour and it was wrong for the same
   * reason the problems list merges: the text was written after talking to
   * the person in the chair, and the chart is second-hand. Entries already
   * present are skipped so accepting twice cannot duplicate.
   */
  function mergeText(current: string, incoming: string): string {
    const existing = current.trim();
    if (incoming === '') return existing;
    if (existing === '') return incoming;
    const haystack = existing.toLowerCase();
    const additions = incoming
      .split(', ')
      .map((e) => e.trim())
      .filter((e) => e !== '' && !haystack.includes(e.toLowerCase()));
    return additions.length === 0 ? existing : `${existing}, ${additions.join(', ')}`;
  }

  function accept(key: ProposalKey): void {
    if (status.value !== 'ready') return;

    // Captured before the write so the undo can put it back exactly.
    const beforeProblems = [...patient.medicalProblems];
    const beforeAllergies = patient.allergiesList;
    const beforeMedications = patient.medicationsList;
    const beforeNkda = patient.nkdaConfirmed;

    let label = '';
    let after = '';

    if (key === 'problems') {
      // Union, not replace. These are a set of conditions: adding the
      // chart's must never silently drop one the clinician just entered
      // from talking to the patient. Written through `medicalProblems` so
      // the store's existing Diabetes <-> `diabetic` watchers fire — setting
      // `diabetic` directly, or bypassing the array, desyncs them.
      const merged = [...patient.medicalProblems];
      for (const p of chartProblems.value) if (!merged.includes(p)) merged.push(p);
      patient.medicalProblems = merged;
      label = 'Medical problems';
      after = merged.join(', ');
    } else if (key === 'allergies') {
      // The chart's NKDA is an assertion about the patient, so it maps onto
      // the tickbox rather than being pasted in as if it were a substance.
      if (chartAllergies.value === 'NKDA') {
        patient.nkdaConfirmed = true;
        after = 'NKDA';
      } else if (chartAllergies.value !== '') {
        patient.allergiesList = mergeText(patient.allergiesList, chartAllergies.value);
        after = patient.allergiesList;
      }
      label = 'Allergies';
    } else {
      if (chartMedications.value !== '') {
        patient.medicationsList = mergeText(patient.medicationsList, chartMedications.value);
        after = patient.medicationsList;
      }
      label = 'Medications';
    }

    applied.value = new Set([...applied.value, key]);

    // Same idiom as every other mutating action in the app: an undo entry,
    // and a row in the event log so the note records that this came from the
    // chart rather than from the patient.
    undo.stamp({
      event: 'Chart history accepted',
      details: { Field: label, Value: after || '—', Source: 'Open Dental' },
      toast: { label: `✓ ${label} accepted from chart`, tone: 'safe' },
      revert: () => {
        patient.medicalProblems = beforeProblems;
        patient.allergiesList = beforeAllergies;
        patient.medicationsList = beforeMedications;
        patient.nkdaConfirmed = beforeNkda;
        applied.value = new Set([...applied.value].filter((k) => k !== key));
      },
    });
  }

  function acceptAll(): void {
    for (const p of proposals.value) if (p.changes) accept(p.key);
  }

  function dismiss(): void {
    status.value = 'idle';
    error.value = '';
  }

  return {
    status,
    error,
    proposals,
    warnings,
    fetchedAt,
    counts,
    canPull,
    pull,
    accept,
    acceptAll,
    dismiss,
  };
}
