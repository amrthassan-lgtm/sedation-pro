import { DEFAULT_FORMULARY } from '../formulary/default';
import type { IVCeilings } from '../formulary/types';
import type { Severity } from '../types';

/**
 * Effective Versed (midazolam) ceiling in mg, accounting for benzo-opioid
 * synergy when any opioid is on board.
 *
 * The legacy app applies this to fentanyl specifically; here we generalise to
 * "any opioid given" so practices that swap opioids inherit the same safety
 * behaviour.
 */
export function versedCeilingMg(
  opioidOnBoard: boolean,
  ceilings: IVCeilings = DEFAULT_FORMULARY.ceilings,
): number {
  const base = ceilings.versedMaxMg;
  if (!opioidOnBoard) return base;
  const reduction = clampUnit(ceilings.benzoOpioidSynergyReduction);
  return base * (1 - reduction);
}

/**
 * Per-drug + combined IV sedation status. The legacy UI shows a percentage
 * and a severity badge for Versed, Fentanyl, and their combined load; this
 * function produces both in one pass so the UI can render without
 * recomputing.
 */
export interface IVSedationStatus {
  readonly versed: DrugCeilingStatus;
  readonly fentanyl: DrugCeilingStatus;
  readonly combined: CombinedSedationStatus;
}

export interface DrugCeilingStatus {
  /** Cumulative dose given (mg for Versed, mcg for Fentanyl). */
  readonly given: number;
  /** Effective ceiling at the time of computation. */
  readonly ceiling: number;
  /** `given / ceiling` × 100. Capped to 200 to keep displays bounded. */
  readonly percent: number;
  /** Severity bucket — drives colour + label. */
  readonly severity: Severity;
}

export interface CombinedSedationStatus {
  /** Average of Versed % and Fentanyl % — matches the legacy UI's metric. */
  readonly percent: number;
  readonly severity: Severity;
}

export function ivSedationStatus(
  versedMgGiven: number,
  fentanylMcgGiven: number,
  ceilings: IVCeilings = DEFAULT_FORMULARY.ceilings,
): IVSedationStatus {
  const opioidOnBoard = fentanylMcgGiven > 0;
  const versedCeiling = versedCeilingMg(opioidOnBoard, ceilings);
  const versed = drugStatus(versedMgGiven, versedCeiling);
  const fentanyl = drugStatus(fentanylMcgGiven, ceilings.fentanylMaxMcg);
  const combinedPercent = (versed.percent + fentanyl.percent) / 2;
  return {
    versed,
    fentanyl,
    combined: {
      percent: combinedPercent,
      severity: severityForPercent(combinedPercent),
    },
  };
}

function drugStatus(given: number, ceiling: number): DrugCeilingStatus {
  if (ceiling <= 0) {
    return { given, ceiling, percent: 0, severity: 'safe' };
  }
  const raw = (given / ceiling) * 100;
  const percent = Math.min(raw, 200);
  return { given, ceiling, percent, severity: severityForPercent(percent) };
}

function severityForPercent(p: number): Severity {
  if (p >= 100) return 'limit';
  if (p >= 90) return 'limit';
  if (p >= 70) return 'caution';
  return 'safe';
}

function clampUnit(x: number): number {
  if (!Number.isFinite(x) || x < 0) return 0;
  if (x >= 1) return 0.999;
  return x;
}
