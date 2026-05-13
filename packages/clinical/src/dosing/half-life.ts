/**
 * Active fraction of a dose after `elapsedMin` minutes, modelled as first-order
 * elimination: `f = 0.5 ^ (elapsedMin / halfLifeMin)`.
 *
 * Negative elapsed time (a future-dated dose) clamps to the original dose;
 * non-positive half-lives are rejected because the formula is undefined.
 */
export function decayActiveDose(
  originalMg: number,
  elapsedMin: number,
  halfLifeMin: number,
): number {
  if (!Number.isFinite(originalMg) || originalMg <= 0) return 0;
  if (!Number.isFinite(halfLifeMin) || halfLifeMin <= 0) {
    throw new RangeError('halfLifeMin must be a positive finite number');
  }
  if (!Number.isFinite(elapsedMin) || elapsedMin <= 0) return originalMg;
  return originalMg * Math.pow(0.5, elapsedMin / halfLifeMin);
}
