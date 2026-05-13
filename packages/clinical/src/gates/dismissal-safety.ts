import { classifyBp } from '../vitals/bp';
import { classifySpo2 } from '../vitals/spo2';

/**
 * "Do Not Dismiss" hard-stop registry from the production brief (Gap B).
 *
 * The provider can override any blocker, but the override has to be an
 * explicit, typed action — the engine returns the blockers, the UI is
 * responsible for showing them and capturing the justification.
 *
 * Inputs are intentionally simple primitives so the UI can collect them in
 * any shape (form, store, ad-hoc object) and call this function pure.
 */
export interface DismissalInputs {
  /** Was the patient ambulatory at discharge time? */
  readonly ambulatory: boolean;
  /** Oriented x3 (person · place · time)? */
  readonly orientedX3: boolean;
  /** Any nausea / vomiting noted in recovery? */
  readonly nauseaOrVomiting: boolean;
  /** Excessive bleeding observed during or after the procedure? */
  readonly excessiveBleeding: boolean;
  /** Most recent SpO₂ % — null when not measured. */
  readonly spo2: number | null;
  /** Most recent BP — passed to `classifyBp`. */
  readonly bp: { readonly sbp: number | null; readonly dbp: number | null };
  /** Was a responsible companion documented (name + relation)? */
  readonly companionDocumented: boolean;
  /** Provider signature captured? */
  readonly providerSigned: boolean;
  /** Companion signature captured? */
  readonly companionSigned: boolean;
}

export type DismissalBlockerCode =
  | 'not-ambulatory'
  | 'not-oriented'
  | 'nausea-vomiting'
  | 'excessive-bleeding'
  | 'low-spo2'
  | 'bp-crisis'
  | 'no-companion'
  | 'no-provider-signature'
  | 'no-companion-signature';

export interface DismissalBlocker {
  readonly code: DismissalBlockerCode;
  readonly label: string;
  /** Free-form clinical note explaining the threshold that fired. */
  readonly detail?: string;
}

export interface DismissalSafety {
  /** True when no blockers fired. */
  readonly clear: boolean;
  /** True when the dismissal is blocked (one or more blockers fired). */
  readonly blocked: boolean;
  readonly blockers: ReadonlyArray<DismissalBlocker>;
}

/** SpO₂ threshold below which the patient is held — mirrors the legacy gate. */
const SPO2_SAFE_FLOOR = 94;

/**
 * Evaluate dismissal safety. Returns `{ clear: true }` only when every gate
 * passes. The UI uses this to block the Sign-Note button; an override path
 * must record the blockers it bypassed.
 */
export function dismissalSafety(inputs: DismissalInputs): DismissalSafety {
  const blockers: DismissalBlocker[] = [];

  if (!inputs.ambulatory) {
    blockers.push({ code: 'not-ambulatory', label: 'Patient not ambulatory at discharge' });
  }
  if (!inputs.orientedX3) {
    blockers.push({ code: 'not-oriented', label: 'Patient not oriented ×3' });
  }
  if (inputs.nauseaOrVomiting) {
    blockers.push({ code: 'nausea-vomiting', label: 'Nausea or vomiting noted in recovery' });
  }
  if (inputs.excessiveBleeding) {
    blockers.push({ code: 'excessive-bleeding', label: 'Excessive bleeding observed' });
  }

  if (inputs.spo2 !== null && Number.isFinite(inputs.spo2)) {
    const spo2Result = classifySpo2(inputs.spo2);
    if (inputs.spo2 < SPO2_SAFE_FLOOR || (spo2Result && spo2Result.severity !== 'safe')) {
      blockers.push({
        code: 'low-spo2',
        label: `SpO₂ below safe floor (${inputs.spo2}%)`,
        detail: `Minimum SpO₂ for discharge is ${SPO2_SAFE_FLOOR}%.`,
      });
    }
  }

  if (inputs.bp.sbp !== null && inputs.bp.dbp !== null) {
    const bpResult = classifyBp(inputs.bp.sbp, inputs.bp.dbp);
    if (bpResult && bpResult.severity === 'crisis') {
      blockers.push({
        code: 'bp-crisis',
        label: `Blood pressure in crisis range (${inputs.bp.sbp}/${inputs.bp.dbp})`,
        detail: 'Hypertensive crisis ≥180/120 mmHg — defer discharge.',
      });
    }
  }

  if (!inputs.companionDocumented) {
    blockers.push({
      code: 'no-companion',
      label: 'No responsible companion documented',
      detail: 'Name and relation are both required before discharge.',
    });
  }

  if (!inputs.providerSigned) {
    blockers.push({ code: 'no-provider-signature', label: 'Provider signature missing' });
  }

  if (!inputs.companionSigned) {
    blockers.push({
      code: 'no-companion-signature',
      label: 'Responsible companion signature missing',
      detail: 'Companion co-signs post-op instructions per the practice protocol.',
    });
  }

  return {
    clear: blockers.length === 0,
    blocked: blockers.length > 0,
    blockers,
  };
}
