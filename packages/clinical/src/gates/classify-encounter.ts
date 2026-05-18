/**
 * Encounter classification — derived, never declared.
 *
 * A visit is a *pre-sedation assessment* until a sedative is actually
 * administered, at which point it becomes a *sedation* encounter. The UI
 * never asks the clinician to pick; it infers from what was given, so the
 * same record can start as an assessment and grow into a full sedation
 * note on a later date without any "convert" step.
 *
 * Bedtime pre-med is take-home (the night before) — not an in-office
 * sedation event — so it is excluded by construction: callers simply do
 * not pass it as a `*Given` input.
 */
export type EncounterKind = 'assessment' | 'sedation';

export interface EncounterInputs {
  /** Any Phase 2 oral pre-op anxiolytic administered? */
  readonly oralPremedGiven: boolean;
  /** Any IV drug administered? */
  readonly ivMedGiven: boolean;
}

export function classifyEncounter(inputs: EncounterInputs): EncounterKind {
  return inputs.oralPremedGiven || inputs.ivMedGiven ? 'sedation' : 'assessment';
}
