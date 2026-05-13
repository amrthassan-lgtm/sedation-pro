import type { DrugCategory, Route } from '../types';

/**
 * A drug entry in the formulary. Drugs are *data*, not constants — practices
 * can ship their own formulary by passing a `Formulary` into engine
 * functions. The `id` is the stable key used for lookups and dose recording.
 */
export interface DrugEntry {
  /** Stable lookup key — e.g. `'versed'`. */
  readonly id: string;
  /** Display name — e.g. `'Midazolam (Versed)'`. */
  readonly name: string;
  /** Short label for chips/badges — e.g. `'Versed'`. */
  readonly shortName: string;
  /** Pharmacological class — drives synergy and reversal rules. */
  readonly category: DrugCategory;
  /** Concentration expressed as mass per millilitre. */
  readonly concentration: Concentration;
  /** Default administration route. */
  readonly route: Route;
  /** Optional UI tint (CSS color string). */
  readonly color?: string;
  /** Optional human notes — printed labels, tape colour, etc. */
  readonly notes?: string;
}

/** Mass per millilitre — separates value from unit so display is unambiguous. */
export interface Concentration {
  readonly value: number;
  readonly unit: 'mg/ml' | 'mcg/ml';
}

/** IV-administered drug. */
export interface IVDrug extends DrugEntry {
  readonly route: 'IV';
  /**
   * Minimum minutes that must pass between consecutive doses (clinical safety
   * minimum, not a re-dosing recommendation).
   */
  readonly minWaitMin: number;
  /**
   * Minutes after dose at which the drug is considered "ready" — past the
   * minimum wait and within the typical onset/peak window. UI shows a green
   * indicator at this point.
   */
  readonly readyAtMin?: number;
  /** Whether this entry is a reversal agent. */
  readonly isReversal?: boolean;
}

/** Oral pre-op anxiolytic. */
export interface OralDrug extends DrugEntry {
  readonly route: 'PO';
}

/** Bedtime / take-home anxiolytic. */
export interface BedtimeDrug extends DrugEntry {
  readonly route: 'PO';
}

/**
 * Local anesthetic carpule. `maxDoseMgPerKg` and `halfLifeMin` are clinical
 * constants per drug — the Malamed combined-percent calculation uses these
 * together with current weight.
 */
export interface LocalAnesthetic {
  readonly id: string;
  readonly name: string;
  /** mg per 1.8 ml carpule. */
  readonly mgPerCarpule: number;
  /** Max safe single-session dose in mg/kg (with epinephrine when applicable). */
  readonly maxDoseMgPerKg: number;
  /** Distribution half-life in minutes (used for active-dose decay). */
  readonly halfLifeMin: number;
  /** UI tint. */
  readonly color?: string;
}

/** Per-drug IV ceilings and synergy adjustments. */
export interface IVCeilings {
  /** Hard cap on cumulative Versed (midazolam) in mg. */
  readonly versedMaxMg: number;
  /** Hard cap on cumulative Fentanyl in mcg. */
  readonly fentanylMaxMcg: number;
  /**
   * Fractional reduction applied to the benzodiazepine ceiling when an opioid
   * is on board. 0.30 = 30% reduction (Apex default). Range [0, 1).
   */
  readonly benzoOpioidSynergyReduction: number;
}

/** Wait windows used by timers and release-eligibility logic. */
export interface FormularyTimings {
  /** Minimum minutes between Versed doses (clinical safety floor). */
  readonly versedMinWaitMin: number;
  /** Minutes after Versed dose at which "ready" indicator appears. */
  readonly versedReadyMin: number;
  /** Minimum minutes between Fentanyl doses. */
  readonly fentanylMinWaitMin: number;
  /** Minutes to wait after oral pre-med before starting IV. */
  readonly premedWaitMin: number;
  /** Default minutes to wait after last IV med before IV-out / release. */
  readonly releaseWaitMin: number;
  /** Extended wait when flumazenil reversal was given. */
  readonly flumazenilDischargeWaitMin: number;
}

/** Complete formulary surface — practices can ship their own. */
export interface Formulary {
  readonly iv: ReadonlyArray<IVDrug>;
  readonly oral: ReadonlyArray<OralDrug>;
  readonly bedtime: ReadonlyArray<BedtimeDrug>;
  readonly locals: ReadonlyArray<LocalAnesthetic>;
  readonly ceilings: IVCeilings;
  readonly timings: FormularyTimings;
}
