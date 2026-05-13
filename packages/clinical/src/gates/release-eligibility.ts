import { DEFAULT_FORMULARY } from '../formulary/default';
import type { FormularyTimings } from '../formulary/types';
import type { Millis } from '../types';

/**
 * Release-eligibility timing inputs. All timestamps are epoch ms; pass
 * `null` / `undefined` for events that haven't occurred yet.
 */
export interface ReleaseInputs {
  /** When the last IV medication was given. */
  readonly lastMedicationAt?: Millis | null;
  /** When flumazenil reversal was given, if at all. */
  readonly lastFlumazenilAt?: Millis | null;
  /** "Now" — epoch ms when the check is being made. */
  readonly now: Millis;
}

export interface ReleaseEligibility {
  /** Whether the patient is eligible for IV-out / discharge right now. */
  readonly eligible: boolean;
  /** Whole minutes until eligibility, or 0 when already eligible. */
  readonly remainingMin: number;
  /** Total wait window applied to this case — 20 or 120 min by default. */
  readonly waitMin: number;
  /** Reason the wait window was extended, if applicable. */
  readonly reason: 'standard' | 'flumazenil-reversal' | 'no-medication-given';
}

/**
 * Compute release eligibility against the standard 20-minute IV-out window,
 * extended to 120 minutes when flumazenil reversal was given (flumazenil's
 * half-life is shorter than the benzo it reverses, so the patient is watched
 * longer for re-sedation).
 *
 * When *both* a flumazenil dose and a subsequent IV medication are present,
 * we honour whichever deadline is later — `lastFlumazenilAt + 120 min`
 * vs `lastMedicationAt + 20 min` — so a fresh IV dose after a reversal can
 * never short-circuit the post-reversal monitoring window.
 */
export function releaseEligibility(
  inputs: ReleaseInputs,
  timings: FormularyTimings = DEFAULT_FORMULARY.timings,
): ReleaseEligibility {
  const { lastMedicationAt, lastFlumazenilAt, now } = inputs;
  if (lastMedicationAt === null || lastMedicationAt === undefined) {
    return {
      eligible: false,
      remainingMin: 0,
      waitMin: timings.releaseWaitMin,
      reason: 'no-medication-given',
    };
  }
  const flumazenilGiven = lastFlumazenilAt !== null && lastFlumazenilAt !== undefined;
  const standardDeadline = lastMedicationAt + timings.releaseWaitMin * 60_000;
  const flumazenilDeadline = flumazenilGiven
    ? lastFlumazenilAt + timings.flumazenilDischargeWaitMin * 60_000
    : standardDeadline;
  const deadline = Math.max(standardDeadline, flumazenilDeadline);
  const remainingMs = deadline - now;
  const eligible = remainingMs <= 0;
  const reason: ReleaseEligibility['reason'] =
    flumazenilGiven && flumazenilDeadline >= standardDeadline ? 'flumazenil-reversal' : 'standard';
  const waitMin =
    reason === 'flumazenil-reversal' ? timings.flumazenilDischargeWaitMin : timings.releaseWaitMin;
  return {
    eligible,
    remainingMin: eligible ? 0 : Math.ceil(remainingMs / 60_000),
    waitMin,
    reason,
  };
}

/**
 * Pre-med wait: after an oral pre-op anxiolytic, wait `premedWaitMin` (30 min
 * default) before starting IV sedation. Returns `eligible=true` if no pre-med
 * was given.
 */
export interface PremedInputs {
  readonly lastPremedAt?: Millis | null;
  readonly now: Millis;
}

export interface PremedWait {
  readonly eligible: boolean;
  readonly remainingMin: number;
  readonly waitMin: number;
}

export function premedWait(
  inputs: PremedInputs,
  timings: FormularyTimings = DEFAULT_FORMULARY.timings,
): PremedWait {
  if (inputs.lastPremedAt === null || inputs.lastPremedAt === undefined) {
    return { eligible: true, remainingMin: 0, waitMin: timings.premedWaitMin };
  }
  const elapsedMin = (inputs.now - inputs.lastPremedAt) / 60_000;
  const remaining = timings.premedWaitMin - elapsedMin;
  const eligible = remaining <= 0;
  return {
    eligible,
    remainingMin: eligible ? 0 : Math.ceil(remaining),
    waitMin: timings.premedWaitMin,
  };
}
