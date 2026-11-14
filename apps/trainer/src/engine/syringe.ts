/**
 * What is physically in a syringe on the training tray.
 *
 * The model is deliberately literal: millilitres in the barrel and
 * micrograms of drug dissolved in them. Every bench move (draw from a vial,
 * draw saline, squirt out, push) is arithmetic on those two numbers, so a
 * skipped "waste down to 1 ml" leaves exactly the 10x-too-strong mix it
 * leaves in real life, and the simulator can show the consequence instead of
 * asserting it.
 */

export type SyringeSize = 1 | 3 | 10;

export interface StockVial {
  /** Stable key, also the drug identity in the sim ("epinephrine"). */
  readonly key: string;
  /** Name as the team says it. */
  readonly name: string;
  /** Presentation as stocked, e.g. "1 mg/ml ampule". */
  readonly presentation: string;
  readonly mcgPerMl: number;
  /** CSS colour for the fluid, matching the clinical app's syringe tint. */
  readonly tint: string;
}

export type BenchMove =
  | {
      readonly kind: 'drug';
      readonly ml: number;
      readonly drug: string;
      readonly presentation: string;
    }
  | { readonly kind: 'saline'; readonly ml: number }
  | { readonly kind: 'waste'; readonly toMl: number }
  | { readonly kind: 'label' }
  | { readonly kind: 'give'; readonly ml: number; readonly route: 'IV' | 'IM' };

export interface Syringe {
  readonly id: string;
  readonly sizeMl: SyringeSize;
  readonly volumeMl: number;
  /** `null` until a drug has been drawn (a syringe of plain saline). */
  readonly drugKey: string | null;
  readonly drugName: string | null;
  readonly drugMcg: number;
  readonly tint: string | null;
  readonly labeled: boolean;
  readonly moves: ReadonlyArray<BenchMove>;
}

/** Plunger positions snap to 0.1 ml, the finest mark on any of the syringes. */
export function snapMl(ml: number): number {
  return Math.round(ml * 10) / 10;
}

export function emptySyringe(id: string, sizeMl: SyringeSize): Syringe {
  return {
    id,
    sizeMl,
    volumeMl: 0,
    drugKey: null,
    drugName: null,
    drugMcg: 0,
    tint: null,
    labeled: false,
    moves: [],
  };
}

export function roomMl(s: Syringe): number {
  return snapMl(s.sizeMl - s.volumeMl);
}

export function concentrationMcgPerMl(s: Syringe): number {
  return s.volumeMl > 0 ? s.drugMcg / s.volumeMl : 0;
}

/** A second drug never goes into a syringe that already holds one. */
export function canDrawFrom(s: Syringe, vial: StockVial): boolean {
  return (s.drugKey === null || s.drugKey === vial.key) && roomMl(s) > 0;
}

export function drawDrug(s: Syringe, vial: StockVial, ml: number): Syringe {
  const amount = Math.min(snapMl(ml), roomMl(s));
  if (amount <= 0 || !canDrawFrom(s, vial)) return s;
  return {
    ...s,
    volumeMl: snapMl(s.volumeMl + amount),
    drugKey: vial.key,
    drugName: vial.name,
    drugMcg: s.drugMcg + amount * vial.mcgPerMl,
    tint: vial.tint,
    moves: [
      ...s.moves,
      { kind: 'drug', ml: amount, drug: vial.name, presentation: vial.presentation },
    ],
  };
}

export function drawSaline(s: Syringe, ml: number): Syringe {
  const amount = Math.min(snapMl(ml), roomMl(s));
  if (amount <= 0) return s;
  return {
    ...s,
    volumeMl: snapMl(s.volumeMl + amount),
    moves: [...s.moves, { kind: 'saline', ml: amount }],
  };
}

/** Squirt out down to `toMl`. The mix is uniform, so drug leaves in proportion. */
export function wasteTo(s: Syringe, toMl: number): Syringe {
  const target = Math.max(0, snapMl(toMl));
  if (target >= s.volumeMl) return s;
  const kept = s.volumeMl === 0 ? 0 : target / s.volumeMl;
  return {
    ...s,
    volumeMl: target,
    drugMcg: s.drugMcg * kept,
    moves: [...s.moves, { kind: 'waste', toMl: target }],
  };
}

export function label(s: Syringe): Syringe {
  if (s.labeled) return s;
  return { ...s, labeled: true, moves: [...s.moves, { kind: 'label' }] };
}

export interface Push {
  readonly syringe: Syringe;
  readonly ml: number;
  readonly mcg: number;
}

/** Push `ml` into the patient; what is left stays on the tray for the next push. */
export function give(s: Syringe, ml: number, route: 'IV' | 'IM'): Push {
  const amount = Math.min(snapMl(ml), s.volumeMl);
  if (amount <= 0) return { syringe: s, ml: 0, mcg: 0 };
  const mcg = s.drugMcg * (amount / s.volumeMl);
  return {
    ml: amount,
    mcg,
    syringe: {
      ...s,
      volumeMl: snapMl(s.volumeMl - amount),
      drugMcg: s.drugMcg - mcg,
      moves: [...s.moves, { kind: 'give', ml: amount, route }],
    },
  };
}

/** What the tray shows: the label if there is one, otherwise an honest blank. */
export function trayName(s: Syringe): string {
  if (!s.labeled) return 'Unlabeled syringe';
  return s.drugName === null ? 'Saline' : s.drugName.toUpperCase();
}
