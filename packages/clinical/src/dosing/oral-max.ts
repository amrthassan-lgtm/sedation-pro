/**
 * Maximum oral anxiolytic dose by weight, with the Apex Dental conventions:
 *
 * - Triazolam: weightLb / 100 mg, capped at 200 lb (max 2 mg). Tablet
 *   strength is 0.25 mg, so `tablets = floor(mg / 0.25)`.
 * - Lorazepam: weightLb / 25 mg. Tablet strength is 2 mg, so
 *   `tablets = floor(mg / 2)`.
 */
export interface OralMaxDose {
  /** Maximum recommended dose in mg. */
  readonly mg: number;
  /** Whole tablets at the standard strength below. */
  readonly tablets: number;
  /** Per-tablet strength used for the tablet count. */
  readonly tabletMg: number;
}

export function triazolamMax(weightLb: number): OralMaxDose | null {
  if (!Number.isFinite(weightLb) || weightLb <= 0) return null;
  const cappedLb = Math.min(weightLb, 200);
  const mg = cappedLb / 100;
  const tabletMg = 0.25;
  return { mg, tablets: Math.floor(mg / tabletMg), tabletMg };
}

export function lorazepamMax(weightLb: number): OralMaxDose | null {
  if (!Number.isFinite(weightLb) || weightLb <= 0) return null;
  const mg = weightLb / 25;
  const tabletMg = 2;
  return { mg, tablets: Math.floor(mg / tabletMg), tabletMg };
}
