import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';

import { ageFromBirthdate, chartDisplayName, namesDisagree } from './chartHistory';
import { readCredentials } from '@/services/od-credentials';
import { describeOdError, getPatient, isOdError } from '@/services/opendental';
import { usePatientStore } from '@/stores/patient';

/**
 * Resolve the typed MRN against Open Dental while the clinician is still in
 * Phase 1, so a wrong number is caught at 9am rather than at 11am when the
 * note can no longer be filed to the right chart.
 *
 * Everything here is ADVISORY. It never gates the form, never prevents
 * typing, and never blocks the case: a sedation case cannot stall because a
 * lookup timed out. Not-found in particular is a strong warning and nothing
 * more — walk-ins and emergencies exist, and the clinician may legitimately
 * proceed and fix the number later.
 *
 * With no API keys stored, this does nothing at all: no timer, no request,
 * no UI. Phase 1 behaves exactly as it did before the feature existed.
 */

/** Long enough that typing a 5-digit MRN fires one request, not five. */
export const MRN_DEBOUNCE_MS = 400;

export type MrnResolveStatus = 'idle' | 'checking' | 'resolved' | 'not-found' | 'unavailable';

export interface MrnMismatch {
  readonly kind: 'name' | 'age';
  readonly message: string;
  /** The chart's value, offered as a one-tap correction. */
  readonly chartValue: string;
}

export interface UseMrnResolve {
  readonly status: Ref<MrnResolveStatus>;
  /** `LName, FName` once resolved. */
  readonly chartName: Ref<string>;
  readonly chartBirthdate: Ref<string>;
  readonly chartAge: Ref<number | null>;
  /** Muted explanation for the `unavailable` state. */
  readonly unavailableReason: Ref<string>;
  /** Blank fields this lookup filled from the chart. */
  readonly autoFilled: Ref<ReadonlyArray<'name' | 'age'>>;
  /** Name and/or age disagreements against what the clinician typed. */
  readonly mismatches: ComputedRef<ReadonlyArray<MrnMismatch>>;
  readonly enabled: ComputedRef<boolean>;
  /** Resolve immediately, skipping the debounce (used on blur). */
  resolveNow: () => Promise<void>;
  /** True once the clinician has confirmed this is the right person. */
  readonly identityConfirmed: ComputedRef<boolean>;
  /** Confirm the identity, filling any blank name / age from the chart. */
  confirmIdentity: () => void;
  /** Adopt the chart's spelling / computed age into the form. */
  applyChartName: () => void;
  applyChartAge: () => void;
}

export function useMrnResolve(): UseMrnResolve {
  const patient = usePatientStore();

  const status = ref<MrnResolveStatus>('idle');
  const chartName = ref('');
  const chartBirthdate = ref('');
  const chartAge = ref<number | null>(null);
  const unavailableReason = ref('');
  /**
   * Fields this lookup filled because they were still blank. Surfaced so the
   * clinician can see the form wrote itself from the chart rather than
   * wondering where a value came from — a silent write into a clinical
   * record is exactly what the review panel exists to avoid elsewhere.
   */
  const autoFilled = ref<ReadonlyArray<'name' | 'age'>>([]);

  /** Guards against a slow early request overwriting a newer one. */
  let requestSeq = 0;
  /**
   * The MRN behind the current resolution. Blur fires `resolveNow`, and
   * blur happens when the clinician taps the "Pull history" button that sits
   * directly below — re-querying there would flip the status back to
   * `checking` and unmount the control mid-tap, so the tap lands on nothing.
   * Re-resolving an unchanged MRN buys nothing anyway.
   */
  let resolvedFor: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const enabled = computed(() => readCredentials() !== null);

  const parsedMrn = computed<number | null>(() => {
    const raw = patient.mrn.trim();
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  });

  function clearResolution(next: MrnResolveStatus): void {
    status.value = next;
    resolvedFor = null;
    chartName.value = '';
    chartBirthdate.value = '';
    chartAge.value = null;
    if (next !== 'unavailable') unavailableReason.value = '';
    autoFilled.value = [];
    // A cleared resolution must clear the stored identity too, or a stale
    // one would be compared against at send time.
    patient.resolvedIdentity = null;
  }

  async function resolveNow(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const creds = readCredentials();
    const patNum = parsedMrn.value;
    if (creds === null || patNum === null) {
      clearResolution('idle');
      return;
    }

    if (patNum === resolvedFor && status.value === 'resolved') return;

    const seq = ++requestSeq;
    status.value = 'checking';
    try {
      const found = await getPatient(patNum, creds);
      if (seq !== requestSeq) return; // superseded by a newer keystroke
      chartName.value = chartDisplayName(found.LName, found.FName);
      chartBirthdate.value = found.Birthdate;
      chartAge.value = ageFromBirthdate(found.Birthdate, new Date());
      status.value = 'resolved';
      resolvedFor = patNum;
      unavailableReason.value = '';
      // A re-resolve of the SAME chart keeps its confirmation: blur and
      // reload must not re-ask a question the clinician already answered.
      const alreadyConfirmed =
        patient.resolvedIdentity?.patNum === patNum ? patient.resolvedIdentity.confirmedAt : null;
      patient.resolvedIdentity = {
        patNum,
        lName: found.LName,
        fName: found.FName,
        birthdate: found.Birthdate,
        resolvedAt: Date.now(),
        confirmedAt: alreadyConfirmed,
      };
    } catch (error) {
      if (seq !== requestSeq) return;
      // 404 is a real answer about the chart; anything else — offline,
      // timeout, a 500 — is us being unable to check, which is a muted
      // condition rather than a claim about the patient.
      if (isOdError(error) && error.kind === 'http' && error.status === 404) {
        clearResolution('not-found');
      } else {
        unavailableReason.value = isOdError(error)
          ? describeOdError(error)
          : 'Could not reach the chart.';
        clearResolution('unavailable');
      }
    }
  }

  watch(
    () => patient.mrn,
    () => {
      if (timer !== null) clearTimeout(timer);
      if (!enabled.value) {
        clearResolution('idle');
        return;
      }
      if (parsedMrn.value === null) {
        // Invalidate immediately: a half-typed MRN must not leave the
        // previous patient's name sitting under the field.
        requestSeq++;
        clearResolution('idle');
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        void resolveNow();
      }, MRN_DEBOUNCE_MS);
    },
  );

  // Guarded: the composable is also exercised outside a component scope (in
  // tests), where an unguarded registration warns and does nothing useful.
  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      if (timer !== null) clearTimeout(timer);
    });
  }

  const mismatches = computed<ReadonlyArray<MrnMismatch>>(() => {
    if (status.value !== 'resolved') return [];
    const out: MrnMismatch[] = [];

    const typedName = patient.name.trim();
    const [lName, fName] = chartName.value.split(', ');
    if (typedName !== '' && namesDisagree(typedName, lName ?? '', fName ?? '')) {
      out.push({
        kind: 'name',
        message: `Chart has "${chartName.value}" — the name typed here is "${typedName}".`,
        chartValue: chartName.value,
      });
    }

    // Age feeds dosing judgement, so two sources of truth must not silently
    // differ. Only flag when the clinician actually typed one.
    if (chartAge.value !== null && patient.age !== null && patient.age !== chartAge.value) {
      out.push({
        kind: 'age',
        message: `Chart birthdate gives ${chartAge.value}y — this case says ${patient.age}y.`,
        chartValue: String(chartAge.value),
      });
    }
    return out;
  });

  /**
   * The wrong-patient guard, made active.
   *
   * With the MRN entered before the name, both cross-check fields are blank
   * when the chart resolves — so they fill FROM the chart and can never
   * disagree with it. The machine check is therefore vacuous here, and the
   * clinician reading the name and date of birth against the person in the
   * chair is what actually catches a mistyped-but-valid ID, which returns a
   * different real patient rather than an error.
   *
   * Filling on confirmation rather than on resolve keeps one acceptance
   * model across the whole feature: nothing from the chart enters the record
   * until a human has looked at it.
   */
  function confirmIdentity(): void {
    if (status.value !== 'resolved' || patient.resolvedIdentity === null) return;
    patient.resolvedIdentity = { ...patient.resolvedIdentity, confirmedAt: Date.now() };

    const filled: Array<'name' | 'age'> = [];
    if (patient.age === null && chartAge.value !== null) {
      patient.age = chartAge.value;
      filled.push('age');
    }
    if (patient.name.trim() === '' && chartName.value !== '') {
      patient.name = chartName.value;
      filled.push('name');
    }
    autoFilled.value = filled;
  }

  const identityConfirmed = computed(
    () => status.value === 'resolved' && patient.resolvedIdentity?.confirmedAt != null,
  );

  function applyChartName(): void {
    if (chartName.value === '') return;
    // Store the chart's own "Last, First" so the note header matches the
    // chart it is filed into.
    patient.name = chartName.value;
  }

  function applyChartAge(): void {
    if (chartAge.value !== null) patient.age = chartAge.value;
  }

  return {
    status,
    chartName,
    chartBirthdate,
    chartAge,
    unavailableReason,
    autoFilled,
    identityConfirmed,
    confirmIdentity,
    mismatches,
    enabled,
    resolveNow,
    applyChartName,
    applyChartAge,
  };
}
