import type { EmergencyDrugCallout, ProtocolStep } from '@sedation-pro/clinical';

/**
 * What the protocol pages can put into the case record: a dose that was
 * given, or the time something happened.
 *
 * The record is medicolegal. It holds what was given and when, and nothing
 * about why: never the protocol page a pill was tapped on, never a
 * diagnosis, never a word like "emergency". A doctor who opens the wrong
 * page under stress must not leave a record that reads as the wrong
 * diagnosis.
 */

export interface LogPill {
  /** Stable within one callout, for `v-for`. */
  readonly key: string;
  /** "0.3 mg", as it is recorded. */
  readonly dose: string;
  readonly route: string;
  /** The line under the dose on the pill: a volume, a weight, the device. */
  readonly sub: string;
  /** Recorded with the dose when it says something the dose does not. */
  readonly notes?: string;
}

/** Naloxone and flumazenil are logged from the card at the top of their pages. */
const LOGGED_ELSEWHERE: ReadonlySet<string> = new Set(['Naloxone', 'Flumazenil']);

const DOSE = String.raw`[\d.]+ ?(?:mg|mcg|g)\b(?!\/)`;
/** "0.3 mg", "6 mg (1st dose)", "4 mg/ml: 8 mg (two 1 ml vials)". Never "1 mg/ml vial". */
const DOSE_ROW = new RegExp(`(?:^|: )(${DOSE})`);
/** "150 lb (90 mg)". */
const WEIGHT_ROW = new RegExp(`^(\\d+ lb) \\((${DOSE})\\)`);

/**
 * A step that allows two routes ("Diphenhydramine IV or IM") offers each
 * dose by each route: a record must not say IV for a dose that went into
 * muscle.
 */
export function logPills(drug: EmergencyDrugCallout, stepText = ''): ReadonlyArray<LogPill> {
  const pills = pillsFor(drug);
  if (!new RegExp(`${drug.name} IV or IM\\b`).test(stepText)) return pills;
  return (['IV', 'IM'] as const).flatMap((route) =>
    pills.map((pill) => ({ ...pill, key: `${pill.key} ${route}`, route })),
  );
}

function pillsFor(drug: EmergencyDrugCallout): ReadonlyArray<LogPill> {
  if (LOGGED_ELSEWHERE.has(drug.name)) return [];
  const rows = drug.drawTable ?? [];

  const byWeight = rows.flatMap((row) => {
    const [, weight, dose] = WEIGHT_ROW.exec(row.label) ?? [];
    return weight !== undefined && dose !== undefined
      ? [{ key: dose, dose, route: drug.route, sub: `${weight} · ${row.ml}` }]
      : [];
  });
  if (byWeight.length > 0) return byWeight;

  const doses = new Map<string, { volumes: Set<string>; notes: Set<string> }>();
  for (const row of rows) {
    const m = DOSE_ROW.exec(row.label);
    const dose = m?.[1];
    if (m === null || dose === undefined) continue;
    // The row's own words after the dose: "(2nd dose)", "(repeat)".
    const note = /\(([^)]+)\)/.exec(row.label.slice(m.index + m[0].length))?.[1] ?? '';
    const seen = doses.get(dose) ?? { volumes: new Set<string>(), notes: new Set<string>() };
    seen.volumes.add(row.ml);
    seen.notes.add(note);
    doses.set(dose, seen);
  }
  if (doses.size > 0) {
    return [...doses].map(([dose, { volumes, notes }]) => ({
      key: dose,
      dose,
      route: drug.route,
      // One dose listed at two strengths has no single volume to show.
      sub:
        volumes.size === 1
          ? [[...volumes][0], notes.size === 1 ? [...notes][0] : ''].filter(Boolean).join(' · ')
          : '',
    }));
  }

  const auto = drug.device === 'auto-injector';
  return [
    {
      key: drug.dose,
      dose: drug.dose,
      route: drug.route,
      sub: auto ? 'auto-injector' : (drug.volume ?? ''),
      ...(auto && { notes: 'auto-injector' }),
    },
  ];
}

export interface DoseRow {
  readonly label: string;
  readonly value: string;
}

/** What to draw, as one list: the table's rows, or the single dose and its volume. */
export function doseRows(drug: EmergencyDrugCallout): ReadonlyArray<DoseRow> {
  if (drug.drawTable && drug.drawTable.length > 0) {
    return drug.drawTable.map((r) => ({ label: r.label, value: r.ml }));
  }
  return drug.volume ? [{ label: drug.dose, value: drug.volume }] : [];
}

const VOLUME = /^[\d.]+ ml\b/;

/**
 * Whether a step's pills say everything its dose rows say, row for row: the
 * row's dose and its volume on the pill in the same place. With logging on
 * the page then shows the list once, as pills. A table that says more than
 * its pills (one dose at two strengths, one dose by two routes) keeps its
 * rows, and so does a reversal, whose pills are drawn from fixed doses. A
 * table by weight keeps its rows too: the weight is what the eye looks up.
 */
export function pillsCoverTable(step: ProtocolStep): boolean {
  const drug = step.drug;
  if (drug === undefined || reversalsFor(step).length > 0) return false;
  const rows = doseRows(drug);
  if (rows.some((row) => /\blb\b/.test(row.label))) return false;
  const pills = logPills(drug, step.text);
  if (rows.length === 0 || pills.length !== rows.length) return false;
  return rows.every((row, i) => {
    const pill = pills[i];
    const ml = VOLUME.exec(row.value)?.[0];
    return (
      pill !== undefined &&
      ml !== undefined &&
      row.label.includes(pill.dose) &&
      pill.sub.includes(ml)
    );
  });
}

export type ReversalDrug = 'naloxone' | 'flumazenil';

/**
 * A reversal pill, logged through the sedation screen's own handlers so the
 * discharge hold and the totals follow. A test holds the doses and volumes to
 * the callouts.
 */
export interface ReversalPill {
  readonly key: string;
  readonly drug: ReversalDrug;
  readonly route: 'IV' | 'IM';
  readonly name: string;
  readonly dose: string;
  readonly mg: number;
  readonly sub: string;
}

interface ReversalDose {
  readonly dose: string;
  readonly mg: number;
  readonly sub: string;
}

/** The first dose, then any larger one the protocol draws (naloxone 2 mg). */
export const REVERSAL_DOSES: Readonly<
  Record<ReversalDrug, { name: string; doses: ReadonlyArray<ReversalDose> }>
> = {
  naloxone: {
    name: 'Naloxone',
    doses: [
      { dose: '0.4 mg', mg: 0.4, sub: '1.0 ml' },
      { dose: '2 mg', mg: 2, sub: '5.0 ml' },
    ],
  },
  flumazenil: { name: 'Flumazenil', doses: [{ dose: '0.2 mg', mg: 0.2, sub: '2.0 ml' }] },
};

function reversals(
  drug: ReversalDrug,
  routes: ReadonlyArray<'IV' | 'IM'>,
  firstDoseOnly = false,
): ReadonlyArray<ReversalPill> {
  const { name, doses } = REVERSAL_DOSES[drug];
  const offered = firstDoseOnly ? doses.slice(0, 1) : doses;
  return routes.flatMap((route) =>
    offered.map((d) => ({ key: `${drug} ${d.dose} ${route}`, drug, route, name, ...d })),
  );
}

/**
 * The reversal pills a step carries: in the drug box of the step that gives
 * it, and both on the Hypoventilation step that says which reverses which.
 * A step that allows the muscle ("or IM if no IV") gets an IM pill as well,
 * so the record never says IV for a dose that went into the thigh.
 */
export function reversalsFor(step: ProtocolStep): ReadonlyArray<ReversalPill> {
  const im = /\bor IM\b/.test(step.text);
  if (step.drug?.name === 'Naloxone') return reversals('naloxone', im ? ['IV', 'IM'] : ['IV']);
  if (step.drug?.name === 'Flumazenil') return reversals('flumazenil', ['IV']);
  // The Hypoventilation step only says which reverses which; the full doses
  // are on the two Oversedation pages it links to.
  if (step.drug === undefined && step.text.startsWith('Reverse:')) {
    return [...reversals('naloxone', ['IV'], true), ...reversals('flumazenil', ['IV'], true)];
  }
  return [];
}

export type TimeStamp = '911 called' | 'CPR started' | 'Shock given' | 'EMS arrived';

/**
 * The two times that belong to the call itself. They sit on the Call 911
 * card, so the steps carry only CPR and shocks.
 */
export const HELP_STAMPS: ReadonlyArray<TimeStamp> = ['911 called', 'EMS arrived'];

/** A shock can be given more than once; the others happen once. */
export const REPEATABLE_STAMPS: ReadonlySet<TimeStamp> = new Set(['Shock given']);

const STEP_STAMPS: ReadonlyArray<readonly [TimeStamp, (text: string) => boolean]> = [
  ['911 called', (t) => /911/.test(t)],
  ['CPR started', (t) => /\bCPR\b/.test(t)],
  ['Shock given', (t) => /^AED\b.*\bshock\b/.test(t) && !/no shock/.test(t)],
];

/**
 * The stamps each step of a page carries, by step index. A stamp sits on the
 * first step that names its event, so a page that says "Call 911" twice has
 * one pill for it.
 */
export function stepStamps(
  steps: ReadonlyArray<ProtocolStep>,
): ReadonlyMap<number, ReadonlyArray<TimeStamp>> {
  const out = new Map<number, TimeStamp[]>();
  for (const [stamp, names] of STEP_STAMPS) {
    const index = steps.findIndex((s) => names(s.text));
    if (index >= 0) out.set(index, [...(out.get(index) ?? []), stamp]);
  }
  return out;
}

/** The record lines these pills write, so the note can tell whether any exist. */
export const MEDICATION_GIVEN = 'Medication given';
export const RESCUE_EVENTS: ReadonlySet<string> = new Set<string>([
  MEDICATION_GIVEN,
  '911 called',
  'CPR started',
  'Shock given',
  'EMS arrived',
]);
