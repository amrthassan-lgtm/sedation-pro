import { computed, onScopeDispose, ref, watch } from 'vue';

import {
  PHASE1_AMENDMENT_EVENT,
  PHASE1_LOCK_EVENT,
  useEventLogStore,
  type LogEvent,
} from '@/stores/event-log';
import { formatAlcoholBucket, usePatientStore } from '@/stores/patient';
import { useToastStore } from '@/stores/toast';

const AMENDMENT_DEBOUNCE_MS = 3000;

/** Keys that identify the patient/encounter — recorded on lock for the
 * chronology row but excluded from amendment diffs (typo-fixes shouldn't
 * pollute the medicolegal record). */
const ADMIN_KEYS = ['Patient', 'Provider', 'MRN'] as const;

/** Keys whose changes ARE clinically meaningful and produce amendment
 * events. Order also drives the diff column order in the chronology. */
const CLINICAL_KEYS = [
  'Age',
  'Weight',
  'Height',
  'BMI',
  'BP',
  'SpO₂',
  'ASA',
  'Mallampati',
  'OSA',
  'NPO',
  'Consent',
  'Meds verified',
  'Last exam',
  'Diabetic',
  'Glucose',
  'Smoking',
  'Cigarettes/day',
  'Alcohol/wk',
  'Recreational drugs',
  'Medications',
  'Allergies',
  'Hospitalisations',
  'Surgeries',
  'Anesthesia history',
  'Family history',
  'EKG placed',
  'Time-out',
  'Team ready',
  'Emergency drugs',
  'Monitors functional',
] as const;

type Snapshot = Record<string, string>;

/**
 * Auto-records the Phase 1 pre-sedation assessment to the medicolegal event
 * log. Runs as two watchers:
 *
 * 1. **Lock** — when `isPhase1Complete` first transitions `false → true` in
 *    the encounter, append a `PHASE1_LOCK_EVENT` row capturing the full
 *    assessment snapshot. Toasts so the clinician sees confirmation.
 * 2. **Amendment** — once locked, any subsequent change to a clinical field
 *    (vitals, ASA, Mallampati, OSA, meds, etc., debounced 3s) appends a
 *    `PHASE1_AMENDMENT_EVENT` row containing only the diffed fields. Silent.
 *
 * Both watchers are guarded against the hydration race: never `immediate`,
 * and the lock watcher checks `phase1LockedAt` so a page reload re-opening
 * the same encounter doesn't double-stamp.
 *
 * Admin/identity fields (patient name, MRN, provider, assistants, procedure,
 * caregiver) are recorded in the lock event for the chronology row but are
 * not watched for amendments — typo-fixes shouldn't enter the audit trail.
 */
export function useAssessmentAudit(): void {
  const patient = usePatientStore();
  const log = useEventLogStore();
  const toast = useToastStore();

  function norm(v: string | number | null | undefined): string {
    if (v === null || v === undefined) return '—';
    const s = String(v).trim();
    return s === '' ? '—' : s;
  }

  function bool(v: boolean): string {
    return v ? 'Yes' : '—';
  }

  function buildClinicalSnapshot(): Snapshot {
    const bp = patient.baselineBp;
    const bpStr = bp.sbp !== null && bp.dbp !== null ? `${bp.sbp}/${bp.dbp}` : '—';
    const bmiStr = patient.bmi ? patient.bmi.value.toFixed(1) : '—';
    const spo2Str = patient.baselineSpo2 !== null ? `${patient.baselineSpo2}%` : '—';
    const weightStr = patient.weightLb !== null ? `${patient.weightLb} lb` : '—';
    const heightStr = patient.heightIn !== null ? `${patient.heightIn} in` : '—';
    const glucoseStr =
      patient.diabetic && patient.baselineGlucose !== null
        ? `${patient.baselineGlucose} mg/dL`
        : '—';
    const cigsStr =
      patient.smokingStatus === 'current' && patient.cigarettesPerDay !== null
        ? String(patient.cigarettesPerDay)
        : '—';

    return {
      Age: norm(patient.age),
      Weight: weightStr,
      Height: heightStr,
      BMI: bmiStr,
      BP: bpStr,
      'SpO₂': spo2Str,
      ASA: norm(patient.asaClass),
      Mallampati: norm(patient.mallampati),
      OSA: norm(patient.osaStatus),
      NPO: bool(patient.npoConfirmed),
      Consent: bool(patient.consentObtained),
      'Meds verified': bool(patient.medsVerified),
      'Last exam': norm(patient.lastExamDate),
      Diabetic: bool(patient.diabetic),
      Glucose: glucoseStr,
      Smoking: norm(patient.smokingStatus),
      'Cigarettes/day': cigsStr,
      'Alcohol/wk': formatAlcoholBucket(patient.alcoholPerWeek),
      'Recreational drugs': norm(patient.recreationalDrugs),
      Medications: norm(patient.medicationsList),
      Allergies: norm(patient.allergiesList),
      Hospitalisations: norm(patient.hospitalisations),
      Surgeries: norm(patient.surgeries),
      'Anesthesia history': norm(patient.anesthesiaHistory),
      'Family history': norm(patient.familyHistory),
      'EKG placed': bool(patient.ekgPlaced),
      'Emergency drugs': bool(patient.emergencyDrugsAvailable),
      'Monitors functional': bool(patient.monitoringEquipmentChecked),
    };
  }

  function buildLockSnapshot(): Snapshot {
    return {
      Patient: norm(patient.name),
      Provider: norm(patient.provider),
      MRN: norm(patient.mrn),
      ...buildClinicalSnapshot(),
    };
  }

  function diffClinical(prev: Snapshot, curr: Snapshot): Snapshot {
    const diff: Snapshot = {};
    for (const key of CLINICAL_KEYS) {
      const before = prev[key] ?? '—';
      const after = curr[key] ?? '—';
      if (before !== after) {
        diff[key] = `${before} → ${after}`;
      }
    }
    return diff;
  }

  // Stringified clinical fingerprint — Vue's default watcher uses === so
  // this only fires on actual value changes, not on identity changes from
  // re-evaluating the snapshot object.
  const clinicalFingerprint = computed(() => JSON.stringify(buildClinicalSnapshot()));

  // Baseline against which the next amendment is diffed. Owned by the
  // composable (not derived from event-log details), because amendment
  // events store diff strings like '138/85 → 130/80', not raw values —
  // re-deriving from those would compound diffs ('A → B → C') on each
  // amendment. Initialized from the lock event on mount (post-reload), with
  // any subsequent amendments applied to reach the latest known state.
  const baselineSnapshot = ref<Snapshot | null>(null);

  function extractNewValue(diff: string): string {
    const idx = diff.lastIndexOf(' → ');
    return idx === -1 ? diff : diff.slice(idx + 3);
  }

  function hydrateBaseline(): void {
    const events = log.events;
    let snap: Snapshot | null = null;
    for (const e of events as ReadonlyArray<LogEvent>) {
      if (e.event === PHASE1_LOCK_EVENT && snap === null) {
        snap = { ...e.details };
      } else if (e.event === PHASE1_AMENDMENT_EVENT && snap !== null) {
        for (const [key, val] of Object.entries(e.details)) {
          snap[key] = extractNewValue(val);
        }
      }
    }
    baselineSnapshot.value = snap;
  }

  hydrateBaseline();

  let amendmentTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleAmendment() {
    if (amendmentTimer) clearTimeout(amendmentTimer);
    amendmentTimer = setTimeout(() => {
      amendmentTimer = null;
      runAmendment();
    }, AMENDMENT_DEBOUNCE_MS);
  }

  function runAmendment() {
    if (log.phase1LockedAt === null) return;
    const baseline = baselineSnapshot.value;
    if (!baseline) return;
    const current = buildClinicalSnapshot();
    const diff = diffClinical(baseline, current);
    if (Object.keys(diff).length === 0) return;
    log.append(PHASE1_AMENDMENT_EVENT, diff);
    baselineSnapshot.value = { ...baseline, ...current };
  }

  watch(
    () => patient.isPhase1Complete,
    (complete) => {
      if (!complete) return;
      // Already locked (post-reload, or previous run in this session) —
      // the audit row stands; further changes flow through the amendment
      // watcher.
      if (log.phase1LockedAt !== null) return;
      const details = buildLockSnapshot();
      const entry = log.append(PHASE1_LOCK_EVENT, details);
      baselineSnapshot.value = details;
      toast.show({
        id: entry.id,
        label: '✓ Phase 1 complete',
        sub: new Date(entry.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        tone: 'safe',
      });
    },
  );

  watch(clinicalFingerprint, () => {
    if (log.phase1LockedAt === null) return;
    scheduleAmendment();
  });

  onScopeDispose(() => {
    if (amendmentTimer) {
      clearTimeout(amendmentTimer);
      amendmentTimer = null;
    }
  });
}

export const __testing = {
  ADMIN_KEYS,
  CLINICAL_KEYS,
  AMENDMENT_DEBOUNCE_MS,
};
