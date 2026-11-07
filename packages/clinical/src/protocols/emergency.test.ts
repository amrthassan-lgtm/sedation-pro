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

const INJECTABLE_ROUTES = new Set(['IV', 'IM', 'IA', 'SubQ']);

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

  it('hypertensive crisis carries labetalol then hydralazine as second-line', () => {
    const proto = findProtocol('hypertensive_crisis');
    const names = proto?.steps.map((s) => s.drug?.name).filter(Boolean);
    expect(names).toEqual(['Labetalol', 'Hydralazine']);
    const hydralazine = proto?.steps.find((s) => s.drug?.name === 'Hydralazine');
    expect(hydralazine?.drug?.concentration).toBe('20 mg/ml');
    expect(proto?.steps.some((s) => s.text.includes('no more than 25%'))).toBe(true);
  });

  it('asymptomatic hypertension gives no IV BP drug (2025 AHA/ACC)', () => {
    // Severe BP without target-organ symptoms is not lowered acutely; the
    // symptom check routes to the crisis protocol instead.
    const proto = findProtocol('hypertension');
    const names = proto?.steps.map((s) => s.drug?.name).filter(Boolean);
    expect(names).toEqual(['Midazolam']);
    expect(proto?.steps.some((s) => s.text.includes('go to Hypertensive Crisis'))).toBe(true);
  });

  it('nitroglycerin protocols carry the PDE5 windows and the 5-minute 911 rule', () => {
    for (const id of ['angina', 'mi']) {
      const c = findProtocol(id)?.contraindications?.join(' ') ?? '';
      expect(c, id).toContain('in last 24 hr');
      expect(c, id).toContain('Tadalafil (Cialis) in last 48 hr');
    }
    expect(
      findProtocol('angina')?.steps.some((s) =>
        s.text.startsWith('Pain not gone 5 min after 1st nitro'),
      ),
    ).toBe(true);
  });

  it('hypotension never suggests vagal maneuvers and covers HR 50-100 with ephedrine', () => {
    const proto = findProtocol('hypotension');
    expect(proto?.steps.some((s) => /vagal maneuver/i.test(s.text))).toBe(false);
    const eph = proto?.steps.find((s) => s.drug?.name === 'Ephedrine');
    expect(eph?.text).toContain('HR 50-100');
  });

  it('every injectable callout tells the team to label the syringe', () => {
    // Two clear syringes on a crash tray look identical; an unlabelled one is
    // how a 1 mg/ml vial gets pushed instead of a 10 mcg/ml mix.
    for (const drug of injectables()) {
      expect(`${drug.notes ?? ''} ${drug.mixFirst ?? ''}`, drug.name).toMatch(
        /label the syringe|Label it /,
      );
    }
  });

  it('every injectable callout names its syringe (1, 3 or 10 ml)', () => {
    // Owner's kit plan (2026-11): 1 ml for midazolam, 3 ml for most draws,
    // 10 ml for anything over 3 ml and every mix. D50W is prefilled.
    for (const drug of injectables()) {
      if (drug.name === 'D50W') continue;
      const text = `${drug.notes ?? ''} ${drug.mixFirst ?? ''}`;
      expect(text, drug.name).toMatch(/\b(1|3|10) ml syringe/);
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
    for (const name of ['Phenylephrine', 'Push-dose Epinephrine', 'Ephedrine']) {
      expect(byName(name)?.concentration, name).toContain('after dilution');
    }
    // The practice stocks 500 ml bags only, so every two-step recipe works in
    // one 10 ml syringe and names the waste-down step the screen emphasises.
    for (const name of ['Phenylephrine', 'Push-dose Epinephrine', 'Ephedrine']) {
      expect(byName(name)?.mixFirst, `${name} guard`).toContain('Never inject from the stock vial');
    }
    for (const name of ['Phenylephrine', 'Push-dose Epinephrine']) {
      const mix = byName(name)?.mixFirst ?? '';
      expect(mix, `${name} mixFirst`).toContain('one 10 ml syringe');
      expect(mix, `${name} mixFirst`).toContain('WASTE DOWN TO 1 ml');
      expect(mix, `${name} mixFirst`).not.toContain('100 ml NS');
    }
  });

  it('every MIX FIRST recipe reads as numbered steps ending with a label and the stock-vial guard', () => {
    for (const drug of allCallouts().filter((d) => d.mixFirst)) {
      const parts = drug.mixFirst!.split('; ');
      expect(parts[0], drug.name).toBe('MIX FIRST: one 10 ml syringe, saline from the IV bag port');
      expect(parts[1], drug.name).toMatch(/^Draw 1 ml .* \+ 9 ml saline = /);
      expect(parts.at(-2), drug.name).toMatch(/^Label it /);
      expect(parts.at(-1), drug.name).toBe('Never inject from the stock vial');
    }
  });

  it('anaphylaxis gives epinephrine IM, and IV only as the diluted push-dose', () => {
    const steps = findProtocol('anaphylaxis')?.steps ?? [];
    const im = steps.find((s) => s.drug?.name === 'Epinephrine');
    expect(im?.drug?.route).toBe('IM');
    expect(im?.text).toContain('NEVER 1 mg/ml IV');
    const push = steps.find((s) => s.drug?.name === 'Push-dose Epinephrine');
    expect(push?.drug?.concentration).toBe('10 mcg/ml (after dilution)');
    expect(push?.drug?.mixFirst).toContain('WASTE DOWN TO 1 ml');
    // Epinephrine first, 911 in parallel, and every case leaves for the ER.
    expect(steps[0]?.drug?.name).toBe('Epinephrine');
    expect(steps[1]?.text).toContain('calls 911');
    expect(steps.at(-1)?.text).toContain('goes to the ER');
  });

  it('reversal agents state the stocked concentration', () => {
    const flumazenil = allCallouts().find((d) => d.name === 'Flumazenil');
    expect(flumazenil?.concentration).toContain('0.1 mg/ml');
    const naloxone = allCallouts().find((d) => d.name === 'Naloxone');
    expect(naloxone?.concentration).toBe('0.4 mg/ml');
    // Owner's ACLS-trained protocol: 0.4 mg per vial, up to 2 mg drawn.
    const twoMg = naloxone?.drawTable?.find((r) => r.label.startsWith('2 mg'));
    expect(twoMg?.ml).toBe('5.0 ml');
    expect(flumazenil?.notes).toContain('repeat 0.2 mg every 1 min');
    expect(flumazenil?.notes).toContain('max 1.0 mg');
  });

  it('both oversedation protocols open with the airway and give naloxone first when both drugs were used', () => {
    for (const id of ['oversedation_benzo', 'oversedation_opioid']) {
      const steps = findProtocol(id)?.steps ?? [];
      expect(steps[0]?.text, id).toBe('Stop sedatives. N₂O off, 100% O₂');
      expect(
        steps.some((s) => s.text.includes('Naloxone first')),
        id,
      ).toBe(true);
      expect(steps.at(-1)?.text, id).toContain('watch');
    }
  });

  it('both rhythm cardiac lidocaine callouts carry the identical weight table', () => {
    // The intra-arterial callout uses a fixed 20-100 mg range, not the weight table.
    const lidos = allCallouts().filter((d) => d.name === 'Cardiac Lidocaine' && d.route === 'IV');
    expect(lidos.length).toBe(2);
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

  it('intra-arterial follows the DOCS manual: needle stays in, plain lidocaine into the artery, hospital', () => {
    const steps = findProtocol('intraarterial')?.steps ?? [];
    const drug = steps.find((s) => s.drug)?.drug;
    expect(drug?.name).toBe('Cardiac Lidocaine');
    expect(drug?.dose).toBe('20-100 mg');
    expect(drug?.route).toBe('IA');
    expect(drug?.notes).toContain('never with epinephrine');
    expect(steps.some((s) => s.text.startsWith('Drug given: LEAVE NEEDLE IN PLACE'))).toBe(true);
    expect(steps.some((s) => /ice/i.test(s.text))).toBe(false);
    expect(steps.at(-1)?.text).toContain('Accompany the patient');
  });

  it('MH and LAST name the unstocked rescue drugs in text only (owner decision 2026-11)', () => {
    // Dantrolene and 20% lipid are not stocked; a callout would point the
    // team at a drug the cart does not carry, so EMS is named instead.
    const mh = findProtocol('malignant_hyperthermia');
    expect(mh?.steps.some((s) => s.drug?.name === 'Dantrolene')).toBe(false);
    expect(mh?.steps.some((s) => s.text.includes('Dantrolene not stocked'))).toBe(true);
    expect(mh?.steps.some((s) => s.text.includes('MALIGNANT HYPERTHERMIA'))).toBe(true);
    const last = findProtocol('last');
    expect(last?.steps.some((s) => /lipid/i.test(s.drug?.name ?? ''))).toBe(false);
    expect(last?.steps.some((s) => s.text.includes('Lipid emulsion 20% not stocked'))).toBe(true);
    // Lidocaine is the toxin: it must never be the antiarrhythmic here.
    expect(last?.steps.some((s) => s.text.includes('NO lidocaine'))).toBe(true);
    expect(last?.steps.find((s) => s.drug)?.drug?.name).toBe('Midazolam');
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

  describe('2025 AHA adult ALS alignment', () => {
    const textOf = (id: string) => (findProtocol(id)?.steps ?? []).map((st) => st.text).join(' | ');

    it('every tachycardia protocol escalates an unstable patient to 911 first', () => {
      // The office AED cannot deliver synchronized cardioversion.
      for (const id of ['junctional_tach', 'svt', 'afib', 'stable_vtach', 'wide_complex']) {
        const first = findProtocol(id)?.steps[0];
        expect(first?.text, id).toMatch(/^Unstable .*Call 911/);
        expect(first?.severity, id).toBe('critical');
      }
    });

    it('lidocaine is the alternative to amiodarone, never an add-on', () => {
      for (const p of EMERGENCY_PROTOCOLS) {
        for (const st of p.steps) {
          if (st.drug?.name !== 'Cardiac Lidocaine' || p.id === 'intraarterial') continue;
          expect(st.text, p.id).toMatch(/^If amiodarone unavailable/);
        }
      }
    });

    it("arrest protocols put Hypoxia and sedative Toxins in the H's and T's", () => {
      for (const id of ['vfib_vtach', 'pea_asystole']) {
        expect(textOf(id), id).toContain('Hypoxia');
        expect(textOf(id), id).toMatch(/Toxins|Toxins first/);
      }
    });

    it('atropine is 1 mg wherever it appears (AHA 2025)', () => {
      const atropines = allCallouts().filter((d) => d.name === 'Atropine');
      expect(atropines.length).toBeGreaterThan(0);
      for (const d of atropines) expect(d.dose).toBe('1 mg');
    });

    it('lidocaine second dose is half the first in arrest and stable VT', () => {
      for (const id of ['vfib_vtach', 'stable_vtach']) {
        const lido = findProtocol(id)?.steps.find((st) => st.drug?.name === 'Cardiac Lidocaine');
        expect(lido?.drug?.notes, id).toContain('second dose 0.3 mg/lb');
      }
    });

    it('SVT uses the modified Valsalva and 6 mg then 12 mg adenosine', () => {
      const svt = textOf('svt');
      expect(svt).toContain('Modified Valsalva');
      expect(svt).not.toMatch(/Carotid Massage/);
      expect(svt).toContain('6 mg, then 12 mg after 1-2 minutes');
    });
  });
});
