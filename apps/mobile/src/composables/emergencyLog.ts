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
    const m = WEIGHT_ROW.exec(row.label);
    return m?.[1] !== undefined && m[2] !== undefined
      ? [{ key: m[2], dose: m[2], route: drug.route, sub: `${m[1]} · ${row.ml}` }]
      : [];
  });
  if (byWeight.length > 0) return byWeight;

  const doses = new Map<string, Set<string>>();
  for (const row of rows) {
    const dose = DOSE_ROW.exec(row.label)?.[1];
    if (dose === undefined) continue;
    doses.set(dose, (doses.get(dose) ?? new Set()).add(row.ml));
  }
  if (doses.size > 0) {
    return [...doses].map(([dose, volumes]) => ({
      key: dose,
      dose,
      route: drug.route,
      // One dose listed at two strengths has no single volume to show.
      sub: volumes.size === 1 ? ([...volumes][0] ?? '') : '',
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

export type ReversalDrug = 'naloxone' | 'flumazenil';

/**
 * A reversal pill, logged through the sedation screen's own handlers so the
 * discharge hold and the totals follow. The doses are those handlers' fixed
 * doses; a test holds the volumes to the callouts.
 */
export interface ReversalPill {
  readonly key: string;
  readonly drug: ReversalDrug;
  readonly route: 'IV' | 'IM';
  readonly name: string;
  readonly dose: string;
  readonly sub: string;
}

export const REVERSAL_DOSE: Readonly<
  Record<ReversalDrug, { name: string; dose: string; sub: string }>
> = {
  naloxone: { name: 'Naloxone', dose: '0.4 mg', sub: '1.0 ml' },
  flumazenil: { name: 'Flumazenil', dose: '0.2 mg', sub: '2.0 ml' },
};

function reversal(drug: ReversalDrug, route: 'IV' | 'IM'): ReversalPill {
  return { key: `${drug} ${route}`, drug, route, ...REVERSAL_DOSE[drug] };
}

/**
 * The reversal pills a step carries: in the drug box of the step that gives
 * it, and both on the Hypoventilation step that says which reverses which.
 * A step that allows the muscle ("or IM if no IV") gets an IM pill as well,
 * so the record never says IV for a dose that went into the thigh.
 */
export function reversalsFor(step: ProtocolStep): ReadonlyArray<ReversalPill> {
  const im = /\bor IM\b/.test(step.text);
  if (step.drug?.name === 'Naloxone') {
    return im
      ? [reversal('naloxone', 'IV'), reversal('naloxone', 'IM')]
      : [reversal('naloxone', 'IV')];
  }
  if (step.drug?.name === 'Flumazenil') return [reversal('flumazenil', 'IV')];
  if (step.drug === undefined && step.text.startsWith('Reverse:')) {
    return [reversal('naloxone', 'IV'), reversal('flumazenil', 'IV')];
  }
  return [];
}

export type TimeStamp = '911 called' | 'CPR started' | 'Shock given' | 'EMS arrived';

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
