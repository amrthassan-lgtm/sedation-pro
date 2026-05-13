import { DEFAULT_FORMULARY } from '../formulary/default';
import type { FormularyTimings } from '../formulary/types';

/**
 * Drug-timer status for the chairside UI's coloured pill.
 *
 * - `cooling`: minimum safety wait has not elapsed; UI shows red.
 * - `ramping`: between minimum and ready windows; UI shows orange (Versed
 *   only — Fentanyl has no intermediate state by default).
 * - `ready`: at or past the ready window; UI shows green.
 */
export type DrugTimerState = 'cooling' | 'ramping' | 'ready';

export interface TimerStatus {
  readonly state: DrugTimerState;
  /** Whole seconds since dose. */
  readonly elapsedSec: number;
  /** Seconds remaining until the next state change (0 once `ready`). */
  readonly remainingSec: number;
}

export function versedTimer(
  elapsedSec: number,
  timings: FormularyTimings = DEFAULT_FORMULARY.timings,
): TimerStatus {
  return tieredTimer(elapsedSec, timings.versedMinWaitMin * 60, timings.versedReadyMin * 60);
}

export function fentanylTimer(
  elapsedSec: number,
  timings: FormularyTimings = DEFAULT_FORMULARY.timings,
): TimerStatus {
  return tieredTimer(elapsedSec, timings.fentanylMinWaitMin * 60, timings.fentanylMinWaitMin * 60);
}

function tieredTimer(rawElapsedSec: number, minSec: number, readySec: number): TimerStatus {
  const elapsedSec = Math.max(0, Math.floor(rawElapsedSec));
  if (elapsedSec < minSec) {
    return { state: 'cooling', elapsedSec, remainingSec: minSec - elapsedSec };
  }
  if (elapsedSec < readySec) {
    return { state: 'ramping', elapsedSec, remainingSec: readySec - elapsedSec };
  }
  return { state: 'ready', elapsedSec, remainingSec: 0 };
}
