import {
  DEFAULT_FORMULARY,
  emergencySyringeTint,
  type EmergencyDrugCallout,
  type Formulary,
} from '@sedation-pro/clinical';

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

/** "0.3-0.5 ml", with or without a trailing note in brackets: the two ends as written. */
function parseVolumeRange(volume: string | undefined): { from: string; to: string } | null {
  const m = /^([\d.]+)-([\d.]+) ml(?: \([^)]+\))?$/i.exec(volume ?? '');
  return m?.[1] !== undefined && m[2] !== undefined ? { from: m[1], to: m[2] } : null;
}

export interface SyringeDrawing {
  readonly capacityMl: number;
  readonly drawnMl: number;
  readonly color: string;
  readonly concentration: string;
  /** The full line under the drawing, e.g. "Draw 0.3 ml (up to 0.5 ml)". */
  readonly caption: string;
}

/**
 * Drawing for an emergency-only callout, or `null` when it has none. The
 * colour is the drug's family (`emergencySyringeTint`), shared with the
 * training simulator's cart.
 *
 * A dose range draws its low end, the usual starting dose, and the caption
 * names the top of the range, so the picture never reads as the only answer.
 * A MIX FIRST callout draws the finished mix filling its syringe: that is
 * what is in the hand, and the dose is pushed from it. A dose by weight has
 * no starting volume to draw, so its table stands alone.
 */
export function emergencySyringe(drug: EmergencyDrugCallout): SyringeDrawing | null {
  const color = emergencySyringeTint(drug.name, drug.mixFirst !== undefined);
  if (color === undefined || drug.syringeMl === undefined || drug.device !== undefined) {
    return null;
  }
  const concentration = drug.concentration ?? '';
  if (drug.mixFirst !== undefined) {
    return {
      capacityMl: drug.syringeMl,
      drawnMl: drug.syringeMl,
      color,
      concentration,
      caption: `Mixed ${drug.syringeMl.toFixed(1)} ml · push ${drug.volume ?? ''}`.trim(),
    };
  }
  if (/by weight/i.test(drug.volume ?? '')) return null;
  const exact = parseVolumeMl(drug.volume);
  if (exact !== null) {
    return {
      capacityMl: drug.syringeMl,
      drawnMl: exact,
      color,
      concentration,
      caption: `Draw ${drug.volume}`,
    };
  }
  const range = parseVolumeRange(drug.volume);
  if (range === null) return null;
  return {
    capacityMl: drug.syringeMl,
    drawnMl: parseFloat(range.from),
    color,
    concentration,
    caption: `Draw ${range.from} ml (up to ${range.to} ml)`,
  };
}
