/**
 * Date of last physical exam validity, by age:
 *
 * | Age tier | Max age of exam |
 * | -------- | --------------- |
 * | `< 50`   | 24 months       |
 * | `50–59`  | 12 months       |
 * | `≥ 60`   |  6 months       |
 *
 * Boundaries are inclusive on the lower bound (50 enters the 12-month tier;
 * 60 enters the 6-month tier).
 */
export type LastExamTier = 24 | 12 | 6;

export function lastExamCutoffMonths(ageYears: number): LastExamTier {
  if (!Number.isFinite(ageYears) || ageYears < 50) return 24;
  if (ageYears < 60) return 12;
  return 6;
}

export interface LastExamCheck {
  readonly valid: boolean;
  readonly cutoffMonths: LastExamTier;
  /** Whole months between the exam date and `now`, floored. */
  readonly elapsedMonths: number;
}

/**
 * Check whether a recorded `lastExamDate` still satisfies the age-tiered
 * cutoff. `null` / `undefined` exam dates are treated as invalid.
 */
export function lastExamCheck(
  lastExamDate: Date | null | undefined,
  ageYears: number,
  now: Date,
): LastExamCheck {
  const cutoffMonths = lastExamCutoffMonths(ageYears);
  if (!lastExamDate || Number.isNaN(lastExamDate.getTime())) {
    return { valid: false, cutoffMonths, elapsedMonths: Number.POSITIVE_INFINITY };
  }
  const elapsedMonths = monthsBetween(lastExamDate, now);
  return {
    valid: elapsedMonths <= cutoffMonths,
    cutoffMonths,
    elapsedMonths,
  };
}

/** Approximate whole-month difference (365.25 / 12 days per month). */
function monthsBetween(a: Date, b: Date): number {
  const days = (b.getTime() - a.getTime()) / 86_400_000;
  return Math.floor(days / (365.25 / 12));
}
