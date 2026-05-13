import { DEFAULT_FORMULARY } from '../formulary/default';
import type { LocalAnesthetic } from '../formulary/types';
import type { Millis, Severity } from '../types';

import { decayActiveDose } from './half-life';

const LB_PER_KG = 2.20462;

/**
 * A single local-anesthetic administration. `givenAt` is when the carpule(s)
 * were injected — the engine decays the dose from this point using the drug's
 * half-life.
 */
export interface LocalDose {
  /** Drug id from the formulary. */
  readonly drugId: string;
  /** Number of carpules administered in this entry. */
  readonly carpules: number;
  /** Epoch ms when the dose was given. */
  readonly givenAt: Millis;
}

/** Per-drug active-load breakdown. */
export interface LocalDrugLoad {
  readonly drugId: string;
  readonly name: string;
  readonly carpulesGiven: number;
  readonly totalMgGiven: number;
  readonly activeMg: number;
  readonly maxMg: number;
  readonly percent: number;
  readonly severity: Severity;
}

export interface LocalCombinedResult {
  /** Per-drug breakdown, in input order (deduplicated by drugId). */
  readonly perDrug: ReadonlyArray<LocalDrugLoad>;
  /** Sum of per-drug `percent`. The Malamed rule keeps this ≤ 100. */
  readonly combinedPercent: number;
  /** Severity classification of the combined %. */
  readonly severity: Severity;
}

/**
 * Compute Malamed combined-percent toxicity for a series of local-anesthetic
 * doses. Each drug's *active* contribution is the half-life-decayed mg as of
 * `now`, divided by `maxDoseMgPerKg × weightKg`. The combined percentage is
 * the sum of those per-drug percentages — practitioners keep the combined
 * value ≤ 100% per Malamed's protocol.
 */
export function localCombined(
  doses: ReadonlyArray<LocalDose>,
  weightLb: number,
  now: Millis,
  formulary: ReadonlyArray<LocalAnesthetic> = DEFAULT_FORMULARY.locals,
): LocalCombinedResult {
  if (!Number.isFinite(weightLb) || weightLb <= 0) {
    return { perDrug: [], combinedPercent: 0, severity: 'safe' };
  }
  const weightKg = weightLb / LB_PER_KG;
  const byId = new Map<string, LocalAnesthetic>(formulary.map((d) => [d.id, d]));

  // Group doses by drugId, summing total mg given and active mg as of `now`.
  type Accum = { drug: LocalAnesthetic; carpules: number; totalMg: number; activeMg: number };
  const acc = new Map<string, Accum>();
  for (const dose of doses) {
    const drug = byId.get(dose.drugId);
    if (!drug) continue;
    if (dose.carpules <= 0) continue;
    const doseMg = dose.carpules * drug.mgPerCarpule;
    const elapsedMin = Math.max(0, (now - dose.givenAt) / 60_000);
    const activeMg = decayActiveDose(doseMg, elapsedMin, drug.halfLifeMin);
    const entry = acc.get(drug.id) ?? { drug, carpules: 0, totalMg: 0, activeMg: 0 };
    entry.carpules += dose.carpules;
    entry.totalMg += doseMg;
    entry.activeMg += activeMg;
    acc.set(drug.id, entry);
  }

  const perDrug: LocalDrugLoad[] = [];
  let combinedPercent = 0;
  for (const { drug, carpules, totalMg, activeMg } of acc.values()) {
    const maxMg = drug.maxDoseMgPerKg * weightKg;
    const percent = maxMg > 0 ? (activeMg / maxMg) * 100 : 0;
    combinedPercent += percent;
    perDrug.push({
      drugId: drug.id,
      name: drug.name,
      carpulesGiven: carpules,
      totalMgGiven: totalMg,
      activeMg,
      maxMg,
      percent,
      severity: severityForPercent(percent),
    });
  }

  return {
    perDrug,
    combinedPercent,
    severity: severityForPercent(combinedPercent),
  };
}

function severityForPercent(p: number): Severity {
  if (p >= 100) return 'limit';
  if (p >= 90) return 'limit';
  if (p >= 70) return 'caution';
  return 'safe';
}
