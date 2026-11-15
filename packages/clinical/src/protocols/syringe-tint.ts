/**
 * Syringe colours for the emergency-only drugs, by family, the way label
 * tape is sold (ISO 26825). The sedation-tray drugs keep the colour on their
 * formulary entry; these have no formulary entry to carry one.
 *
 * A family, not a colour per drug: twelve more hues cannot be told apart on a
 * dark screen, and every drawing prints the drug's name above it. Grey makes
 * no claim at all.
 */
const STOCK_PRESSOR = 'var(--color-purple)';
/** A pressor after its MIX FIRST dilution, the only strength that goes into a vein with a pulse. */
const DILUTED_PRESSOR = 'var(--color-purple-pale)';
const ANTICHOLINERGIC = 'var(--color-green)';
const PARALYTIC = 'var(--color-red)';
const NEUTRAL = 'var(--color-slate)';

const PRESSORS: ReadonlySet<string> = new Set([
  'Epinephrine',
  'Push-dose Epinephrine',
  'Ephedrine',
  'Phenylephrine',
]);

const FIXED: Readonly<Record<string, string>> = {
  Atropine: ANTICHOLINERGIC,
  Succinylcholine: PARALYTIC,
  Adenosine: NEUTRAL,
  Amiodarone: NEUTRAL,
  'Cardiac Lidocaine': NEUTRAL,
  Dexamethasone: NEUTRAL,
  Diphenhydramine: NEUTRAL,
  Hydralazine: NEUTRAL,
  Labetalol: NEUTRAL,
  'Methylprednisolone (Solu-Medrol)': NEUTRAL,
};

/** Every callout name that has a colour here, for the tests that keep the table honest. */
export const EMERGENCY_TINT_NAMES: ReadonlyArray<string> = [...PRESSORS, ...Object.keys(FIXED)];

/**
 * Colour for an emergency drug callout by its name, or `undefined` when the
 * drug is not in the table (a tray drug, or one given without a syringe).
 * `diluted` is true for what a MIX FIRST recipe leaves in the syringe.
 */
export function emergencySyringeTint(calloutName: string, diluted = false): string | undefined {
  if (PRESSORS.has(calloutName)) return diluted ? DILUTED_PRESSOR : STOCK_PRESSOR;
  return FIXED[calloutName];
}
