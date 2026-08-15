/**
 * Phase 1 (pre-sedation assessment) required-fields registry.
 *
 * The clinical engine owns the *rule* — which fields are required, in which
 * step they live, and how the diabetic-conditional glucose field behaves.
 * The UI owns *reading* those fields from whatever store it uses, then asks
 * this engine whether each is filled.
 */

export type Phase1Step = 1 | 2 | 3 | 4 | 5 | 6;

export interface Phase1FieldSpec {
  /** Stable id matching the legacy app's input ids. */
  readonly id: string;
  /** Human label for missing-field UI. */
  readonly label: string;
  /** Card the field lives in. */
  readonly step: Phase1Step;
}

/**
 * The 20 unconditional required fields, plus `baseline_glucose` which is
 * required only when `diabetic === 'yes'`.
 *
 * `allergies` is required because the printed note previously rendered a
 * blank allergy field as "NKDA" — turning "nobody asked" into a positive
 * assertion that the patient has no known drug allergies. The UI satisfies
 * it either by listing allergies or by ticking an explicit NKDA box, so the
 * note can claim NKDA because the clinician asserted it.
 */
export const PHASE1_REQUIRED_FIELDS: ReadonlyArray<Phase1FieldSpec> = [
  // Step 1 — Patient Identification
  { id: 'pt', label: 'Patient name', step: 1 },
  { id: 'mrn', label: 'MRN / Patient ID', step: 1 },
  { id: 'prov', label: 'Provider', step: 1 },
  // Step 2 — Caregiver & Discharge
  { id: 'care_name', label: 'Caregiver name', step: 2 },
  { id: 'care_phone', label: 'Caregiver phone', step: 2 },
  // Step 3 — Vitals & Metrics
  { id: 'weight', label: 'Weight', step: 3 },
  { id: 'height', label: 'Height', step: 3 },
  { id: 'patient_age', label: 'Age', step: 3 },
  { id: 'last_exam', label: 'Date of last exam', step: 3 },
  // Step 4 — Medical History
  { id: 'allergies', label: 'Allergies (or NKDA)', step: 4 },
  { id: 'meds_verified', label: 'Epocrates drug check', step: 4 },
  { id: 'osa_history', label: 'OSA history', step: 4 },
  // Step 5 — Social Screening
  { id: 'smoking_status', label: 'Smoking status', step: 5 },
  // Step 6 — Safety Checklist
  { id: 'mallampati', label: 'Mallampati score', step: 6 },
  { id: 'asa_class', label: 'ASA classification', step: 6 },
  { id: 'npo_confirmed', label: 'NPO confirmation', step: 6 },
  { id: 'consent_obtained', label: 'Informed consent obtained', step: 6 },
  { id: 'ekg_placed', label: 'EKG leads placed', step: 6 },
  { id: 'emergency_drugs_available', label: 'Emergency drugs available', step: 6 },
  { id: 'monitoring_equipment_checked', label: 'Monitors functional', step: 6 },
];

export const PHASE1_CONDITIONAL_GLUCOSE: Phase1FieldSpec = {
  id: 'baseline_glucose',
  label: 'Baseline glucose (diabetic)',
  step: 3,
};

/**
 * Input shape for `phase1Completeness`. The UI fills `values` with the
 * actual user inputs keyed by field id; `diabetic === 'yes'` adds glucose to
 * the required set.
 */
export interface Phase1Inputs {
  readonly values: Readonly<Record<string, unknown>>;
  readonly diabetic?: 'yes' | 'no' | null;
}

export interface MissingField {
  readonly id: string;
  readonly label: string;
  readonly step: Phase1Step;
}

export interface Phase1Completeness {
  readonly done: number;
  readonly total: number;
  readonly percent: number;
  readonly complete: boolean;
  readonly missing: ReadonlyArray<MissingField>;
}

export function phase1Completeness(inputs: Phase1Inputs): Phase1Completeness {
  const required = [...PHASE1_REQUIRED_FIELDS];
  if (inputs.diabetic === 'yes') required.push(PHASE1_CONDITIONAL_GLUCOSE);

  const missing: MissingField[] = [];
  let done = 0;
  for (const spec of required) {
    if (isFilled(inputs.values[spec.id])) {
      done += 1;
    } else {
      missing.push({ id: spec.id, label: spec.label, step: spec.step });
    }
  }
  const total = required.length;
  return {
    done,
    total,
    percent: total === 0 ? 100 : Math.round((done / total) * 100),
    complete: done === total,
    missing,
  };
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}
