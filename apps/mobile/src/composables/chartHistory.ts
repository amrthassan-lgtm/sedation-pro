/**
 * Pure translation from Open Dental's chart rows into this app's Phase 1
 * fields.
 *
 * Kept free of I/O and stores so every rule below is unit-testable, because
 * each one is a place where a wrong mapping puts a false statement into a
 * sedation assessment:
 *
 *  - a dropped condition (no chip in the practice vocabulary) understates
 *    the patient's risk;
 *  - Open Dental's `*NKDA` sentinel rendered as a substance turns "no known
 *    allergies" into an allergy to something called *NKDA;
 *  - a stopped medication listed as current is a drug the patient is not on.
 *
 * Booleans arrive as strings (`"true"`), and unset dates as `"0001-01-01"`.
 */

/** Open Dental's sentinel row meaning "no known drug allergies". */
export const NKDA_SENTINEL = '*NKDA';

/** Open Dental's "no date" value. */
const UNSET_DATE = '0001-01-01';

export interface OdAllergyRow {
  readonly defDescription?: string;
  readonly Reaction?: string;
  readonly StatusIsActive?: unknown;
}

export interface OdMedicationRow {
  readonly medName?: string;
  readonly PatNote?: string;
  readonly DateStart?: string;
  readonly DateStop?: string;
}

export interface OdDiseaseRow {
  readonly diseaseDefName?: string;
  readonly ProbStatus?: string;
  readonly PatNote?: string;
}

/**
 * Open Dental serialises booleans as strings on these endpoints. Anything
 * unrecognised is false: an ambiguous "is this allergy active" must not
 * promote a row into a sedation assessment.
 */
export function odBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
}

/** True when the date field is absent or Open Dental's "never set" value. */
export function isUnsetOdDate(value: string | undefined): boolean {
  const v = (value ?? '').trim();
  return v === '' || v === UNSET_DATE;
}

/**
 * Whole years between a `YYYY-MM-DD` birthdate and `now`, or null when the
 * date is missing or unparseable.
 *
 * Done by calendar parts rather than by dividing elapsed milliseconds: the
 * ms approach drifts by a day across leap years and can report an age one
 * year out around a birthday, which is exactly the disagreement this is
 * meant to detect.
 */
export function ageFromBirthdate(birthdate: string | null | undefined, now: Date): number | null {
  const raw = (birthdate ?? '').trim();
  if (raw === '' || isUnsetOdDate(raw)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m === null) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (y < 1900) return null;

  let age = now.getFullYear() - y;
  const monthDelta = now.getMonth() + 1 - mo;
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

// -------- Diseases → medical-problem chips ---------------------------------

export interface ProblemMapping {
  /** Chip values to select, in the vocabulary's exact casing. */
  readonly matched: ReadonlyArray<string>;
  /** Active conditions with no chip — carried through verbatim as custom. */
  readonly custom: ReadonlyArray<string>;
  /** Everything to write into `medicalProblems`, deduped. */
  readonly all: ReadonlyArray<string>;
}

/**
 * Map active diseases onto the chip vocabulary.
 *
 * Matching is case-insensitive and trimmed; an unmatched condition becomes a
 * custom chip carrying the chart's exact wording rather than being dropped.
 * Dropping a condition because the practice vocabulary lacks a chip for it
 * would be a silent omission in a pre-sedation assessment.
 */
export function mapDiseasesToProblems(
  rows: ReadonlyArray<OdDiseaseRow>,
  vocabulary: ReadonlyArray<string>,
): ProblemMapping {
  const byNormalised = new Map(vocabulary.map((v) => [v.trim().toLowerCase(), v]));
  const matched: string[] = [];
  const custom: string[] = [];

  for (const row of rows) {
    if ((row.ProbStatus ?? '').trim().toLowerCase() !== 'active') continue;
    const name = (row.diseaseDefName ?? '').trim();
    if (name === '') continue;

    const hit = byNormalised.get(name.toLowerCase());
    if (hit !== undefined) {
      if (!matched.includes(hit)) matched.push(hit);
    } else if (!custom.includes(name)) {
      custom.push(name);
    }
  }

  return { matched, custom, all: [...matched, ...custom] };
}

// -------- Allergies --------------------------------------------------------

export interface AllergySummary {
  /** Text for `allergiesList`. Empty when the chart says nothing. */
  readonly text: string;
  /** The chart asserts no known drug allergies. */
  readonly nkda: boolean;
  /**
   * The chart carries the NKDA sentinel *and* real allergies. Contradictory
   * charts get surfaced rather than resolved here — picking a side silently
   * is how "no known allergies" ends up on a record for someone with a
   * documented allergy.
   */
  readonly contradiction: boolean;
}

export function summariseAllergies(rows: ReadonlyArray<OdAllergyRow>): AllergySummary {
  let nkda = false;
  const substances: string[] = [];

  for (const row of rows) {
    if (!odBoolean(row.StatusIsActive)) continue;
    const desc = (row.defDescription ?? '').trim();
    if (desc === '') continue;

    if (desc.toUpperCase() === NKDA_SENTINEL.toUpperCase()) {
      nkda = true;
      continue;
    }
    const reaction = (row.Reaction ?? '').trim();
    const entry = reaction === '' ? desc : `${desc} (${reaction})`;
    if (!substances.includes(entry)) substances.push(entry);
  }

  const contradiction = nkda && substances.length > 0;
  if (substances.length > 0) return { text: substances.join(', '), nkda, contradiction };
  // Render the sentinel as the conventional abbreviation, never as `*NKDA`.
  return { text: nkda ? 'NKDA' : '', nkda, contradiction };
}

// -------- Medications ------------------------------------------------------

/**
 * Current medications only. A row with a real `DateStop` is a drug the
 * patient has been taken off, and listing it as current would misstate what
 * they are actually on when they sit down for sedation.
 */
export function summariseMedications(rows: ReadonlyArray<OdMedicationRow>): string {
  const out: string[] = [];
  for (const row of rows) {
    if (!isUnsetOdDate(row.DateStop)) continue;
    const name = (row.medName ?? '').trim();
    if (name === '') continue;
    const note = (row.PatNote ?? '').trim();
    const entry = note === '' ? name : `${name} (${note})`;
    if (!out.includes(entry)) out.push(entry);
  }
  return out.join(', ');
}

// -------- Identity cross-checks --------------------------------------------

/** `LName, FName` as the chart spells it. */
export function chartDisplayName(lName: string, fName: string): string {
  const last = lName.trim();
  const first = fName.trim();
  if (last === '' && first === '') return '';
  if (first === '') return last;
  if (last === '') return first;
  return `${last}, ${first}`;
}

/**
 * Compare the hand-typed patient name against the chart's, ignoring order,
 * case, punctuation and middle names.
 *
 * Deliberately loose: the point is to catch "this is a different person",
 * not to nag about "Bob" versus "Robert". A false alarm on every case would
 * train the clinician to ignore the one that matters.
 */
export function namesDisagree(typed: string, lName: string, fName: string): boolean {
  const tokens = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);

  const typedTokens = tokens(typed);
  const chartTokens = tokens(`${lName} ${fName}`);
  if (typedTokens.length === 0 || chartTokens.length === 0) return false;

  // Agreement means every chart name part is present in what was typed, or
  // vice versa — either direction covers a missing middle name.
  const covers = (a: string[], b: string[]): boolean => b.every((t) => a.includes(t));
  return !covers(typedTokens, chartTokens) && !covers(chartTokens, typedTokens);
}
