import { describe, expect, it } from 'vitest';

import { EMERGENCY_PROTOCOLS } from './emergency';
import { EMERGENCY_TINT_NAMES, emergencySyringeTint } from './syringe-tint';

const callouts = EMERGENCY_PROTOCOLS.flatMap((p) =>
  p.steps.flatMap((s) => (s.drug === undefined ? [] : [s.drug])),
);

describe('emergency syringe colours', () => {
  it('a pressor is solid purple at stock strength and pale once diluted', () => {
    for (const name of ['Epinephrine', 'Push-dose Epinephrine', 'Ephedrine', 'Phenylephrine']) {
      expect(emergencySyringeTint(name), name).toBe('var(--color-purple)');
      expect(emergencySyringeTint(name, true), name).toBe('var(--color-purple-pale)');
    }
  });

  it('only a pressor changes colour with dilution', () => {
    expect(emergencySyringeTint('Atropine', true)).toBe(emergencySyringeTint('Atropine'));
    expect(emergencySyringeTint('Amiodarone', true)).toBe(emergencySyringeTint('Amiodarone'));
  });

  it('atropine is green, the paralytic is red, and the rest make no claim', () => {
    expect(emergencySyringeTint('Atropine')).toBe('var(--color-green)');
    expect(emergencySyringeTint('Succinylcholine')).toBe('var(--color-red)');
    for (const name of [
      'Adenosine',
      'Amiodarone',
      'Cardiac Lidocaine',
      'Dexamethasone',
      'Diphenhydramine',
      'Hydralazine',
      'Labetalol',
      'Methylprednisolone (Solu-Medrol)',
    ]) {
      expect(emergencySyringeTint(name), name).toBe('var(--color-slate)');
    }
  });

  it('has no colour for a drug it does not know', () => {
    expect(emergencySyringeTint('Midazolam')).toBeUndefined();
    expect(emergencySyringeTint('Albuterol')).toBeUndefined();
  });

  it('every name in the table is a callout some protocol still uses', () => {
    const used = new Set(callouts.map((c) => c.name));
    for (const name of EMERGENCY_TINT_NAMES) expect(used.has(name), name).toBe(true);
  });

  it('every MIX FIRST callout is a pressor, so every mix is drawn pale', () => {
    for (const c of callouts.filter((d) => d.mixFirst !== undefined)) {
      expect(emergencySyringeTint(c.name, true), c.name).toBe('var(--color-purple-pale)');
    }
  });
});
