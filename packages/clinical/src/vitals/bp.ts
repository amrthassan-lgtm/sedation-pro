import type { Severity } from '../types';

/**
 * Blood-pressure classification using AHA 2017+ adult thresholds.
 *
 * | Category               | SBP            | DBP            |
 * | ---------------------- | -------------- | -------------- |
 * | normal                 | < 120          | < 80           |
 * | elevated               | 120-129        | < 80           |
 * | stage-1 hypertension   | 130-139        | or 80-89       |
 * | stage-2 hypertension   | ≥ 140          | or ≥ 90        |
 * | hypertensive crisis    | ≥ 180          | or ≥ 120       |
 *
 * Stage 2 also flags as a `caution` severity if SBP > 159 or DBP > 99 — the
 * legacy app shows a "consider deferring" banner at that threshold.
 */
export type BpCategory = 'normal' | 'elevated' | 'stage-1' | 'stage-2' | 'crisis';

export interface BpResult {
  readonly category: BpCategory;
  readonly severity: Severity;
  readonly sbp: number;
  readonly dbp: number;
}

export function classifyBp(sbp: number, dbp: number): BpResult | null {
  if (!Number.isFinite(sbp) || !Number.isFinite(dbp)) return null;
  if (sbp <= 0 || dbp <= 0) return null;

  if (sbp >= 180 || dbp >= 120) {
    return { category: 'crisis', severity: 'crisis', sbp, dbp };
  }
  if (sbp >= 140 || dbp >= 90) {
    const severity: Severity = sbp > 159 || dbp > 99 ? 'limit' : 'caution';
    return { category: 'stage-2', severity, sbp, dbp };
  }
  if (sbp >= 130 || dbp >= 80) {
    return { category: 'stage-1', severity: 'caution', sbp, dbp };
  }
  if (sbp >= 120) {
    return { category: 'elevated', severity: 'caution', sbp, dbp };
  }
  return { category: 'normal', severity: 'safe', sbp, dbp };
}
