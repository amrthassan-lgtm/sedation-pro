import { DEFAULT_FORMULARY } from '../formulary/default';
import type { FormularyTimings } from '../formulary/types';
import type { Millis } from '../types';

/**
 * Release-eligibility timing inputs. All timestamps are epoch ms; pass
 * `null` / `undefined` for events that haven't occurred yet.
 */
export interface ReleaseInputs {
  /**
   * When the last IV *sedative* (Versed or Fentanyl) was given. This is
   * the ONLY standard anchor: oral pre-med, Zofran, and naloxone never
   * start or reset the observation clock (owner decision 2026-08,
   * reversing the earlier premed-counts rule — the pill's 30-min wait is
   * `premedWait`'s job, and a late antiemetic must not push discharge
   * out). Bedtime pre-med is take-home and was never an input.
   */
  readonly lastIvSedativeAt?: Millis | null;
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
  readonly reason: 'standard' | 'flumazenil-reversal' | 'no-iv-sedative';
}

/**
 * Compute release eligibility against the standard 20-minute observation
 * window, extended to 120 minutes when flumazenil reversal was given
 * (flumazenil's half-life is shorter than the benzo it reverses, so the
 * patient is watched longer for re-sedation).
 *
 * The window guards *residual IV sedation*. With no IV sedative AND no
 * reversal logged (assessment-only or oral-premed-only encounter) the
 * gate is vacuously satisfied (`eligible: true`, reason
 * `no-iv-sedative`) — callers use that reason to leave the countdown
 * un-armed rather than showing a clock that was never started.
 *
 * A reversal always enforces its own deadline, even without a recorded
 * sedative, and when both anchors exist we honour whichever deadline is
 * later — `lastFlumazenilAt + 120 min` vs `lastIvSedativeAt + 20 min` —
 * so a fresh dose after a reversal can never short-circuit the
 * post-reversal monitoring window.
 */
export function releaseEligibility(
  inputs: ReleaseInputs,
  timings: FormularyTimings = DEFAULT_FORMULARY.timings,
): ReleaseEligibility {
  const { lastIvSedativeAt, lastFlumazenilAt, now } = inputs;
  const sedativeGiven = lastIvSedativeAt !== null && lastIvSedativeAt !== undefined;
  const flumazenilGiven = lastFlumazenilAt !== null && lastFlumazenilAt !== undefined;
  if (!sedativeGiven && !flumazenilGiven) {
    return {
      eligible: true,
      remainingMin: 0,
      waitMin: timings.releaseWaitMin,
      reason: 'no-iv-sedative',
    };
  }
  const standardDeadline = sedativeGiven
    ? lastIvSedativeAt + timings.releaseWaitMin * 60_000
    : Number.NEGATIVE_INFINITY;
  const flumazenilDeadline = flumazenilGiven
    ? lastFlumazenilAt + timings.flumazenilDischargeWaitMin * 60_000
    : Number.NEGATIVE_INFINITY;
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
