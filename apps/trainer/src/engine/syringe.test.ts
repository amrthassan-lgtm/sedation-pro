import { describe, expect, it } from 'vitest';

import {
  canDrawFrom,
  concentrationMcgPerMl,
  drawDrug,
  drawSaline,
  emptySyringe,
  give,
  label,
  trayName,
  wasteTo,
  type StockVial,
} from './syringe';

const EPI: StockVial = {
  key: 'epinephrine',
  name: 'Epinephrine',
  presentation: '1 mg/ml ampule',
  mcgPerMl: 1_000,
  tint: 'purple',
};
const NALOXONE: StockVial = {
  key: 'naloxone',
  name: 'Naloxone',
  presentation: '0.4 mg/ml vial',
  mcgPerMl: 400,
  tint: 'red',
};

describe('the syringe on the tray', () => {
  it('holds what was drawn, to the tenth of a millilitre', () => {
    const s = drawDrug(emptySyringe('a', 3), NALOXONE, 1);
    expect(s.volumeMl).toBe(1);
    expect(s.drugMcg).toBe(400);
    expect(concentrationMcgPerMl(s)).toBe(400);
  });

  it('cannot be overfilled', () => {
    const s = drawDrug(emptySyringe('a', 3), NALOXONE, 9);
    expect(s.volumeMl).toBe(3);
    expect(drawSaline(s, 1)).toBe(s);
  });

  it('never takes a second drug', () => {
    const s = drawDrug(emptySyringe('a', 3), NALOXONE, 1);
    expect(canDrawFrom(s, EPI)).toBe(false);
    expect(drawDrug(s, EPI, 1)).toBe(s);
  });

  it('the push-dose recipe lands on 10 mcg/ml', () => {
    let s = emptySyringe('mix', 10);
    s = drawDrug(s, EPI, 1);
    s = drawSaline(s, 9);
    expect(concentrationMcgPerMl(s)).toBeCloseTo(100, 6);
    s = wasteTo(s, 1);
    s = drawSaline(s, 9);
    expect(s.volumeMl).toBe(10);
    expect(concentrationMcgPerMl(s)).toBeCloseTo(10, 6);
    const push = give(label(s), 2, 'IV');
    expect(push.mcg).toBeCloseTo(20, 6);
    expect(push.syringe.volumeMl).toBe(8);
    expect(concentrationMcgPerMl(push.syringe)).toBeCloseTo(10, 6);
  });

  it('skipping the waste step leaves a mix ten times too strong', () => {
    let s = emptySyringe('mix', 10);
    s = drawDrug(s, EPI, 1);
    s = drawSaline(s, 9);
    expect(give(s, 1, 'IV').mcg).toBeCloseTo(100, 6);
  });

  it('shows no name until it is labeled', () => {
    const s = drawDrug(emptySyringe('a', 3), EPI, 0.3);
    expect(trayName(s)).toBe('Unlabeled syringe');
    expect(trayName(label(s))).toBe('EPINEPHRINE');
    expect(label(label(s)).moves.filter((m) => m.kind === 'label')).toHaveLength(1);
  });

  it('records every move for the debrief', () => {
    let s = emptySyringe('a', 3);
    s = drawDrug(s, EPI, 0.3);
    s = give(label(s), 0.3, 'IM').syringe;
    expect(s.moves.map((m) => m.kind)).toEqual(['drug', 'label', 'give']);
    expect(s.volumeMl).toBe(0);
  });
});
