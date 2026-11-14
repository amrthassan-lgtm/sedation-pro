/**
 * Reads the dose strings the protocols already carry ("0.3-0.5 mg",
 * "10 mcg/ml (after dilution)") so the trainer grades a dose against the
 * protocol's own words. Nothing here restates a dose: change the protocol
 * and the grading changes with it.
 */

export type MassUnit = 'mcg' | 'mg' | 'g';

const MCG_PER: Readonly<Record<MassUnit, number>> = { mcg: 1, mg: 1_000, g: 1_000_000 };

export function toMcg(value: number, unit: MassUnit): number {
  return value * MCG_PER[unit];
}

export interface DoseRange {
  readonly minMcg: number;
  readonly maxMcg: number;
  /** The unit the protocol wrote the dose in, for display. */
  readonly unit: MassUnit;
}

/**
 * "0.4-2 mg" → 400..2000 mcg; "125 mg" → a single value. `null` for doses
 * that are not a plain mass (puffs, "0.6 mg/lb").
 */
export function parseDoseRange(dose: string): DoseRange | null {
  const m = /^([\d.]+)(?:-([\d.]+))? (mcg|mg|g)$/.exec(dose.trim());
  if (!m || m[1] === undefined || m[3] === undefined) return null;
  const unit = m[3] as MassUnit;
  const lo = Number(m[1]);
  const hi = m[2] === undefined ? lo : Number(m[2]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return { minMcg: toMcg(lo, unit), maxMcg: toMcg(hi, unit), unit };
}

/** First "N unit/ml" in a concentration string, as micrograms per millilitre. */
export function parseConcentrationMcgPerMl(concentration: string | undefined): number | null {
  if (concentration === undefined) return null;
  const m = /([\d.]+) ?(mcg|mg|g)\/ml/i.exec(concentration);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? toMcg(value, m[2].toLowerCase() as MassUnit) : null;
}

/** "1.2 mg", "20 mcg", "25 g": the shortest honest way to say a mass. */
export function formatMass(mcg: number): string {
  // Rounded before the unit is chosen: 999.9999 mcg of float noise is "1 mg", not "1000 mcg".
  const rounded = Math.round(mcg * 100) / 100;
  const abs = Math.abs(rounded);
  if (abs >= MCG_PER.g) return `${trim(rounded / MCG_PER.g)} g`;
  if (abs >= MCG_PER.mg) return `${trim(rounded / MCG_PER.mg)} mg`;
  return `${trim(rounded)} mcg`;
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}
