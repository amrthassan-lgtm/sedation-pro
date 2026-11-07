import { DEFAULT_FORMULARY, type Formulary } from '@sedation-pro/clinical';

/**
 * Syringe drawing parameters for a drug, read from the formulary: the barrel
 * the practice trays it in (`syringeMl`), its tint (`color`) and its
 * concentration. The formulary is the single source, so the dock buttons, the
 * reference card and every syringe drawing agree. Drugs without a trayed
 * syringe return `null` and the caller hides the illustration.
 */
export interface SyringeConfig {
  /** Capacity of the chosen barrel in ml. */
  readonly capacityMl: number;
  /** CSS colour for the fluid and the cap band. */
  readonly color: string;
  /** Concentration on the vial label, printed under the syringe. */
  readonly concentration: string;
}

function buildIndex(formulary: Formulary): ReadonlyMap<string, SyringeConfig> {
  const index = new Map<string, SyringeConfig>();
  for (const drug of formulary.iv) {
    if (drug.syringeMl === undefined || drug.color === undefined) continue;
    const cfg: SyringeConfig = {
      capacityMl: drug.syringeMl,
      color: drug.color,
      concentration: `${drug.concentration.value} ${drug.concentration.unit}`,
    };
    // Every word of the id, name and short name ("Midazolam (Versed)" →
    // midazolam, versed) resolves a protocol callout name to this drug.
    for (const token of `${drug.id} ${drug.name} ${drug.shortName}`
      .toLowerCase()
      .split(/[^a-z]+/)) {
      if (token.length > 2) index.set(token, cfg);
    }
  }
  return index;
}

const DEFAULT_INDEX = buildIndex(DEFAULT_FORMULARY);

/** Look up syringe params from a drug name; `null` when the drug has no trayed syringe. */
export function syringeConfig(
  drugName: string,
  formulary: Formulary = DEFAULT_FORMULARY,
): SyringeConfig | null {
  const index = formulary === DEFAULT_FORMULARY ? DEFAULT_INDEX : buildIndex(formulary);
  const key = drugName
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .find((w) => index.has(w));
  return key !== undefined ? (index.get(key) ?? null) : null;
}

/**
 * Parse a single-value volume string ("1.0 ml", "1.0 ml (0.4 mg)") into a
 * number. Range volumes ("0.5-1.0 ml") deliberately return `null` — a
 * syringe drawn to an arbitrary range endpoint would be a misleading
 * illustration. Unparseable input also returns `null` so the caller skips
 * the illustration rather than render a plunger fully home.
 */
export function parseVolumeMl(volume: string | undefined): number | null {
  if (!volume) return null;
  const m = /^([\d.]+) ml(?: \([^)]+\))?$/i.exec(volume);
  if (!m || m[1] === undefined) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}
