import type { Formulary, PracticePicklists } from './types';

/**
 * A practice's edits to the shipped formulary, stored as a *diff* rather
 * than a copy.
 *
 * Storing the diff is what keeps a practice on the shipped values for every
 * field they never touched, so a later correction to the formulary still
 * reaches them. A full snapshot taken at setup would freeze each practice on
 * whatever the formulary looked like the day they installed, and no
 * correction could ever be pushed again.
 *
 * Deliberately narrow: only the roster and pick-lists are reachable here.
 * Drugs, ceilings and wait windows are clinical safety values on a separate
 * tier, and the type is the boundary — there is no way to express an
 * override for them until the gated editor exists.
 */
export interface FormularyOverrides {
  readonly practiceName?: string;
  readonly picklists?: Partial<PracticePicklists>;
}

/**
 * Overrides survive a reload and are edited by hand, so a mangled blob must
 * not take the app down at boot. Anything that is not an array of strings
 * falls back to the shipped list; stray non-string members are dropped
 * rather than rendered.
 */
function pickList(
  base: ReadonlyArray<string>,
  override: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> {
  if (override === undefined || !Array.isArray(override)) return base;
  return override.filter((entry): entry is string => typeof entry === 'string');
}

function mergePicklists(
  base: PracticePicklists,
  overrides: Partial<PracticePicklists> | undefined,
): PracticePicklists {
  if (!overrides) return base;

  // Listed key by key on purpose: adding a pick-list to the type makes this
  // fail to compile until it is handled, rather than silently becoming the
  // one list a practice cannot edit.
  const merged: PracticePicklists = {
    providers: pickList(base.providers, overrides.providers),
    ivSites: pickList(base.ivSites, overrides.ivSites),
    ivFluids: pickList(base.ivFluids, overrides.ivFluids),
    catheterGauges: pickList(base.catheterGauges, overrides.catheterGauges),
    companionRelations: pickList(base.companionRelations, overrides.companionRelations),
    dentalAssistants: pickList(base.dentalAssistants, overrides.dentalAssistants),
    sedationComplications: pickList(base.sedationComplications, overrides.sedationComplications),
    venipunctureComplications: pickList(
      base.venipunctureComplications,
      overrides.venipunctureComplications,
    ),
  };

  const keys = Object.keys(merged) as Array<keyof PracticePicklists>;
  return keys.some((key) => merged[key] !== base[key]) ? merged : base;
}

/**
 * Resolve the formulary a practice actually runs on. Returns `base` itself —
 * by identity, not a copy — when nothing has been overridden, so "this
 * practice has changed nothing" is a provable state rather than an
 * assumption.
 */
export function mergeFormulary(
  base: Formulary,
  overrides: FormularyOverrides | null | undefined,
): Formulary {
  if (!overrides) return base;

  const picklists = mergePicklists(base.picklists, overrides.picklists);
  // An empty practice name would print a blank letterhead on a medicolegal
  // note, so it is treated as unset rather than as an edit.
  const name = typeof overrides.practiceName === 'string' ? overrides.practiceName.trim() : '';
  const practiceName = name === '' ? base.practiceName : name;

  if (picklists === base.picklists && practiceName === base.practiceName) return base;
  return { ...base, practiceName, picklists };
}
