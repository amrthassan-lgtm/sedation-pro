/**
 * Maps a drug name to its canonical syringe rendering parameters — the colour
 * the brand is most commonly associated with on the trayed-up sedation cart
 * plus the standard barrel capacity drawn for IV push.
 *
 * Five drugs ship with hand-tuned syringes: Versed (Midazolam), Fentanyl,
 * Zofran (Ondansetron), Flumazenil, Naloxone. Other drugs fall back to a
 * neutral slate barrel so the UI doesn't break — but only the named five are
 * intended to render with a syringe in production surfaces.
 */

export interface SyringeConfig {
  /** Capacity of the chosen barrel in mL (3, 5, 10, etc.). */
  readonly capacityMl: number;
  /** Brand-tinted CSS colour for the fluid + hub. */
  readonly color: string;
  /** Concentration on the vial label — printed under the syringe. */
  readonly concentration: string;
}

const SYRINGES: Readonly<Record<string, SyringeConfig>> = {
  versed: { capacityMl: 5, color: '#f59e0b', concentration: '5 mg/ml' },
  midazolam: { capacityMl: 5, color: '#f59e0b', concentration: '5 mg/ml' },
  fentanyl: { capacityMl: 3, color: '#3b82f6', concentration: '50 mcg/ml' },
  ondansetron: { capacityMl: 3, color: '#10b981', concentration: '2 mg/ml' },
  zofran: { capacityMl: 3, color: '#10b981', concentration: '2 mg/ml' },
  // 3 cc matches the practice's trayed barrel and the Quick Reference
  // landing card; the old 10 came from the 10 ml MAX dose, but the
  // per-dose draw is 2.0 ml.
  flumazenil: { capacityMl: 3, color: '#ef4444', concentration: '0.1 mg/ml' },
  naloxone: { capacityMl: 3, color: '#ef4444', concentration: '0.4 mg/ml' },
};

/**
 * Look up syringe params from a drug name. Returns `null` if the drug isn't
 * one of the recognised five — the caller should hide the illustration in
 * that case rather than show a misleading generic barrel.
 */
export function syringeConfig(drugName: string): SyringeConfig | null {
  const key = drugName
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .find((w) => SYRINGES[w] !== undefined);
  return key !== undefined ? (SYRINGES[key] ?? null) : null;
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
