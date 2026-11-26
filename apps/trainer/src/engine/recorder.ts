import type { Sample } from './types';

/**
 * How far the pressure has to fall from where the scene opened before the
 * debrief draws it. A display threshold, not a clinical one: a line under
 * every chart would be noise in the drills where the pressure never comes
 * into it, and a pressure that only rose with the struggle is one of those.
 */
const WORTH_DRAWING_MMHG = 20;

export interface PressureRange {
  readonly low: number;
  readonly high: number;
}

/** The samples taken while he had a pulse: with none there is no saturation and no pressure to draw. */
export function readings(history: ReadonlyArray<Sample>): ReadonlyArray<Sample> {
  return history.filter((s) => s.pulseless !== true);
}

/**
 * The lowest and highest systolic pressure of a run, or null for a run with
 * no samples. A stretch with no pulse has no pressure to be the lowest.
 */
export function pressureRange(history: ReadonlyArray<Sample>): PressureRange | null {
  const read = readings(history);
  if (read.length === 0) return null;
  let low = Infinity;
  let high = -Infinity;
  for (const s of read) {
    low = Math.min(low, s.sbp);
    high = Math.max(high, s.sbp);
  }
  return { low: Math.round(low), high: Math.round(high) };
}

export function pressureFell(history: ReadonlyArray<Sample>): boolean {
  const range = pressureRange(history);
  const opened = readings(history)[0]?.sbp;
  return range !== null && opened !== undefined && opened - range.low >= WORTH_DRAWING_MMHG;
}
