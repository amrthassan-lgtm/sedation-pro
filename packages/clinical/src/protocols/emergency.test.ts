import { describe, expect, it } from 'vitest';

import {
  CRITICAL_PROTOCOL_IDS,
  EMERGENCY_PROTOCOLS,
  findProtocol,
  protocolsByCategory,
  type EmergencyDrugCallout,
} from './emergency';

function allCallouts(): ReadonlyArray<EmergencyDrugCallout> {
  return EMERGENCY_PROTOCOLS.flatMap((p) => p.steps)
    .map((s) => s.drug)
    .filter((d): d is EmergencyDrugCallout => d !== undefined);
}

const INJECTABLE_ROUTES = new Set(['IV', 'IM', 'SubQ']);

function injectables(): ReadonlyArray<EmergencyDrugCallout> {
  return allCallouts().filter((d) => INJECTABLE_ROUTES.has(d.route));
}

describe('emergency protocols', () => {
  it('every CRITICAL_PROTOCOL_IDS entry resolves to a protocol flagged critical', () => {
    for (const id of CRITICAL_PROTOCOL_IDS) {
      const proto = findProtocol(id);
      expect(proto, `missing protocol ${id}`).toBeDefined();
      expect(proto?.critical).toBe(true);
    }
  });

  it('findProtocol returns undefined for unknown ids', () => {
    expect(findProtocol('does-not-exist')).toBeUndefined();
  });

  it('protocolsByCategory partitions the library without dropping any protocol', () => {
    const categories = [
      'airway',
      'cardiac-ischemia',
      'cardiac-arrhythmia',
      'cardiac-arrest',
      'allergic',
      'neurological',
      'other',
    ] as const;
    const total = categories.reduce((acc, c) => acc + protocolsByCategory(c).length, 0);
    expect(total).toBe(EMERGENCY_PROTOCOLS.length);
  });

  it('every protocol has at least one step and a non-empty summary', () => {
    for (const proto of EMERGENCY_PROTOCOLS) {
      expect(proto.steps.length).toBeGreaterThan(0);
      expect(proto.summary.length).toBeGreaterThan(0);
    }
  });

  it('relatedProtocols ids all resolve', () => {
    for (const proto of EMERGENCY_PROTOCOLS) {
      for (const relId of proto.relatedProtocols ?? []) {
        expect(findProtocol(relId), `${proto.id} → ${relId}`).toBeDefined();
      }
    }
  });

  it('both hypertension protocols carry hydralazine as a second-line callout', () => {
    for (const id of ['hypertension', 'hypertensive_crisis']) {
      const proto = findProtocol(id);
      const hydralazine = proto?.steps.find((s) => s.drug?.name === 'Hydralazine');
      expect(hydralazine, `${id} missing hydralazine`).toBeDefined();
      expect(hydralazine?.drug?.concentration).toBe('20 mg/ml');
    }
  });

  it('every injectable callout carries a draw volume or a draw table', () => {
    // The callouts exist so the clinician never does mg→ml math in a
    // crisis. Non-injectable routes (inhaled/PO/SL) are exempt.
    for (const drug of injectables()) {
      expect(
        drug.volume !== undefined || drug.drawTable !== undefined,
        `${drug.name} (${drug.dose}) has no volume and no drawTable`,
      ).toBe(true);
    }
  });

  it('volume and drawTable strings follow the canonical "N.N ml" grammar', () => {
    const VOLUME = /^\d+(\.\d{1,2})?(-\d+(\.\d{1,2})?)? ml( \([^)]+\))?$/;
    const ROW_ML = /^\d+(\.\d{1,2})? ml( \([^)]+\))?$/;
    for (const drug of allCallouts()) {
      if (drug.volume !== undefined) {
        expect(drug.volume, `${drug.name} volume '${drug.volume}'`).toMatch(VOLUME);
      }
      for (const row of drug.drawTable ?? []) {
        expect(row.ml, `${drug.name} drawTable '${row.label}'`).toMatch(ROW_ML);
      }
    }
  });

  it('never writes an unspaced volume unit anywhere', () => {
    const check = (s: string | undefined, where: string) => {
      if (s === undefined) return;
      expect(s, where).not.toMatch(/\dm[lL]\b/);
      expect(s, where).not.toMatch(/\dcc\b/);
    };
    for (const p of EMERGENCY_PROTOCOLS) {
      check(p.summary, `${p.id} summary`);
      for (const step of p.steps) {
        check(step.text, `${p.id} step text`);
        check(step.drug?.volume, `${p.id} ${step.drug?.name} volume`);
        check(step.drug?.concentration, `${p.id} ${step.drug?.name} concentration`);
        check(step.drug?.notes, `${p.id} ${step.drug?.name} notes`);
        check(step.drug?.mixFirst, `${p.id} ${step.drug?.name} mixFirst`);
      }
    }
  });

  it('reserves the arrow glyph for mixFirst dilution results', () => {
    for (const p of EMERGENCY_PROTOCOLS) {
      for (const step of p.steps) {
        expect(step.text, `${p.id} step text`).not.toContain('→');
        expect(step.drug?.notes ?? '', `${p.id} ${step.drug?.name} notes`).not.toContain('→');
      }
    }
  });

  it('both atropine callouts map both stocked presentations', () => {
    const atropines = allCallouts().filter((d) => d.name === 'Atropine');
    expect(atropines.length).toBe(2);
    for (const drug of atropines) {
      const labels = (drug.drawTable ?? []).map((r) => r.label).join(' | ');
      expect(labels).toContain('1 mg/ml vial');
      expect(labels).toContain('prefilled');
    }
  });

  it('dilution-required callouts carry MIX FIRST recipes with guard phrases', () => {
    const byName = (name: string) => allCallouts().find((d) => d.name === name);
    for (const name of ['Phenylephrine', 'Push-dose Epinephrine', 'Ephedrine']) {
      const drug = byName(name);
      expect(drug?.mixFirst, `${name} mixFirst`).toMatch(/^MIX FIRST:/);
    }
    expect(byName('Phenylephrine')?.concentration).toContain('after dilution');
    expect(byName('Push-dose Epinephrine')?.concentration).toContain('never draw stock');
  });

  it('reversal agents state the stocked concentration', () => {
    const flumazenil = allCallouts().find((d) => d.name === 'Flumazenil');
    expect(flumazenil?.concentration).toContain('0.1 mg/ml');
    const naloxone = allCallouts().find((d) => d.name === 'Naloxone');
    expect(naloxone?.concentration).toBe('0.4 mg/ml');
    const twoMg = naloxone?.drawTable?.find((r) => r.label.startsWith('2 mg'));
    expect(twoMg?.ml).toBe('5.0 ml');
  });

  it('all three cardiac lidocaine callouts carry the identical weight table', () => {
    const lidos = allCallouts().filter((d) => d.name === 'Cardiac Lidocaine');
    expect(lidos.length).toBe(3);
    const tables = lidos.map((d) => JSON.stringify(d.drawTable));
    expect(tables[0]).toBeDefined();
    expect(new Set(tables).size).toBe(1);
    expect(tables[0]).toContain('150 lb');
  });

  it('adenosine maps the 12 mg escalation dose to its volume', () => {
    const adenosine = allCallouts().find((d) => d.name === 'Adenosine');
    const row = adenosine?.drawTable?.find((r) => r.label.includes('12 mg'));
    expect(row?.ml).toBe('4.0 ml');
  });

  it('seizure carries no IV-diazepam callout but keeps the knowledge in step text', () => {
    // Owner confirmation 2026-08: no IV diazepam is stocked — midazolam is
    // the office agent. A structured callout with draw volumes would point
    // at a drug that isn't in the building.
    const proto = findProtocol('seizure');
    expect(proto?.steps.some((s) => s.drug?.name === 'Diazepam')).toBe(false);
    expect(proto?.steps.some((s) => s.text.includes('diazepam'))).toBe(true);
    expect(proto?.steps.some((s) => s.drug?.name === 'Midazolam')).toBe(true);
  });

  it('hypoglycemia carries no glucagon callout but keeps the knowledge in step text', () => {
    // Owner decision 2026-08: glucagon is deliberately not stocked (IV
    // office — immediate access + D50W is the no-IV branch). A structured
    // callout would point the clinician at a drug the cart doesn't carry.
    const proto = findProtocol('hypoglycemia');
    expect(proto?.steps.some((s) => s.drug?.name === 'Glucagon')).toBe(false);
    expect(proto?.steps.some((s) => s.text.includes('Glucagon'))).toBe(true);
  });

  it('dexamethasone callouts quote both concentrations with in-office stock first', () => {
    const dexCallouts = allCallouts().filter((d) => d.name === 'Dexamethasone');
    expect(dexCallouts.length).toBeGreaterThan(0);
    for (const callout of dexCallouts) {
      const conc = callout.concentration ?? '';
      expect(conc).toContain('4 mg/ml');
      expect(conc).toContain('10 mg/ml');
      expect(conc.indexOf('4 mg/ml')).toBeLessThan(conc.indexOf('10 mg/ml'));
    }
  });
});
