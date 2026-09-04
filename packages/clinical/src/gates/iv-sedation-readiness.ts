/**
 * Pre-IV-sedation readiness.
 *
 * EKG confirmation used to live in the Phase 1 completeness set, which meant
 * an assessment-only visit — where no leads are ever placed — could not reach
 * its own note without the clinician asserting a monitoring step that never
 * happened. Requiring a false statement to proceed is worse than the omission
 * it was guarding against.
 *
 * So the check moved to the moment it is actually load-bearing: the first IV
 * sedative. That is stricter than the old gate, not looser. A Phase 1 tick
 * box is satisfied once, hours before induction, among nineteen other fields,
 * and nothing re-reads it; this is evaluated at the instant the drug is given.
 *
 * Deliberately scoped to IV sedation. N₂O/O₂ alone, an oral premedication and
 * local anaesthetic are not gated — they do not carry the same monitoring
 * requirement, and blocking them would teach the clinician to clear the box
 * reflexively, which is exactly how a gate stops meaning anything.
 */
export type IvReadinessBlockerCode = 'ekg-not-confirmed';

export interface IvReadinessBlocker {
  readonly code: IvReadinessBlockerCode;
  /** Short form, for a chip or a disabled control's reason. */
  readonly label: string;
  /** What to do about it. */
  readonly detail: string;
}

export interface IvReadinessInputs {
  /** Phase 1 safety checklist — "EKG leads placed". */
  readonly ekgPlaced: boolean;
}

export interface IvSedationReadiness {
  readonly ready: boolean;
  readonly blockers: ReadonlyArray<IvReadinessBlocker>;
}

export function ivSedationReadiness(inputs: IvReadinessInputs): IvSedationReadiness {
  const blockers: IvReadinessBlocker[] = [];

  if (!inputs.ekgPlaced) {
    blockers.push({
      code: 'ekg-not-confirmed',
      label: 'EKG not confirmed',
      detail: 'Tick “EKG leads placed” in the Phase 1 safety checklist before giving IV sedation.',
    });
  }

  return { ready: blockers.length === 0, blockers };
}
