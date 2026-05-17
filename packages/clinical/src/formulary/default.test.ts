import { describe, expect, it } from 'vitest';

import { DEFAULT_FORMULARY } from './default';

describe('DEFAULT_FORMULARY', () => {
  it('ships the five IV drugs the legacy app expects', () => {
    const ids = DEFAULT_FORMULARY.iv.map((d) => d.id).sort();
    expect(ids).toEqual(['fentanyl', 'flumazenil', 'naloxone', 'versed', 'zofran']);
  });

  it('marks reversal agents and assigns them the correct category', () => {
    const flumazenil = DEFAULT_FORMULARY.iv.find((d) => d.id === 'flumazenil');
    const naloxone = DEFAULT_FORMULARY.iv.find((d) => d.id === 'naloxone');
    expect(flumazenil?.isReversal).toBe(true);
    expect(flumazenil?.category).toBe('benzodiazepine-reversal');
    expect(naloxone?.isReversal).toBe(true);
    expect(naloxone?.category).toBe('opioid-reversal');
  });

  it('pins Versed and Fentanyl wait windows the timer UI depends on', () => {
    const versed = DEFAULT_FORMULARY.iv.find((d) => d.id === 'versed');
    const fentanyl = DEFAULT_FORMULARY.iv.find((d) => d.id === 'fentanyl');
    expect(versed?.minWaitMin).toBe(3);
    expect(versed?.readyAtMin).toBe(5);
    expect(fentanyl?.minWaitMin).toBe(5);
  });

  it('ships the five local anesthetics with max-dose and half-life data', () => {
    expect(DEFAULT_FORMULARY.locals).toHaveLength(5);
    for (const la of DEFAULT_FORMULARY.locals) {
      expect(la.maxDoseMgPerKg).toBeGreaterThan(0);
      expect(la.halfLifeMin).toBeGreaterThan(0);
      expect(la.mgPerCarpule).toBeGreaterThan(0);
    }
  });

  it('encodes the Apex IV ceilings and 30% benzo-opioid synergy reduction', () => {
    expect(DEFAULT_FORMULARY.ceilings.versedMaxMg).toBe(15);
    expect(DEFAULT_FORMULARY.ceilings.fentanylMaxMcg).toBe(100);
    expect(DEFAULT_FORMULARY.ceilings.benzoOpioidSynergyReduction).toBeCloseTo(0.3);
  });

  it('gives every oral anxiolytic scannable card attributes with one safety-toned slot', () => {
    for (const drug of DEFAULT_FORMULARY.oral) {
      expect(drug.attributes && drug.attributes.length).toBeGreaterThan(0);
      for (const attr of drug.attributes ?? []) {
        expect(attr.label.length).toBeGreaterThan(0);
        expect(attr.value.length).toBeGreaterThan(0);
        if (attr.tone !== undefined) expect(['caution', 'limit']).toContain(attr.tone);
      }
    }
    // Triazolam carries the Versed-synergy caution; hydroxyzine the
    // no-reversal hard limit — both must be tone-flagged, not buried.
    const triazolam = DEFAULT_FORMULARY.oral.find((d) => d.id === 'triazolam');
    const hydroxyzine = DEFAULT_FORMULARY.oral.find((d) => d.id === 'hydroxyzine');
    expect(triazolam?.attributes?.some((a) => a.tone === 'caution')).toBe(true);
    expect(hydroxyzine?.attributes?.some((a) => a.tone === 'limit')).toBe(true);
  });

  it('flags the bedtime diazepam OSA contraindication as a tone-limited attribute', () => {
    const diazepam = DEFAULT_FORMULARY.bedtime.find((d) => d.id === 'diazepam');
    expect(diazepam?.attributes?.length).toBeGreaterThan(0);
    expect(diazepam?.attributes?.some((a) => a.tone === 'limit')).toBe(true);
  });

  it('encodes the standard wait windows', () => {
    expect(DEFAULT_FORMULARY.timings.premedWaitMin).toBe(30);
    expect(DEFAULT_FORMULARY.timings.releaseWaitMin).toBe(20);
    expect(DEFAULT_FORMULARY.timings.flumazenilDischargeWaitMin).toBe(120);
  });
});
