import {
  DEFAULT_FORMULARY,
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

/**
 * Emergency-only drugs that get a syringe drawing on their protocol card,
 * tinted like the label on the vial. They are not formulary drugs (nothing
 * on the sedation tray), so they cannot borrow a tray colour.
 */
const EMERGENCY_TINTS: Readonly<Record<string, string>> = {
  // Purple: the epinephrine ampule label.
  Epinephrine: 'var(--color-purple)',
  'Push-dose Epinephrine': 'var(--color-purple)',
};

export interface SyringeDrawing {
  readonly capacityMl: number;
  readonly drawnMl: number;
  readonly color: string;
  readonly concentration: string;
  /** The full line under the drawing, e.g. "Draw 0.3 ml (up to 0.5 ml)". */
  readonly caption: string;
}

/**
 * Drawing for an emergency-only callout, or `null` when it has none.
 *
 * A dose range draws its first row, the usual starting dose, and the caption
 * names the top of the range, so the picture never reads as the only answer.
 * A MIX FIRST callout draws the finished mix filling its syringe: that is
 * what is in the hand, and the dose is pushed from it.
 */
export function emergencySyringe(drug: EmergencyDrugCallout): SyringeDrawing | null {
  const color = EMERGENCY_TINTS[drug.name];
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
  const first = drug.drawTable?.[0];
  const start = parseVolumeMl(first?.ml);
  if (first === undefined || start === null) return null;
  const last = drug.drawTable?.at(-1);
  const upTo = last !== undefined && last !== first ? ` (up to ${last.ml})` : '';
  return {
    capacityMl: drug.syringeMl,
    drawnMl: start,
    color,
    concentration,
    caption: `Draw ${first.ml}${upTo}`,
  };
}
